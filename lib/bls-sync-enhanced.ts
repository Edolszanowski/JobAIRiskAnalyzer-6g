import { BLSService } from "./bls-service"
import { sqlEnhanced, validateJobData, withTransaction } from "./database-enhanced"
import { RetryableError, withRetry } from "./error-handler"
import { EventEmitter } from "events"
import { initializeBLSApiKeys, loadBLSApiKeys } from "./api-keys-helper"

// ========== TYPES AND INTERFACES ==========

export interface SyncConfig {
  maxConcurrent: number
  batchSize: number
  retryAttempts: number
  baseRetryDelayMs: number
  maxRetryDelayMs: number
  validateData: boolean
  healthCheckIntervalMs: number
  resumeFromLastCheckpoint: boolean
  progressUpdateIntervalMs: number
}

export interface SyncProgress {
  isRunning: boolean
  totalJobs: number
  processedJobs: number
  successfulJobs: number
  failedJobs: number
  skippedJobs: number
  currentBatch?: number
  totalBatches?: number
  currentJob?: string
  lastError?: string
  lastErrorTime?: string
  startTime: string | null
  endTime: string | null
  estimatedTimeRemaining?: number
  lastUpdated: string
  checkpoints: SyncCheckpoint[]
  apiKeysStatus: {
    totalKeys: number
    totalDailyLimit: number
    totalRemainingRequests: number
    keyStatuses: Array<{
      keyPreview: string
      requestsUsed: number
      requestsRemaining: number
      isBlocked: boolean
    }>
  }
}

export interface SyncCheckpoint {
  timestamp: string
  processedJobs: number
  successfulJobs: number
  failedJobs: number
  lastProcessedCode?: string
  batchNumber: number
}

export interface SyncResult {
  success: boolean
  message: string
  stats: {
    totalJobs: number
    processedJobs: number
    successfulJobs: number
    failedJobs: number
    skippedJobs: number
    startTime: string
    endTime: string
    durationMs: number
  }
  errors?: Array<{
    code: string
    error: string
    retryable: boolean
  }>
}

export interface JobData {
  occ_code: string
  occ_title: string
  employment_2023?: number
  projected_employment_2033?: number
  median_wage?: number
  ai_impact_score?: number
  automation_risk?: string
  skills_at_risk?: string[]
  skills_needed?: string[]
  future_outlook?: string
}

// ========== CONFIGURATION ==========

// Default sync configuration
export const defaultSyncConfig: SyncConfig = {
  // Original aggressive desktop-style defaults.
  // They will be automatically overridden by the conservative
  // `serverlessDefaults` below when deployed to a serverless
  // provider (e.g. Vercel / AWS Lambda).
  maxConcurrent: 5,
  batchSize: 50,
  retryAttempts: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  validateData: true,
  healthCheckIntervalMs: 60000, // 1 minute
  resumeFromLastCheckpoint: true,
  progressUpdateIntervalMs: 1000, // 1 second
}

/**
 * More conservative defaults for serverless / edge runtimes where
 * simultaneous outbound connections and long-lived tasks are prone
 * to `ECONNRESET` and memory pressure.
 */
const serverlessDefaults: Partial<SyncConfig> = {
  maxConcurrent: 2,
  batchSize: 10,
  retryAttempts: 5,
  baseRetryDelayMs: 2_000,   // start at 2 s
  maxRetryDelayMs: 60_000,   // cap at 60 s
}

/**
 * Detects if the current process is running inside a typical serverless / edge
 * environment.  This is a best-effort heuristic based on widely-used
 * environment variables.  It can be extended if new providers are added.
 */
function isServerlessRuntime(): boolean {
  // Vercel sets `VERCEL="1"` in every serverless / edge function.
  if (process.env.VERCEL === "1") return true
  // AWS Lambda exposes the function name in this variable.
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true
  // The Next.js edge runtime sets NEXT_RUNTIME to "edge".
  if (process.env.NEXT_RUNTIME === "edge") return true
  return false
}

// ========== ENHANCED BLS SYNC SERVICE ==========

export class BLSSyncService extends EventEmitter {
  private blsService: BLSService
  private config: SyncConfig
  private syncProgress: SyncProgress
  private syncAbortController: AbortController | null = null
  private progressUpdateInterval: NodeJS.Timeout | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private occupationCodes: string[] = []
  private occupationTitles: Record<string, string> = {}
  private lastProcessingTime: number[] = []

  constructor(
    apiKeys: string | string[] = [],
    config: Partial<SyncConfig> = {},
    occupationCodes?: string[],
    occupationTitles?: Record<string, string>
  ) {
    super()
    
    // Use the API keys helper to get valid API keys
    const validApiKeys = initializeBLSApiKeys()
    
    // If we have valid keys from the helper, use those
    // Otherwise, fall back to the provided keys (for backward compatibility)
    const keysToUse = validApiKeys.length > 0 ? validApiKeys : apiKeys
    
    this.blsService = new BLSService(keysToUse)

    // Decide which defaults to begin with based on runtime.
    const runtimeIsServerless = isServerlessRuntime()
    this.config = runtimeIsServerless
      ? { ...defaultSyncConfig, ...serverlessDefaults, ...config }
      : { ...defaultSyncConfig, ...config }
    
    // Initialize with provided occupation codes/titles or load them later
    this.occupationCodes = occupationCodes || []
    this.occupationTitles = occupationTitles || {}

    // Initialize sync progress
    this.syncProgress = {
      isRunning: false,
      totalJobs: 0,
      processedJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      skippedJobs: 0,
      startTime: null,
      endTime: null,
      lastUpdated: new Date().toISOString(),
      checkpoints: [],
      apiKeysStatus: {
        totalKeys: 0,
        totalDailyLimit: 0,
        totalRemainingRequests: 0,
        keyStatuses: [],
      },
    }

    console.log(
      `🔄 BLS Sync Service initialised (${runtimeIsServerless ? "serverless" : "standard"} runtime) ` +
        `with concurrency=${this.config.maxConcurrent}, batchSize=${this.config.batchSize}`
    )
    console.log(`🔑 Using ${validApiKeys.length} valid API keys from environment`)
  }

  // ========== PUBLIC METHODS ==========

