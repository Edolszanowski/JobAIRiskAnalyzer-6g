import { BLSService } from "./bls-service"
import { sqlEnhanced, validateJobData, withTransaction } from "./database-enhanced"
import { RetryableError, withRetry } from "./error-handler"
import { EventEmitter } from "events"

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
    apiKeys: string | string[],
    config: Partial<SyncConfig> = {},
    occupationCodes?: string[],
    occupationTitles?: Record<string, string>
  ) {
    super()
    this.blsService = new BLSService(apiKeys)
    this.config = { ...defaultSyncConfig, ...config }
    
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

    console.log(`🔄 BLS Sync Service initialized with ${this.config.maxConcurrent} concurrent workers`)
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
    // Default list of occupation codes
    this.occupationCodes = [
      "11-1011", // Chief Executives
      "11-1021", // General and Operations Managers
      "11-2021", // Marketing Managers
      "11-3021", // Computer and Information Systems Managers
      "15-1211", // Computer Systems Analysts
      "15-1212", // Information Security Analysts
      "15-1252", // Software Developers
      "15-1254", // Web Developers
      "25-2021", // Elementary School Teachers
      "25-2031", // Secondary School Teachers
      "29-1141", // Registered Nurses
      "29-1171", // Nurse Practitioners
      "33-3051", // Police and Sheriff's Patrol Officers
      "35-3031", // Waiters and Waitresses
      "41-2011", // Cashiers
      "41-2031", // Retail Salespersons
      "43-4051", // Customer Service Representatives
      "43-9061", // Office Clerks, General
      "47-2031", // Carpenters
      "47-2111", // Electricians
      "49-3023", // Automotive Service Technicians and Mechanics
      "53-3032", // Heavy and Tractor-Trailer Truck Drivers
    ]

    // Default titles
    this.occupationTitles = {
      "11-1011": "Chief Executives",
      "11-1021": "General and Operations Managers",
      "11-2021": "Marketing Managers",
      "11-3021": "Computer and Information Systems Managers",
      "15-1211": "Computer Systems Analysts",
      "15-1212": "Information Security Analysts",
      "15-1252": "Software Developers",
      "15-1254": "Web Developers",
      "25-2021": "Elementary School Teachers",
      "25-2031": "Secondary School Teachers",
      "29-1141": "Registered Nurses",
      "29-1171": "Nurse Practitioners",
      "33-3051": "Police and Sheriff's Patrol Officers",
      "35-3031": "Waiters and Waitresses",
      "41-2011": "Cashiers",
      "41-2031": "Retail Salespersons",
      "43-4051": "Customer Service Representatives",
      "43-9061": "Office Clerks, General",
      "47-2031": "Carpenters",
      "47-2111": "Electricians",
      "49-3023": "Automotive Service Technicians and Mechanics",
      "53-3032": "Heavy and Tractor-Trailer Truck Drivers",
    }

    console.log(`📋 Initialized with ${this.occupationCodes.length} default occupation codes`)
  }

  // ========== PROGRESS MANAGEMENT ==========

  /**
   * Reset sync progress
   */
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
    this.lastProcessingTime = []
  }

  /**
   * Prepare to resume from last checkpoint
   */
  private prepareToResume(): void {
    if (this.syncProgress.checkpoints.length === 0) {
      this.resetSyncProgress()
      return
    }

    const lastCheckpoint = this.syncProgress.checkpoints[this.syncProgress.checkpoints.length - 1]
    console.log(`🔄 Resuming from checkpoint: ${lastCheckpoint.processedJobs} jobs processed`)

    // Keep the checkpoint history but update current progress
    this.syncProgress.processedJobs = lastCheckpoint.processedJobs
    this.syncProgress.successfulJobs = lastCheckpoint.successfulJobs
    this.syncProgress.failedJobs = lastCheckpoint.failedJobs
    this.syncProgress.isRunning = false
    this.syncProgress.startTime = null
    this.syncProgress.endTime = null
    this.syncProgress.currentBatch = lastCheckpoint.batchNumber
  }

  /**
   * Create a checkpoint
   */
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
    
    // Keep only the last 10 checkpoints
    if (this.syncProgress.checkpoints.length > 10) {
      this.syncProgress.checkpoints = this.syncProgress.checkpoints.slice(-10)
    }
    
    // Emit checkpoint event
    this.emit("checkpoint", checkpoint)
  }

  /**
   * Start progress update interval
   */
  private startProgressUpdates(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval)
    }

    this.progressUpdateInterval = setInterval(() => {
      this.updateProgress()
    }, this.config.progressUpdateIntervalMs)
  }

  /**
   * Stop progress update interval
   */
  private stopProgressUpdates(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval)
      this.progressUpdateInterval = null
    }
  }

  /**
   * Update progress
   */
  private updateProgress(): void {
    this.syncProgress.lastUpdated = new Date().toISOString()
    
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
    
    // Emit progress event
    this.emit("progress", this.getSyncProgress())
  }

  /**
   * Start health check interval
   */
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, this.config.healthCheckIntervalMs)
  }

  /**
   * Stop health check interval
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Check database connection
      const dbTest = await sqlEnhanced<any>`SELECT 1 as test`
      if (!dbTest || dbTest.length === 0) {
        console.error("❌ Database health check failed")
        this.emit("healthCheck", { type: "database", status: "error" })
      } else {
        this.emit("healthCheck", { type: "database", status: "ok" })
      }

      // Check API key status
      const apiKeyInfo = this.blsService.getCurrentKeyInfo()
      if (!apiKeyInfo) {
        console.error("❌ No available API keys")
        this.emit("healthCheck", { type: "apiKeys", status: "error" })
      } else {
        this.emit("healthCheck", { 
          type: "apiKeys", 
          status: "ok",
          details: {
            availableKeys: this.blsService.getAllKeyStatuses().filter(k => !k.isBlocked).length,
            remainingRequests: this.blsService.getTotalRemainingRequests()
          }
        })
      }
    } catch (error) {
      console.error("❌ Health check error:", error)
      this.emit("healthCheck", { 
        type: "system", 
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      })
    }
  }

  /**
   * Record job processing time
   * @param timeMs Processing time in milliseconds
   */
  private recordProcessingTime(timeMs: number): void {
    // Keep the last 50 processing times for better average calculation
    this.lastProcessingTime.push(timeMs)
    if (this.lastProcessingTime.length > 50) {
      this.lastProcessingTime.shift()
    }
  }

  /**
   * Get average processing time per job
   * @returns Average time in milliseconds
   */
  private getAverageProcessingTime(): number {
    if (this.lastProcessingTime.length === 0) return 1000 // Default to 1 second if no data
    
    const sum = this.lastProcessingTime.reduce((acc, time) => acc + time, 0)
    return sum / this.lastProcessingTime.length
  }
}