  /**
   * Start the sync process
   * @param forceRestart If true, ignores checkpoints and starts from beginning
   * @returns Promise with sync result
   */
  public async startSync(forceRestart = false): Promise<SyncResult> {
    if (this.syncProgress.isRunning) {
      return {
        success: false,
        message: "Sync is already running",
        stats: this.getSyncStats(),
      }
    }

    try {
      // Reset or resume progress
      if (forceRestart || !this.config.resumeFromLastCheckpoint) {
        this.resetSyncProgress()
      } else {
        this.prepareToResume()
      }

      // Initialize abort controller for cancellation
      this.syncAbortController = new AbortController()

      // Load occupation codes if not provided
      if (this.occupationCodes.length === 0) {
        await this.loadOccupationCodes()
      }

      // Update total jobs count
      this.syncProgress.totalJobs = this.occupationCodes.length
      
      // Calculate total batches
      const totalBatches = Math.ceil(this.syncProgress.totalJobs / this.config.batchSize)
      this.syncProgress.totalBatches = totalBatches

      // Set start time
      this.syncProgress.startTime = new Date().toISOString()
      this.syncProgress.isRunning = true
      this.updateProgress()

      // Start progress update interval
      this.startProgressUpdates()
      
      // Start health check interval
      this.startHealthCheck()

      // Start the sync process
      const result = await this.processBatches()

      // Update final status
      this.syncProgress.isRunning = false
      this.syncProgress.endTime = new Date().toISOString()
      this.updateProgress()

      // Clean up intervals
      this.stopProgressUpdates()
      this.stopHealthCheck()

      return result
    } catch (error) {
      // Handle unexpected errors
      this.syncProgress.isRunning = false
      this.syncProgress.endTime = new Date().toISOString()
      this.syncProgress.lastError = error instanceof Error ? error.message : "Unknown error"
      this.syncProgress.lastErrorTime = new Date().toISOString()
      this.updateProgress()

      // Clean up intervals
      this.stopProgressUpdates()
      this.stopHealthCheck()

      return {
        success: false,
        message: `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        stats: this.getSyncStats(),
      }
    }
  }

  /**
   * Stop the current sync process
   * @returns Promise that resolves when sync is stopped
   */
  public async stopSync(): Promise<{ success: boolean; message: string }> {
    if (!this.syncProgress.isRunning) {
      return {
        success: false,
        message: "No sync is currently running",
      }
    }

    try {
      // Abort the sync process
      if (this.syncAbortController) {
        this.syncAbortController.abort()
        this.syncAbortController = null
      }

      // Update status
      this.syncProgress.isRunning = false
      this.syncProgress.endTime = new Date().toISOString()
      this.updateProgress()

      // Clean up intervals
      this.stopProgressUpdates()
      this.stopHealthCheck()

      // Create final checkpoint
      this.createCheckpoint()

      return {
        success: true,
        message: "Sync stopped successfully",
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to stop sync: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  }

  /**
   * Get current sync progress
   * @returns Current sync progress
   */
  public getSyncProgress(): SyncProgress {
    // Update API keys status
    this.syncProgress.apiKeysStatus = {
      totalKeys: this.blsService.getAllKeyStatuses().length,
      totalDailyLimit: this.blsService.getAllKeyStatuses().length * 500, // Assuming 500 per key
      totalRemainingRequests: this.blsService.getTotalRemainingRequests(),
      keyStatuses: this.blsService.getAllKeyStatuses(),
    }

    // Calculate estimated time remaining if sync is running
    if (this.syncProgress.isRunning && this.syncProgress.processedJobs > 0) {
      const avgTimePerJob = this.getAverageProcessingTime()
      const remainingJobs = this.syncProgress.totalJobs - this.syncProgress.processedJobs
      this.syncProgress.estimatedTimeRemaining = Math.round(avgTimePerJob * remainingJobs)
    }

    return { ...this.syncProgress }
  }

  /**
   * Get sync statistics
   * @returns Sync statistics
   */
  private getSyncStats() {
    const startTime = this.syncProgress.startTime || new Date().toISOString()
    const endTime = this.syncProgress.endTime || new Date().toISOString()
    const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime()

    return {
      totalJobs: this.syncProgress.totalJobs,
      processedJobs: this.syncProgress.processedJobs,
      successfulJobs: this.syncProgress.successfulJobs,
      failedJobs: this.syncProgress.failedJobs,
      skippedJobs: this.syncProgress.skippedJobs,
      startTime,
      endTime,
      durationMs,
    }
  }

  // ========== CORE SYNC LOGIC ==========

  /**
   * Process all batches of occupation codes
   * @returns Promise with sync result
   */
  private async processBatches(): Promise<SyncResult> {
    const errors: Array<{ code: string; error: string; retryable: boolean }> = []
    let startBatchIndex = 0
    
    // If resuming, calculate which batch to start from
    if (this.config.resumeFromLastCheckpoint && this.syncProgress.checkpoints.length > 0) {
      const lastProcessed = this.syncProgress.processedJobs
      startBatchIndex = Math.floor(lastProcessed / this.config.batchSize)
      console.log(`🔄 Resuming from batch ${startBatchIndex + 1}/${this.syncProgress.totalBatches}`)
    }

    // Process each batch
    for (
      let batchIndex = startBatchIndex;
      batchIndex < Math.ceil(this.occupationCodes.length / this.config.batchSize);
      batchIndex++
    ) {
      // Check if sync was aborted
      if (this.syncAbortController?.signal.aborted) {
        console.log("🛑 Sync process aborted")
        return {
          success: false,
          message: "Sync process was aborted",
          stats: this.getSyncStats(),
          errors,
        }
      }

      // Update current batch
      this.syncProgress.currentBatch = batchIndex + 1
      
      // Get current batch of codes
      const start = batchIndex * this.config.batchSize
      const end = Math.min(start + this.config.batchSize, this.occupationCodes.length)
      const batchCodes = this.occupationCodes.slice(start, end)

      console.log(`📦 Processing batch ${batchIndex + 1}/${Math.ceil(this.occupationCodes.length / this.config.batchSize)} (${batchCodes.length} jobs)`)

      try {
        // Process batch with concurrency limit
        await this.processBatchWithConcurrency(batchCodes, errors)
        
        // Create checkpoint after each batch
        this.createCheckpoint()
      } catch (error) {
        console.error(`❌ Error processing batch ${batchIndex + 1}:`, error)
        
        // Even if a batch fails, continue with the next one
        continue
      }

      // Check if we have enough API requests remaining
      const remainingRequests = this.blsService.getTotalRemainingRequests()
      if (remainingRequests < this.config.batchSize * 2) { // Each job needs at least 2 API calls
        console.warn(`⚠️ Insufficient API requests remaining (${remainingRequests}), pausing sync`)
        
        return {
          success: false,
          message: `Sync paused due to API rate limits. Processed ${this.syncProgress.processedJobs}/${this.syncProgress.totalJobs} jobs.`,
          stats: this.getSyncStats(),
          errors,
        }
      }
    }

    // Final result
    const success = this.syncProgress.failedJobs === 0
    return {
      success,
      message: success
        ? `Sync completed successfully. Processed ${this.syncProgress.processedJobs} jobs.`
        : `Sync completed with ${this.syncProgress.failedJobs} failures out of ${this.syncProgress.processedJobs} jobs.`,
      stats: this.getSyncStats(),
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  /**
   * Process a batch of occupation codes with concurrency limit
   * @param batchCodes Array of occupation codes to process
   * @param errors Array to collect errors
   */
  private async processBatchWithConcurrency(
    batchCodes: string[],
    errors: Array<{ code: string; error: string; retryable: boolean }>
  ): Promise<void> {
    // Process in smaller chunks to control concurrency
    for (let i = 0; i < batchCodes.length; i += this.config.maxConcurrent) {
      // Check if sync was aborted
      if (this.syncAbortController?.signal.aborted) {
        break
      }

      const chunk = batchCodes.slice(i, i + this.config.maxConcurrent)
      
      // Process chunk concurrently
      await Promise.all(
        chunk.map(async (code) => {
          // Check if sync was aborted
          if (this.syncAbortController?.signal.aborted) {
            return
          }

          this.syncProgress.currentJob = code
          const startTime = Date.now()

          try {
            await this.processJob(code)
            this.syncProgress.successfulJobs++
            
            // Track processing time for estimates
            this.recordProcessingTime(Date.now() - startTime)
          } catch (error) {
            this.syncProgress.failedJobs++
            
            // Record error details
            const isRetryable = error instanceof RetryableError
            errors.push({
              code,
              error: error instanceof Error ? error.message : "Unknown error",
              retryable: isRetryable,
            })

            // Update last error in progress
            this.syncProgress.lastError = error instanceof Error ? error.message : "Unknown error"
            this.syncProgress.lastErrorTime = new Date().toISOString()
            
            // Emit error event
            this.emit("jobError", { code, error })
            
            console.error(`❌ Failed to process job ${code}:`, error)
          } finally {
            this.syncProgress.processedJobs++
            this.updateProgress()
          }
        })
      )
    }
  }

  /**
   * Process a single occupation code
   * @param occupationCode Occupation code to process
   */
  private async processJob(occupationCode: string): Promise<void> {
    // First check if job already exists with AI analysis
    const existingJob = await this.checkExistingJob(occupationCode)
    if (existingJob && existingJob.ai_impact_score) {
      this.syncProgress.skippedJobs++
      return
    }

    // Fetch data from BLS API with retries
    const jobData = await withRetry(
      async () => {
        try {
          return await this.blsService.fetchOccupationalData(occupationCode)
        } catch (error) {
          // Categorize errors
          if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase()
            
            // API rate limit or key errors - retryable
            if (
              errorMsg.includes("rate limit") ||
              errorMsg.includes("api key") ||
              errorMsg.includes("limit exceeded") ||
              errorMsg.includes("too many requests")
            ) {
              throw new RetryableError(`BLS API rate limit: ${error.message}`, 60) // Retry after 60 seconds
            }
            
            // Network or timeout errors - retryable
            if (
              errorMsg.includes("network") ||
              errorMsg.includes("timeout") ||
              errorMsg.includes("connection") ||
              errorMsg.includes("socket")
            ) {
              throw new RetryableError(`BLS API network error: ${error.message}`)
            }
          }
          
          // Re-throw other errors
          throw error
        }
      },
      this.config.retryAttempts,
      this.config.baseRetryDelayMs
    )

    if (!jobData) {
      throw new Error(`Failed to fetch data for occupation ${occupationCode}`)
    }

    // Get job title
    const title = this.occupationTitles[occupationCode] || jobData.title || `Occupation ${occupationCode}`

    // Calculate AI impact analysis (simplified version)
    const aiAnalysis = await this.calculateAIImpact(occupationCode, title)

    // Prepare job data
    const updatedJobData: JobData = {
      occ_code: occupationCode,
      occ_title: title,
      employment_2023: jobData.employment || 0,
      projected_employment_2033: jobData.projectedEmployment || 0,
      median_wage: jobData.medianWage || 0,
      ai_impact_score: aiAnalysis.aiImpactScore,
      automation_risk: aiAnalysis.automationRisk,
      skills_at_risk: aiAnalysis.skillsAtRisk,
      skills_needed: aiAnalysis.skillsNeeded,
    }

    // Validate data if enabled
    if (this.config.validateData) {
      const validation = validateJobData(updatedJobData)
      if (!validation.valid) {
        throw new Error(`Invalid job data for ${occupationCode}: ${validation.errors.join(", ")}`)
      }
    }

    // Save to database
    await this.saveJobData(updatedJobData)
    
    // Emit job processed event
    this.emit("jobProcessed", { code: occupationCode, data: updatedJobData })
  }

  // ========== HELPER METHODS ==========

  /**
   * Check if a job already exists in the database
   * @param occupationCode Occupation code to check
   * @returns Existing job data or null
   */
  private async checkExistingJob(occupationCode: string): Promise<any | null> {
    try {
      const result = await sqlEnhanced<any>`
        SELECT occ_code, ai_impact_score FROM jobs WHERE occ_code = ${occupationCode}
      `
      return result[0] || null
    } catch (error) {
      console.error(`Error checking existing job ${occupationCode}:`, error)
      return null
    }
  }

  /**
   * Save job data to database
   * @param jobData Job data to save
   */
  private async saveJobData(jobData: JobData): Promise<void> {
    try {
      await sqlEnhanced`
        INSERT INTO jobs (
          occ_code, occ_title, employment_2023, projected_employment_2033, 
          median_wage, ai_impact_score, automation_risk, 
          skills_at_risk, skills_needed, created_at, updated_at
        ) VALUES (
          ${jobData.occ_code}, 
          ${jobData.occ_title}, 
          ${jobData.employment_2023 || null}, 
          ${jobData.projected_employment_2033 || null},
          ${jobData.median_wage || null}, 
          ${jobData.ai_impact_score || null}, 
          ${jobData.automation_risk || null},
          ${jobData.skills_at_risk ? jobData.skills_at_risk.join(", ") : null}, 
          ${jobData.skills_needed ? jobData.skills_needed.join(", ") : null}, 
          NOW(), 
          NOW()
        )
        ON CONFLICT (occ_code) 
        DO UPDATE SET 
          occ_title = ${jobData.occ_title},
          employment_2023 = COALESCE(${jobData.employment_2023}, jobs.employment_2023),
          projected_employment_2033 = COALESCE(${jobData.projected_employment_2033}, jobs.projected_employment_2033),
          median_wage = COALESCE(${jobData.median_wage}, jobs.median_wage),
          ai_impact_score = COALESCE(${jobData.ai_impact_score}, jobs.ai_impact_score),
          automation_risk = COALESCE(${jobData.automation_risk}, jobs.automation_risk),
          skills_at_risk = COALESCE(${jobData.skills_at_risk ? jobData.skills_at_risk.join(", ") : null}, jobs.skills_at_risk),
          skills_needed = COALESCE(${jobData.skills_needed ? jobData.skills_needed.join(", ") : null}, jobs.skills_needed),
          updated_at = NOW()
      `
    } catch (error) {
      console.error(`Error saving job data for ${jobData.occ_code}:`, error)
      throw error
    }
  }

  /**
   * Calculate AI impact for a job
   * @param occupationCode Occupation code
   * @param occupationTitle Occupation title
   * @returns AI impact analysis
   */
  private async calculateAIImpact(
    occupationCode: string,
    occupationTitle: string
  ): Promise<{
    aiImpactScore: number
    automationRisk: string
    skillsAtRisk: string[]
    skillsNeeded: string[]
    futureOutlook: string
  }> {
    const title = occupationTitle.toLowerCase()
    let aiImpactScore = 30
    let automationRisk = "Medium"
    let skillsAtRisk: string[] = []
    let skillsNeeded: string[] = []
    let futureOutlook = ""

    // Very High Risk (80-95%): Highly routine, predictable jobs
    if (
      title.includes("cashier") ||
      title.includes("data entry") ||
      title.includes("telemarketer") ||
      title.includes("assembly") ||
      title.includes("fast food") ||
      title.includes("toll booth") ||
      title.includes("parking lot attendant") ||
      title.includes("library technician")
    ) {
      aiImpactScore = Math.floor(Math.random() * 15) + 80 // 80-95%
      automationRisk = "Very High"
      skillsAtRisk = [
        "Routine transactions",
        "Manual data entry",
        "Repetitive calculations",
        "Basic customer interactions",
        "Inventory counting",
        "Simple decision making",
      ]
      skillsNeeded = [
        "Customer relationship management",
        "Complex problem-solving",
        "Technology adaptation",
        "Emotional intelligence",
        "Process improvement",
        "Digital literacy",
      ]
      futureOutlook =
        "Very high risk of automation within 3-7 years. These roles will likely be fully automated or significantly reduced. Focus immediately on developing interpersonal skills, learning to work with AI systems, and transitioning to roles requiring human judgment and creativity."
    }
    // High Risk (65-79%): Routine cognitive work, some physical routine tasks
    else if (
      title.includes("bookkeeping") ||
      title.includes("tax preparer") ||
      title.includes("insurance claims") ||
      title.includes("loan officer") ||
      title.includes("paralegal") ||
      title.includes("proofreader") ||
      title.includes("translator") ||
      title.includes("radiologic technician")
    ) {
      aiImpactScore = Math.floor(Math.random() * 15) + 65 // 65-79%
      automationRisk = "High"
      skillsAtRisk = [
        "Routine analysis",
        "Standard procedures",
        "Document processing",
        "Basic calculations",
        "Pattern recognition",
        "Rule-based decisions",
      ]
      skillsNeeded = [
        "Strategic thinking",
        "Client consultation",
        "Complex analysis",
        "AI tool proficiency",
        "Regulatory expertise",
        "Risk assessment",
        "Relationship building",
      ]
      futureOutlook =
        "High risk of significant task automation within 5-10 years. While roles may not disappear entirely, they will be transformed. Focus on advisory aspects, complex problem-solving, and developing expertise in AI collaboration. Consider specializing in areas requiring human judgment and ethical decision-making."
    }
    // Medium-High Risk (50-64%): Mixed routine and non-routine tasks
    else if (
      title.includes("analyst") ||
      title.includes("accountant") ||
      title.includes("market research") ||
      title.includes("technical writer") ||
      title.includes("real estate agent") ||
      title.includes("insurance agent") ||
      title.includes("financial advisor")
    ) {
      aiImpactScore = Math.floor(Math.random() * 15) + 50 // 50-64%
      automationRisk = "Medium-High"
      skillsAtRisk = [
        "Routine analysis",
        "Report generation",
        "Basic research",
        "Standard presentations",
        "Simple forecasting",
        "Data compilation",
      ]
      skillsNeeded = [
        "Strategic consulting",
        "Complex data interpretation",
        "Client relationship management",
        "Creative problem solving",
        "Industry expertise",
        "AI-assisted analysis",
        "Ethical decision making",
      ]
      futureOutlook =
        "Moderate to high risk with significant role evolution expected. AI will handle routine analysis while humans focus on interpretation, strategy, and client relationships. Success requires embracing AI as a tool while developing uniquely human skills like empathy, creativity, and complex reasoning."
    }
    // Medium Risk (35-49%): Skilled trades, technical roles with human elements
    else if (
      title.includes("technician") ||
      title.includes("mechanic") ||
      title.includes("electrician") ||
      title.includes("plumber") ||
      title.includes("carpenter") ||
      title.includes("engineer") ||
      title.includes("programmer") ||
      title.includes("web developer")
    ) {
      aiImpactScore = Math.floor(Math.random() * 15) + 35 // 35-49%
      automationRisk = "Medium"
      skillsAtRisk = [
        "Routine diagnostics",
        "Standard installations",
        "Basic troubleshooting",
        "Code generation",
        "Simple designs",
        "Predictable maintenance",
      ]
      skillsNeeded = [
        "Complex problem diagnosis",
        "Custom solutions",
        "Safety management",
        "AI tool integration",
        "Continuous learning",
        "Customer communication",
        "Innovation and creativity",
      ]
      futureOutlook =
        "Moderate risk with AI augmenting rather than replacing core functions. AI will assist with diagnostics, planning, and routine tasks, allowing focus on complex problems, custom solutions, and innovation. Professionals should learn to collaborate with AI tools while maintaining hands-on expertise."
    }
    // Low-Medium Risk (20-34%): Roles requiring significant human interaction
    else if (
      title.includes("sales") ||
      title.includes("marketing") ||
      title.includes("human resources") ||
      title.includes("project manager") ||
      title.includes("consultant") ||
      title.includes("trainer") ||
      title.includes("coordinator")
    ) {
      aiImpactScore = Math.floor(Math.random() * 15) + 20 // 20-34%
      automationRisk = "Low-Medium"
      skillsAtRisk = [
        "Basic scheduling",
        "Simple reporting",
        "Routine communications",
        "Data collection",
        "Standard presentations",
      ]
      skillsNeeded = [
        "Relationship building",
        "Strategic thinking",
        "Emotional intelligence",
        "Complex negotiation",
        "Creative problem solving",
        "Leadership",
        "Change management",
      ]
      futureOutlook =
        "Low to moderate risk with AI enhancing productivity rather than replacing roles. AI will handle administrative tasks, data analysis, and routine communications, freeing professionals to focus on strategy, relationships, and creative problem-solving. Success requires strong interpersonal skills and strategic thinking."
    }
    // Low Risk (5-19%): High human interaction, creativity, care roles
    else if (
      title.includes("teacher") ||
      title.includes("therapist") ||
      title.includes("counselor") ||
      title.includes("social worker") ||
      title.includes("nurse") ||
      title.includes("doctor") ||
      title.includes("manager") ||
      title.includes("executive") ||
      title.includes("artist") ||
      title.includes("designer") ||
      title.includes("chef")
    ) {
      aiImpactScore = Math.floor(Math.random() * 15) + 5 // 5-19%
      automationRisk = "Low"
      skillsAtRisk = [
        "Administrative tasks",
        "Basic documentation",
        "Simple scheduling",
        "Routine assessments",
        "Standard reporting",
      ]
      skillsNeeded = [
        "Emotional intelligence",
        "Creative thinking",
        "Complex problem solving",
        "Leadership",
        "Ethical decision making",
        "AI collaboration",
        "Continuous learning",
        "Cultural competency",
      ]
      futureOutlook =
        "Low risk of automation with AI serving as a powerful assistant. AI will handle administrative tasks, provide data insights, and support decision-making, but human judgment, creativity, empathy, and complex reasoning remain irreplaceable. Focus on developing uniquely human skills while learning to leverage AI tools effectively."
    }
    // Default case - moderate risk
    else {
      aiImpactScore = Math.floor(Math.random() * 20) + 40 // 40-59%
      automationRisk = "Medium"
      skillsAtRisk = ["Routine tasks", "Standard procedures", "Basic data processing", "Simple analysis"]
      skillsNeeded = [
        "Critical thinking",
        "Adaptability",
        "Digital literacy",
        "Collaboration",
        "Continuous learning",
        "Problem solving",
      ]
      futureOutlook =
        "Moderate risk of automation with significant role evolution expected. Success will depend on adapting to work alongside AI systems, focusing on uniquely human skills, and continuously learning new technologies. Embrace AI as a tool while developing skills that complement automated systems."
    }

    return {
      aiImpactScore,
      automationRisk,
      skillsAtRisk,
      skillsNeeded,
      futureOutlook,
    }
  }

  /**
   * Load occupation codes from database or initialize with defaults
   */
  private async loadOccupationCodes(): Promise<void> {
    /*
     * Previously this method attempted to read from a `job_codes` table that is
     * no longer part of the schema.  Instead, we now always fall back to our
     * baked-in Standard Occupational Classification (SOC) list.  This keeps the
     * logic simple and avoids a failing query on a non-existent table.
     */
    console.log("📋 Loading BLS occupation codes from standard SOC list")
    this.initializeDefaultOccupationCodes()
  }

  /**
   * Initialize with default occupation codes
   */
  private initializeDefaultOccupationCodes(): void {
    // Comprehensive list of occupation codes covering all major groups
    this.occupationCodes = [
      // Management Occupations (11-XXXX)
      "11-1011", // Chief Executives
      "11-1021", // General and Operations Managers
      "11-2011", // Advertising and Promotions Managers
      "11-2021", // Marketing Managers
      "11-2022", // Sales Managers
      "11-2031", // Public Relations and Fundraising Managers
      "11-3011", // Administrative Services Managers
      "11-3021", // Computer and Information Systems Managers
      "11-3031", // Financial Managers
      "11-3051", // Industrial Production Managers
      "11-3061", // Purchasing Managers
      "11-3071", // Transportation, Storage, and Distribution Managers
      "11-3111", // Compensation and Benefits Managers
      "11-3121", // Human Resources Managers
      "11-3131", // Training and Development Managers
      "11-9013", // Farmers, Ranchers, and Other Agricultural Managers
      "11-9021", // Construction Managers
      "11-9031", // Education Administrators, Preschool and Childcare Center/Program
      "11-9032", // Education Administrators, Elementary and Secondary School
      "11-9033", // Education Administrators, Postsecondary
      "11-9041", // Architectural and Engineering Managers
      "11-9051", // Food Service Managers
      "11-9071", // Gaming Managers
      "11-9081", // Lodging Managers
      "11-9111", // Medical and Health Services Managers
      "11-9121", // Natural Sciences Managers
      "11-9131", // Postmasters and Mail Superintendents
      "11-9141", // Property, Real Estate, and Community Association Managers
      "11-9151", // Social and Community Service Managers
      "11-9161", // Emergency Management Directors
      
      // Business and Financial Operations Occupations (13-XXXX)
      "13-1011", // Agents and Business Managers of Artists, Performers, and Athletes
      "13-1021", // Buyers and Purchasing Agents, Farm Products
      "13-1022", // Wholesale and Retail Buyers, Except Farm Products
      "13-1023", // Purchasing Agents, Except Wholesale, Retail, and Farm Products
      "13-1031", // Claims Adjusters, Examiners, and Investigators
      "13-1041", // Compliance Officers
      "13-1051", // Cost Estimators
      "13-1071", // Human Resources Specialists
      "13-1075", // Labor Relations Specialists
      "13-1081", // Logisticians
      "13-1111", // Management Analysts
      "13-1121", // Meeting, Convention, and Event Planners
      "13-1131", // Fundraisers
      "13-1141", // Compensation, Benefits, and Job Analysis Specialists
      "13-1151", // Training and Development Specialists
      "13-1161", // Market Research Analysts and Marketing Specialists
      "13-1199", // Business Operations Specialists, All Other
      "13-2011", // Accountants and Auditors
      "13-2021", // Appraisers and Assessors of Real Estate
      "13-2031", // Budget Analysts
      "13-2041", // Credit Analysts
      "13-2051", // Financial Analysts
      "13-2052", // Personal Financial Advisors
      "13-2053", // Insurance Underwriters
      "13-2061", // Financial Examiners
      "13-2071", // Credit Counselors
      "13-2072", // Loan Officers
      "13-2081", // Tax Examiners and Collectors, and Revenue Agents
      "13-2082", // Tax Preparers
      
      // Computer and Mathematical Occupations (15-XXXX)
      "15-1211", // Computer Systems Analysts
      "15-1212", // Information Security Analysts
      "15-1221", // Computer and Information Research Scientists
      "15-1231", // Computer Network Support Specialists
      "15-1232", // Computer User Support Specialists
      "15-1241", // Computer Network Architects
      "15-1242", // Database Administrators
      "15-1243", // Database Architects
      "15-1244", // Network and Computer Systems Administrators
      "15-1251", // Computer Programmers
      "15-1252", // Software Developers
      "15-1253", // Software Quality Assurance Analysts and Testers
      "15-1254", // Web Developers
      "15-1255", // Web and Digital Interface Designers
      "15-2011", // Actuaries
      "15-2021", // Mathematicians
      "15-2031", // Operations Research Analysts
      "15-2041", // Statisticians
      "15-2051", // Data Scientists
      
      // Architecture and Engineering Occupations (17-XXXX)
      "17-1011", // Architects, Except Landscape and Naval
      "17-1012", // Landscape Architects
      "17-1022", // Surveyors
      "17-2011", // Aerospace Engineers
      "17-2021", // Agricultural Engineers
      "17-2031", // Bioengineers and Biomedical Engineers
      "17-2041", // Chemical Engineers
      "17-2051", // Civil Engineers
      "17-2061", // Computer Hardware Engineers
      "17-2071", // Electrical Engineers
      "17-2072", // Electronics Engineers, Except Computer
      "17-2081", // Environmental Engineers
      "17-2111", // Health and Safety Engineers
      "17-2112", // Industrial Engineers
      "17-2121", // Marine Engineers and Naval Architects
      "17-2131", // Materials Engineers
      "17-2141", // Mechanical Engineers
      "17-2151", // Mining and Geological Engineers
      "17-2161", // Nuclear Engineers
      "17-2171", // Petroleum Engineers
      "17-3011", // Architectural and Civil Drafters
      "17-3012", // Electrical and Electronics Drafters
      "17-3013", // Mechanical Drafters
      "17-3021", // Aerospace Engineering and Operations Technologists and Technicians
      "17-3022", // Civil Engineering Technologists and Technicians
      "17-3023", // Electrical and Electronic Engineering Technologists and Technicians
      "17-3024", // Electro-Mechanical and Mechatronics Technologists and Technicians
      "17-3025", // Environmental Engineering Technologists and Technicians
      "17-3026", // Industrial Engineering Technologists and Technicians
      "17-3027", // Mechanical Engineering Technologists and Technicians
      
      // Life, Physical, and Social Science Occupations (19-XXXX)
      "19-1011", // Animal Scientists
      "19-1012", // Food Scientists and Technologists
      "19-1013", // Soil and Plant Scientists
      "19-1021", // Biochemists and Biophysicists
      "19-1022", // Microbiologists
      "19-1023", // Zoologists and Wildlife Biologists
      "19-1029", // Biological Scientists, All Other
      "19-1031", // Conservation Scientists
      "19-1032", // Foresters
      "19-1041", // Epidemiologists
      "19-1042", // Medical Scientists, Except Epidemiologists
      "19-2011", // Astronomers
      "19-2012", // Physicists
      "19-2021", // Atmospheric and Space Scientists
      "19-2031", // Chemists
      "19-2032", // Materials Scientists
      "19-2041", // Environmental Scientists and Specialists, Including Health
      "19-2042", // Geoscientists, Except Hydrologists and Geographers
      "19-2043", // Hydrologists
      "19-3011", // Economists
      "19-3022", // Survey Researchers
      "19-3031", // Clinical, Counseling, and School Psychologists
      "19-3032", // Industrial-Organizational Psychologists
      "19-3039", // Psychologists, All Other
      "19-3051", // Urban and Regional Planners
      "19-3091", // Anthropologists and Archeologists
      "19-3092", // Geographers
      "19-3094", // Political Scientists
      "19-3099", // Social Scientists and Related Workers, All Other
      
      // Community and Social Service Occupations (21-XXXX)
      "21-1011", // Substance Abuse and Behavioral Disorder Counselors
      "21-1012", // Educational, Guidance, and Career Counselors and Advisors
      "21-1013", // Marriage and Family Therapists
      "21-1014", // Mental Health Counselors
      "21-1015", // Rehabilitation Counselors
      "21-1018", // Substance Abuse, Behavioral Disorder, and Mental Health Counselors
      "21-1021", // Child, Family, and School Social Workers
      "21-1022", // Healthcare Social Workers
      "21-1023", // Mental Health and Substance Abuse Social Workers
      "21-1091", // Health Education Specialists
      "21-1092", // Probation Officers and Correctional Treatment Specialists
      "21-1093", // Social and Human Service Assistants
      "21-1094", // Community Health Workers
      "21-1099", // Community and Social Service Specialists, All Other
      "21-2011", // Clergy
      "21-2021", // Directors, Religious Activities and Education
      
      // Legal Occupations (23-XXXX)
      "23-1011", // Lawyers
      "23-1012", // Judicial Law Clerks
      "23-1022", // Arbitrators, Mediators, and Conciliators
      "23-1023", // Judges, Magistrate Judges, and Magistrates
      "23-2011", // Paralegals and Legal Assistants
      "23-2093", // Title Examiners, Abstractors, and Searchers
      "23-2099", // Legal Support Workers, All Other
      
      // Education, Training, and Library Occupations (25-XXXX)
      "25-1011", // Business Teachers, Postsecondary
      "25-1021", // Computer Science Teachers, Postsecondary
      "25-1022", // Mathematical Science Teachers, Postsecondary
      "25-1031", // Architecture Teachers, Postsecondary
      "25-1032", // Engineering Teachers, Postsecondary
      "25-1041", // Agricultural Sciences Teachers, Postsecondary
      "25-1042", // Biological Science Teachers, Postsecondary
      "25-1052", // Chemistry Teachers, Postsecondary
      "25-1054", // Physics Teachers, Postsecondary
      "25-1061", // Anthropology and Archeology Teachers, Postsecondary
      "25-1062", // Area, Ethnic, and Cultural Studies Teachers, Postsecondary
      "25-1063", // Economics Teachers, Postsecondary
      "25-1064", // Geography Teachers, Postsecondary
      "25-1065", // Political Science Teachers, Postsecondary
      "25-1066", // Psychology Teachers, Postsecondary
      "25-1067", // Sociology Teachers, Postsecondary
      "25-1071", // Health Specialties Teachers, Postsecondary
      "25-1072", // Nursing Instructors and Teachers, Postsecondary
      "25-1081", // Education Teachers, Postsecondary
      "25-1111", // Criminal Justice and Law Enforcement Teachers, Postsecondary
      "25-1112", // Law Teachers, Postsecondary
      "25-1121", // Art, Drama, and Music Teachers, Postsecondary
      "25-1122", // Communications Teachers, Postsecondary
      "25-1123", // English Language and Literature Teachers, Postsecondary
      "25-1124", // Foreign Language and Literature Teachers, Postsecondary
      "25-1125", // History Teachers, Postsecondary
      "25-1126", // Philosophy and Religion Teachers, Postsecondary
      "25-2011", // Preschool Teachers, Except Special Education
      "25-2012", // Kindergarten Teachers, Except Special Education
      "25-2021", // Elementary School Teachers, Except Special Education
      "25-2022", // Middle School Teachers, Except Special and Career/Technical Education
      "25-2031", // Secondary School Teachers, Except Special and Career/Technical Education
      "25-2052", // Special Education Teachers, Kindergarten and Elementary School
      "25-2053", // Special Education Teachers, Middle School
      "25-2054", // Special Education Teachers, Secondary School
      "25-3011", // Adult Basic Education, Adult Secondary Education, and English as a Second Language Instructors
      "25-3021", // Self-Enrichment Teachers
      "25-3031", // Substitute Teachers, Short-Term
      "25-4022", // Librarians and Media Collections Specialists
      "25-4031", // Library Technicians
      "25-9041", // Teacher Assistants
      
      // Arts, Design, Entertainment, Sports, and Media Occupations (27-XXXX)
      "27-1011", // Art Directors
      "27-1012", // Craft Artists
      "27-1013", // Fine Artists, Including Painters, Sculptors, and Illustrators
      "27-1014", // Special Effects Artists and Animators
      "27-1019", // Artists and Related Workers, All Other
      "27-1021", // Commercial and Industrial Designers
      "27-1022", // Fashion Designers
      "27-1023", // Floral Designers
      "27-1024", // Graphic Designers
      "27-1025", // Interior Designers
      "27-1026", // Merchandise Displayers and Window Trimmers
      "27-1027", // Set and Exhibit Designers
      "27-1029", // Designers, All Other
      "27-2011", // Actors
      "27-2012", // Producers and Directors
      "27-2021", // Athletes and Sports Competitors
      "27-2022", // Coaches and Scouts
      "27-2023", // Umpires, Referees, and Other Sports Officials
      "27-2031", // Dancers
      "27-2032", // Choreographers
      "27-2041", // Music Directors and Composers
      "27-2042", // Musicians and Singers
      "27-3011", // Radio, Television, and Other Announcers
      "27-3021", // Broadcast Announcers and Radio Disc Jockeys
      "27-3022", // Reporters and Correspondents
      "27-3031", // Public Relations Specialists
      "27-3041", // Editors
      "27-3042", // Technical Writers
      "27-3043", // Writers and Authors
      "27-3091", // Interpreters and Translators
      "27-4011", // Audio and Video Technicians
      "27-4021", // Photographers
      "27-4031", // Camera Operators, Television, Video, and Film
      "27-4032", // Film and Video Editors
      
      // Healthcare Practitioners and Technical Occupations (29-XXXX)
      "29-1011", // Chiropractors
      "29-1021", // Dentists, General
      "29-1022", // Oral and Maxillofacial Surgeons
      "29-1023", // Orthodontists
      "29-1024", // Prosthodontists
      "29-1029", // Dentists, All Other Specialists
      "29-1031", // Dietitians and Nutritionists
      "29-1041", // Optometrists
      "29-1051", // Pharmacists
      "29-1071", // Physician Assistants
      "29-1081", // Podiatrists
      "29-1122", // Occupational Therapists
      "29-1123", // Physical Therapists
      "29-1124", // Radiation Therapists
      "29-1125", // Recreational Therapists
      "29-1126", // Respiratory Therapists
      "29-1127", // Speech-Language Pathologists
      "29-1128", // Exercise Physiologists
      "29-1129", // Therapists, All Other
      "29-1131", // Veterinarians
      "29-1141", // Registered Nurses
      "29-1151", // Nurse Anesthetists
      "29-1161", // Nurse Midwives
      "29-1171", // Nurse Practitioners
      "29-1211", // Anesthesiologists
      "29-1212", // Cardiologists
      "29-1213", // Dermatologists
      "29-1214", // Emergency Medicine Physicians
      "29-1215", // Family Medicine Physicians
      "29-1216", // General Internal Medicine Physicians
      "29-1217", // Neurologists
      "29-1218", // Obstetricians and Gynecologists
      "29-1221", // Pediatricians, General
      "29-1222", // Physicians, Pathologists
      "29-1223", // Psychiatrists
      "29-1224", // Radiologists
      "29-1229", // Physicians, All Other
      "29-1241", // Ophthalmologists, Except Pediatric
      "29-1242", // Orthopedic Surgeons, Except Pediatric
      "29-1243", // Pediatric Surgeons
      "29-1249", // Surgeons, All Other
      "29-2011", // Medical and Clinical Laboratory Technologists
      "29-2012", // Medical and Clinical Laboratory Technicians
      "29-2031", // Cardiovascular Technologists and Technicians
      "29-2032", // Diagnostic Medical Sonographers
      "29-2033", // Nuclear Medicine Technologists
      "29-2034", // Radiologic Technologists and Technicians
      "29-2041", // Emergency Medical Technicians
      "29-2042", // Paramedics
      "29-2051", // Dietetic Technicians
      "29-2052", // Pharmacy Technicians
      "29-2053", // Psychiatric Technicians
      "29-2055", // Surgical Technologists
      "29-2061", // Licensed Practical and Licensed Vocational Nurses
      "29-2071", // Medical Records Specialists
      "29-2081", // Opticians, Dispensing
      "29-2099", // Health Technologists and Technicians, All Other
      
      // Healthcare Support Occupations (31-XXXX)
      "31-1120", // Home Health and Personal Care Aides
      "31-1131", // Nursing Assistants
      "31-1132", // Orderlies
      "31-1133", // Psychiatric Aides
      "31-2011", // Occupational Therapy Assistants
      "31-2012", // Occupational Therapy Aides
      "31-2021", // Physical Therapist Assistants
      "31-2022", // Physical Therapist Aides
      "31-9011", // Massage Therapists
      "31-9091", // Dental Assistants
      "31-9092", // Medical Assistants
      "31-9093", // Medical Equipment Preparers
      "31-9094", // Medical Transcriptionists
      "31-9095", // Pharmacy Aides
      "31-9096", // Veterinary Assistants and Laboratory Animal Caretakers
      "31-9097", // Phlebotomists
      "31-9099", // Healthcare Support Workers, All Other
      
      // Protective Service Occupations (33-XXXX)
      "33-1011", // First-Line Supervisors of Correctional Officers
      "33-1012", // First-Line Supervisors of Police and Detectives
      "33-1021", // First-Line Supervisors of Firefighting and Prevention Workers
      "33-1099", // First-Line Supervisors of Protective Service Workers, All Other
      "33-2011", // Firefighters
      "33-2021", // Fire Inspectors and Investigators
      "33-2022", // Forest Fire Inspectors and Prevention Specialists
      "33-3011", // Bailiffs
      "33-3012", // Correctional Officers and Jailers
      "33-3021", // Detectives and Criminal Investigators
      "33-3031", // Fish and Game Wardens
      "33-3041", // Parking Enforcement Workers
      "33-3051", // Police and Sheriff's Patrol Officers
      "33-3052", // Transit and Railroad Police
      "33-9011", // Animal Control Workers
      "33-9021", // Private Detectives and Investigators
      "33-9031", // Gaming Surveillance Officers and Gaming Investigators
      "33-9032", // Security Guards
      "33-9091", // Crossing Guards and Flaggers
      "33-9093", // Transportation Security Screeners
      "33-9099", // Protective Service Workers, All Other
      
      // Food Preparation and Serving Related Occupations (35-XXXX)
      "35-1011", // Chefs and Head Cooks
      "35-1012", // First-Line Supervisors of Food Preparation and Serving Workers
      "35-2011", // Cooks, Fast Food
      "35-2012", // Cooks, Institution and Cafeteria
      "35-2014", // Cooks, Restaurant
      "35-2015", // Cooks, Short Order
      "35-2021", // Food Preparation Workers
      "35-3011", // Bartenders
      "35-3023", // Fast Food and Counter Workers
      "35-3031", // Waiters and Waitresses
      "35-3041", // Food Servers, Nonrestaurant
      "35-9011", // Dining Room and Cafeteria Attendants and Bartender Helpers
      "35-9021", // Dishwashers
      "35-9031", // Hosts and Hostesses, Restaurant, Lounge, and Coffee Shop
      "35-9099", // Food Preparation and Serving Related Workers, All Other
      
      // Building and Grounds Cleaning and Maintenance Occupations (37-XXXX)
      "37-1011", // First-Line Supervisors of Housekeeping and Janitorial Workers
      "37-1012", // First-Line Supervisors of Landscaping, Lawn Service, and Groundskeeping Workers
      "37-2011", // Janitors and Cleaners, Except Maids and Housekeeping Cleaners
      "37-2012", // Maids and Housekeeping Cleaners
      "37-2021", // Pest Control Workers
      "37-3011", // Landscaping and Groundskeeping Workers
      "37-3012", // Pesticide Handlers, Sprayers, and Applicators, Vegetation
      "37-3013", // Tree Trimmers and Pruners
      
      // Personal Care and Service Occupations (39-XXXX)
      "39-1011", // First-Line Supervisors of Gaming Workers
      "39-1012", // First-Line Supervisors of Personal Service Workers
      "39-2011", // Animal Trainers
      "39-2021", // Animal Caretakers
      "39-3011", // Gaming Dealers
      "39-3012", // Gaming and Sports Book Writers and Runners
      "39-3031", // Ushers, Lobby Attendants, and Ticket Takers
      "39-3091", // Amusement and Recreation Attendants
      "39-3092", // Costume Attendants
      "39-3093", // Locker Room, Coatroom, and Dressing Room Attendants
      "39-4011", // Embalmers
      "39-4012", // Funeral Attendants
      "39-4031", // Morticians, Undertakers, and Funeral Arrangers
      "39-5011", // Barbers
      "39-5012", // Hairdressers, Hairstylists, and Cosmetologists
      "39-5091", // Makeup Artists, Theatrical and Performance
      "39-5092", // Manicurists and Pedicurists
      "39-5093", // Shampooers
      "39-5094", // Skincare Specialists
      "39-6011", // Baggage Porters and Bellhops
      "39-6012", // Concierges
      "39-7011", // Tour Guides and Escorts
      "39-7012", // Travel Guides
      "39-9011", // Childcare Workers
      "39-9021", // Personal Care Aides
      "39-9031", // Exercise Trainers and Group Fitness Instructors
      "39-9032", // Recreation Workers
      "39-9041", // Residential Advisors
      
      // Sales and Related Occupations (41-XXXX)
      "41-1011", // First-Line Supervisors of Retail Sales Workers
      "41-1012", // First-Line Supervisors of Non-Retail Sales Workers
      "41-2011", // Cashiers
      "41-2021", // Counter and Rental Clerks
      "41-2022", // Parts Salespersons
      "41-2031", // Retail Salespersons
      "41-3011", // Advertising Sales Agents
      "41-3021", // Insurance Sales Agents
      "41-3031", // Securities, Commodities, and Financial Services Sales Agents
      "41-3041", // Travel Agents
      "41-3091", // Sales Representatives of Services, Except Advertising, Insurance, Financial Services, and Travel
      "41-4011", // Sales Representatives, Wholesale and Manufacturing, Technical and Scientific Products
      "41-4012", // Sales Representatives, Wholesale and Manufacturing, Except Technical and Scientific Products
      "41-9011", // Demonstrators and Product Promoters
      "41-9021", // Real Estate Brokers
      "41-9022", // Real Estate Sales Agents
      "41-9031", // Sales Engineers
      "41-9041", // Telemarketers
      "41-9091", // Door-to-Door Sales Workers, News and Street Vendors, and Related Workers
      
      // Office and Administrative Support Occupations (43-XXXX)
      "43-1011", // First-Line Supervisors of Office and Administrative Support Workers
      "43-2011", // Switchboard Operators, Including Answering Service
      "43-3011", // Bill and Account Collectors
      "43-3021", // Billing and Posting Clerks
      "43-3031", // Bookkeeping, Accounting, and Auditing Clerks
      "43-3051", // Payroll and Timekeeping Clerks
      "43-3061", // Procurement Clerks
      "43-3071", // Tellers
      "43-4011", // Brokerage Clerks
      "43-4021", // Correspondence Clerks
      "43-4031", // Court, Municipal, and License Clerks
      "43-4041", // Credit Authorizers, Checkers, and Clerks
      "43-4051", // Customer Service Representatives
      "43-4061", // Eligibility Interviewers, Government Programs
      "43-4071", // File Clerks
      "43-4081", // Hotel, Motel, and Resort Desk Clerks
      "43-4111", // Interviewers, Except Eligibility and Loan
      "43-4121", // Library Assistants, Clerical
      "43-4131", // Loan Interviewers and Clerks
      "43-4141", // New Accounts Clerks
      "43-4151", // Order Clerks
      "43-4161", // Human Resources Assistants, Except Payroll and Timekeeping
      "43-4171", // Receptionists and Information Clerks
      "43-4199", // Information and Record Clerks, All Other
      "43-5011", // Cargo and Freight Agents
      "43-5021", // Couriers and Messengers
      "43-5031", // Police, Fire, and Ambulance Dispatchers
      "43-5032", // Dispatchers, Except Police, Fire, and Ambulance
      "43-5041", // Meter Readers, Utilities
      "43-5051", // Postal Service Clerks
      "43-5052", // Postal Service Mail Carriers
      "43-5053", // Postal Service Mail Sorters, Processors, and Processing Machine Operators
      "43-5061", // Production, Planning, and Expediting Clerks
      "43-5071", // Shipping, Receiving, and Inventory Clerks
      "43-5081", // Stock Clerks and Order Fillers
      "43-5111", // Weighers, Measurers, Checkers, and Samplers, Recordkeeping
      "43-6011", // Executive Secretaries and Executive Administrative Assistants
      "43-6012", // Legal Secretaries and Administrative Assistants
      "43-6013", // Medical Secretaries and Administrative Assistants
      "43-6014", // Secretaries and Administrative Assistants, Except Legal, Medical, and Executive
      "43-9021", // Data Entry Keyers
      "43-9022", // Word Processors and Typists
      "43-9031", // Desktop Publishers
      "43-9041", // Insurance Claims and Policy Processing Clerks
      "43-9051", // Mail Clerks and Mail Machine Operators, Except Postal Service
      "43-9061", // Office Clerks, General
      "43-9071", // Office Machine Operators, Except Computer
      "43-9081", // Proofreaders and Copy Markers
      
      // Farming, Fishing, and Forestry Occupations (45-XXXX)
      "45-1011", // First-Line Supervisors of Farming, Fishing, and Forestry Workers
      "45-2011", // Agricultural Inspectors
      "45-2021", // Animal Breeders
      "45-2041", // Graders and Sorters, Agricultural Products
      "45-2091", // Agricultural Equipment Operators
      "45-2092", // Farmworkers and Laborers, Crop, Nursery, and Greenhouse
      "45-2093", // Farmworkers, Farm, Ranch, and Aquacultural Animals
      "45-3011", // Fishers and Related Fishing Workers
      "45-3021", // Hunters and Trappers
      "45-4011", // Forest and Conservation Workers
      "45-4021", // Fallers
      "45-4022", // Logging Equipment Operators
      "45-4023", // Log Graders and Scalers
      
      // Construction and Extraction Occupations (47-XXXX)
      "47-1011", // First-Line Supervisors of Construction Trades and Extraction Workers
      "47-2011", // Boilermakers
      "47-2021", // Brickmasons and Blockmasons
      "47-2022", // Stonemasons
      "47-2031", // Carpenters
      "47-2041", // Carpet Installers
      "47-2042", // Floor Layers, Except Carpet, Wood, and Hard Tiles
      "47-2043", // Floor Sanders and Finishers
      "47-2044", // Tile and Stone Setters
      "47-2051", // Cement Masons and Concrete Finishers
      "47-2061", // Construction Laborers
      "47-2071", // Paving, Surfacing, and Tamping Equipment Operators
      "47-2072", // Pile Driver Operators
      "47-2073", // Operating Engineers and Other Construction Equipment Operators
      "47-2081", // Drywall and Ceiling Tile Installers
      "47-2082", // Tapers
      "47-2111", // Electricians
      "47-2121", // Glaziers
      "47-2131", // Insulation Workers, Floor, Ceiling, and Wall
      "47-2132", // Insulation Workers, Mechanical
      "47-2141", // Painters, Construction and Maintenance
      "47-2142", // Paperhangers
      "47-2151", // Pipelayers
      "47-2152", // Plumbers, Pipefitters, and Steamfitters
      "47-2161", // Plasterers and Stucco Masons
      "47-2171", // Reinforcing Iron and Rebar Workers
      "47-2181", // Roofers
      "47-2211", // Sheet Metal Workers
      "47-2221", // Structural Iron and Steel Workers
      "47-3011", // Helpers--Brickmasons, Blockmasons, Stonemasons, and Tile and Marble Setters
      "47-3012", // Helpers--Carpenters
      "47-3013", // Helpers--Electricians
      "47-3014", // Helpers--Painters, Paperhangers, Plasterers, and Stucco Masons
      "47-3015", // Helpers--Pipelayers, Plumbers, Pipefitters, and Steamfitters
      "47-3016", // Helpers--Roofers
      "47-4011", // Construction and Building Inspectors
      "47-4021", // Elevator and Escalator Installers and Repairers
      "47-4031", // Fence Erectors
      "47-4041", // Hazardous Materials Removal Workers
      "47-4051", // Highway Maintenance Workers
      "47-4061", // Rail-Track Laying and Maintenance Equipment Operators
      "47-4071", // Septic Tank Servicers and Sewer Pipe Cleaners
      "47-4091", // Segmental Pavers
      "47-4099", // Construction and Related Workers, All Other
      "47-5011", // Derrick Operators, Oil and Gas
      "47-5012", // Rotary Drill Operators, Oil and Gas
      "47-5013", // Service Unit Operators, Oil and Gas
      "47-5021", // Earth Drillers, Except Oil and Gas
      "47-5031", // Explosives Workers, Ordnance Handling Experts, and Blasters
      "47-5041", // Continuous Mining Machine Operators
      "47-5042", // Mine Cutting and Channeling Machine Operators
      "47-5049", // Mining Machine Operators, All Other
      "47-5051", // Rock Splitters, Quarry
      "47-5061", // Roof Bolters, Mining
      "47-5071", // Roustabouts, Oil and Gas
      "47-5081", // Helpers--Extraction Workers
      
      // Installation, Maintenance, and Repair Occupations (49-XXXX)
      "49-1011", // First-Line Supervisors of Mechanics, Installers, and Repairers
      "49-2011", // Computer, Automated Teller, and Office Machine Repairers
      "49-2021", // Radio, Cellular, and Tower Equipment Installers and Repairers
      "49-2022", // Telecommunications Equipment Installers and Repairers, Except Line Installers
      "49-2091", // Avionics Technicians
      "49-2092", // Electric Motor, Power Tool, and Related Repairers
      "49-2093", // Electrical and Electronics Installers and Repairers, Transportation Equipment
      "49-2094", // Electrical and Electronics Repairers, Commercial and Industrial Equipment
      "49-2095", // Electrical and Electronics Repairers, Powerhouse, Substation, and Relay
      "49-2096", // Electronic Equipment Installers and Repairers, Motor Vehicles
      "49-2097", // Audiovisual Equipment Installers and Repairers
      "49-2098", // Security and Fire Alarm Systems Installers
      "49-3011", // Aircraft Mechanics and Service Technicians
      "49-3021", // Automotive Body and Related Repairers
      "49-3022", // Automotive Glass Installers and Repairers
      "49-3023", // Automotive Service Technicians and Mechanics
      "49-3031", // Bus and Truck Mechanics and Diesel Engine Specialists
      "49-3041", // Farm Equipment Mechanics and Service Technicians
      "49-3042", // Mobile Heavy Equipment Mechanics, Except Engines
      "49-3043", // Rail Car Repairers
      "49-3051", // Motorboat Mechanics and Service Technicians
      "49-3052", // Motorcycle Mechanics
      "49-3053", // Outdoor Power Equipment and Other Small Engine Mechanics
      "49-3091", // Bicycle Repairers
      "49-3092", // Recreational Vehicle Service Technicians
      "49-3093", // Tire Repairers and Changers
      "49-9011", // Mechanical Door Repairers
      "49-9012", // Control and Valve Installers and Repairers, Except Mechanical Door
      "49-9021", // Heating, Air Conditioning, and Refrigeration Mechanics and Installers
      "49-9031", // Home Appliance Repairers
      "49-9041", // Industrial Machinery Mechanics
      "49-9043", // Maintenance Workers, Machinery
      "49-9044", // Millwrights
      "49-9051", // Electrical Power-Line Installers and Repairers
      "49-9052", // Telecommunications Line Installers and Repairers
      "49-9061", // Camera and Photographic Equipment Repairers
      "49-9062", // Medical Equipment Repairers
      "49-9063", // Musical Instrument Repairers and Tuners
      "49-9064", // Watch and Clock Repairers
      "49-9071", // Maintenance and Repair Workers, General
      "49-9081", // Wind Turbine Service Technicians
      "49-9091", // Coin, Vending, and Amusement Machine Servicers and Repairers
      "49-9092", // Commercial Divers
      "49-9093", // Fabric Menders, Except Garment
      "49-9094", // Locksmiths and Safe Repairers
      "49-9095", // Manufactured Building and Mobile Home Installers
      "49-9096", // Riggers
      "49-9097", // Signal and Track Switch Repairers
      "49-9098", // Helpers--Installation, Maintenance, and Repair Workers
      
      // Production Occupations (51-XXXX)
      "51-1011", // First-Line Supervisors of Production and Operating Workers
      "51-2011", // Aircraft Structure, Surfaces, Rigging, and Systems Assemblers
      "51-2021", // Coil Winders, Tapers, and Finishers
      "51-2022", // Electrical and Electronic Equipment Assemblers
      "51-2023", // Electromechanical Equipment Assemblers
      "51-2031", // Engine and Other Machine Assemblers
      "51-2041", // Structural Metal Fabricators and Fitters
      "51-2051", // Fiberglass Laminators and Fabricators
      "51-2061", // Timing Device Assemblers and Adjusters
      "51-2091", // Fiberglass Laminators and Fabricators
      "51-2092", // Team Assemblers
      "51-2093", // Timing Device Assemblers and Adjusters
      "51-3011", // Bakers
      "51-3021", // Butchers and Meat Cutters
      "51-3022", // Meat, Poultry, and Fish Cutters and Trimmers
      "51-3023", // Slaughterers and Meat Packers
      "51-3091", // Food and Tobacco Roasting, Baking, and Drying Machine Operators and Tenders
      "51-3092", // Food Batchmakers
      "51-3093", // Food Cooking Machine Operators and Tenders
      "51-4011", // Computer-Controlled Machine Tool Operators, Metal and Plastic
      "51-4012", // Computer Numerically Controlled Machine Tool Programmers, Metal and Plastic
      "51-4021", // Extruding and Drawing Machine Setters, Operators, and Tenders, Metal and Plastic
      "51-4022", // Forging Machine Setters, Operators, and Tenders, Metal and Plastic
      "51-4023", // Rolling Machine Setters, Operators, and Tenders, Metal and Plastic
      "51-4031", // Cutting, Punching, and Press Machine Setters, Operators, and Tenders, Metal and Plastic
      "51-4032", // Drilling and Boring Machine Tool Setters, Operators, and Tenders, Metal and Plastic
      "51-4033", // Grinding, Lapping, Polishing, and Buffing Machine Tool Setters, Operators, and Tenders, Metal and Plastic
      "51-4034", // Lathe and Turning Machine Tool Setters, Operators, and Tenders, Metal and Plastic
      "51-4035", // Milling and Planing Machine Setters, Operators, and Tenders, Metal and Plastic
      "51-4041", // Machinists
      "51-4051", // Metal-Refining Furnace Operators and Tenders
      "51-4052", // Pourers and Casters, Metal
      "51-4061", // Model Makers, Metal and Plastic
      "51-4062", // Patternmakers, Metal and Plastic
      "51-4071", // Foundry Mold and Coremakers
    ]
    
    // Initialize occupation titles
    this.occupationTitles = {
      "11-1011": "Chief Executives",
      "11-1021": "General and Operations Managers",
      "11-2011": "Advertising and Promotions Managers",
      "11-2021": "Marketing Managers",
      "11-2022": "Sales Managers",
      "11-2031": "Public Relations and Fundraising Managers",
      "11-3011": "Administrative Services Managers",
      "11-3021": "Computer and Information Systems Managers",
      "11-3031": "Financial Managers",
      "11-3051": "Industrial Production Managers",
      "11-3061": "Purchasing Managers",
      "11-3071": "Transportation, Storage, and Distribution Managers",
      "11-3111": "Compensation and Benefits Managers",
      "11-3121": "Human Resources Managers",
      "11-3131": "Training and Development Managers",
      "11-9013": "Farmers, Ranchers, and Other Agricultural Managers",
      "11-9021": "Construction Managers",
      "11-9031": "Education Administrators, Preschool and Childcare Center/Program",
      "11-9032": "Education Administrators, Elementary and Secondary School",
      "11-9033": "Education Administrators, Postsecondary",
      "11-9041": "Architectural and Engineering Managers",
      "11-9051": "Food Service Managers",
      "11-9071": "Gaming Managers",
      "11-9081": "Lodging Managers",
      "11-9111": "Medical and Health Services Managers",
      "11-9121": "Natural Sciences Managers",
      "11-9131": "Postmasters and Mail Superintendents",
      "11-9141": "Property, Real Estate, and Community Association Managers",
      "11-9151": "Social and Community Service Managers",
      "11-9161": "Emergency Management Directors",
      "13-1011": "Agents and Business Managers of Artists, Performers, and Athletes",
      "13-1021": "Buyers and Purchasing Agents, Farm Products",
      "13-1022": "Wholesale and Retail Buyers, Except Farm Products",
      "13-1023": "Purchasing Agents, Except Wholesale, Retail, and Farm Products",
      "13-1031": "Claims Adjusters, Examiners, and Investigators",
      "13-1041": "Compliance Officers",
      "13-1051": "Cost Estimators",
      "13-1071": "Human Resources",
      "13-2011": "Accountants and Auditors",
      "15-1211": "Computer Systems Analysts", 
      "15-1252": "Software Developers",
      "15-1253": "Software Quality Assurance Analysts and Testers",
      "17-1011": "Architects, Except Landscape and Naval",
      "23-1011": "Lawyers",
      "25-2021": "Elementary School Teachers, Except Special Education",
      "29-1141": "Registered Nurses",
      "33-3051": "Police and Sheriff's Patrol Officers",
      "35-3031": "Waiters and Waitresses",
      "41-2031": "Retail Salespersons",
      "43-3031": "Bookkeeping, Accounting, and Auditing Clerks",
      "43-4051": "Customer Service Representatives",
      "47-2111": "Electricians"
    }

    console.log(`🔄 Initialized with ${this.occupationCodes.length} occupation codes`)
  }

  // ========== PROGRESS UPDATES ==========

  private startProgressUpdates(): void {
    if (this.progressUpdateInterval) {
      this.stopProgressUpdates()
    }
    this.progressUpdateInterval = setInterval(() => {
      this.updateProgress()
    }, this.config.progressUpdateIntervalMs)
  }

  private stopProgressUpdates(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval)
      this.progressUpdateInterval = null
    }
  }

  private updateProgress(): void {
    this.syncProgress.lastUpdated = new Date().toISOString()
    this.emit("progress", this.getSyncProgress())
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) this.stopHealthCheck()
    this.healthCheckInterval = setInterval(() => this.checkHealth(), this.config.healthCheckIntervalMs)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  private checkHealth(): void {
    const remainingRequests = this.blsService.getTotalRemainingRequests()
    if (remainingRequests < 10) {
      console.warn(`⚠️ Low API requests remaining: ${remainingRequests}`)
      this.emit("healthWarning", { type: "lowApiRequests", remainingRequests })
    }
  }

  private createCheckpoint(): void {
    const checkpoint: SyncCheckpoint = {
      timestamp: new Date().toISOString(),
      processedJobs: this.syncProgress.processedJobs,
      successfulJobs: this.syncProgress.successfulJobs,
      failedJobs: this.syncProgress.failedJobs,
      lastProcessedCode: this.syncProgress.currentJob,
      batchNumber: this.syncProgress.currentBatch || 0,
    }
    this.syncProgress.checkpoints.push(checkpoint)
    if (this.syncProgress.checkpoints.length > 10) {
      this.syncProgress.checkpoints = this.syncProgress.checkpoints.slice(-10)
    }
  }

  private resetSyncProgress(): void {
    this.syncProgress = {
      isRunning: false,
      totalJobs: 0,
      processedJobs: 0,
      successfulJobs: 0,  
      failedJobs: 0,
      skippedJobs: 0,
      startTime: null,
      endTime: null,
      lastUpdated: new Date().toISOString(),
      checkpoints: [],
      apiKeysStatus: {
        totalKeys: 0,
        totalDailyLimit: 0,
        totalRemainingRequests: 0,
        keyStatuses: [],
      },
    }
  }

  private prepareToResume(): void {
    if (this.syncProgress.checkpoints.length === 0) {
      this.resetSyncProgress()
      return
    }
    const lastCheckpoint = this.syncProgress.checkpoints[this.syncProgress.checkpoints.length - 1]
    this.syncProgress.processedJobs = lastCheckpoint.processedJobs
    this.syncProgress.successfulJobs = lastCheckpoint.successfulJobs
    this.syncProgress.failedJobs = lastCheckpoint.failedJobs
    this.syncProgress.currentBatch = lastCheckpoint.batchNumber
  }

  private recordProcessingTime(timeMs: number): void {
    this.lastProcessingTime.push(timeMs)
    if (this.lastProcessingTime.length > 50) {
      this.lastProcessingTime.shift()
    }
  }

  private getAverageProcessingTime(): number {
    if (this.lastProcessingTime.length === 0) return 1000
    const sum = this.lastProcessingTime.reduce((acc, time) => acc + time, 0)
    return sum / this.lastProcessingTime.length
  }
}
