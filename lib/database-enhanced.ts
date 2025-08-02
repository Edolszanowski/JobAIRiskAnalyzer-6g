import { neon, NeonQueryFunction } from "@neondatabase/serverless"
import { RetryableError, withRetry } from "./error-handler"

// ========== TYPES AND INTERFACES ==========

export interface DatabaseConfig {
  connectionTimeoutMillis: number
  idleTimeoutMillis: number
  max: number
  retryAttempts: number
  baseRetryDelayMs: number
  healthCheckIntervalMs: number
  circuitBreakerThreshold: number
  circuitBreakerResetTimeMs: number
}

export interface DatabaseStatus {
  connected: boolean
  responseTime?: number
  circuitBreakerOpen?: boolean
  lastError?: string
  lastErrorTime?: string
  consecutiveFailures?: number
  tables?: {
    existing: string[]
    missing: string[]
    ready: boolean
  }
  data?: {
    totalJobs: number
    jobsWithAI: number
    completionRate: number
  }
  timestamp: string
}

interface CircuitBreakerState {
  isOpen: boolean
  failureCount: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ========== CONFIGURATION ==========

// Default database configuration
export const dbConfig: DatabaseConfig = {
  // Shorter connection timeout is better in serverless functions where
  // cold-starts or network glitches need quick retries.
  connectionTimeoutMillis: 3000, // 3 seconds
  idleTimeoutMillis: 30000, // 30 seconds
  max: 20, // Maximum number of connections in pool
  retryAttempts: 5,
  baseRetryDelayMs: 100,
  healthCheckIntervalMs: 60000, // 1 minute
  circuitBreakerThreshold: 5, // Number of failures before opening circuit
  circuitBreakerResetTimeMs: 30000, // 30 seconds before attempting reset
}

// Initialize the database connection
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL

if (!databaseUrl) {
  throw new Error(
    "Database URL not found. Please set DATABASE_URL, NEON_DATABASE_URL, or POSTGRES_URL environment variable."
  )
}

// Basic SQL client - maintained for backward compatibility
export const sql = neon(databaseUrl)

// ========== CIRCUIT BREAKER IMPLEMENTATION ==========

// Circuit breaker state
const circuitBreaker: CircuitBreakerState = {
  isOpen: false,
  failureCount: 0,
  lastFailureTime: null,
  lastSuccessTime: null,
}

// Reset circuit breaker
function resetCircuitBreaker() {
  circuitBreaker.isOpen = false
  circuitBreaker.failureCount = 0
  console.log("🔌 Circuit breaker reset - database connections resumed")
}

// Check if circuit breaker should be reset
function checkCircuitBreakerReset() {
  if (
    circuitBreaker.isOpen &&
    circuitBreaker.lastFailureTime &&
    Date.now() - circuitBreaker.lastFailureTime > dbConfig.circuitBreakerResetTimeMs
  ) {
    resetCircuitBreaker()
  }
}

// Record database operation success
function recordSuccess() {
  circuitBreaker.lastSuccessTime = Date.now()
  if (circuitBreaker.failureCount > 0) {
    circuitBreaker.failureCount = 0
  }
}

// Record database operation failure
function recordFailure(error: any) {
  circuitBreaker.failureCount++
  circuitBreaker.lastFailureTime = Date.now()

  if (circuitBreaker.failureCount >= dbConfig.circuitBreakerThreshold) {
    if (!circuitBreaker.isOpen) {
      circuitBreaker.isOpen = true
      console.error(`🔌 Circuit breaker opened after ${dbConfig.circuitBreakerThreshold} consecutive failures`)
      console.error(`Last error: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// ========== ENHANCED DATABASE CLIENT ==========

// Enhanced SQL function with circuit breaker and retry logic
export async function sqlEnhanced<T = any>(
  query: string | TemplateStringsArray | { text: string; values: any[] },
  ...values: any[]
): Promise<T[]> {
  // Check if circuit breaker should be reset based on timeout
  checkCircuitBreakerReset()

  // If circuit breaker is open, throw error to prevent database calls
  if (circuitBreaker.isOpen) {
    throw new RetryableError(
      `Database circuit breaker is open due to multiple failures. Last failure at ${
        circuitBreaker.lastFailureTime ? new Date(circuitBreaker.lastFailureTime).toISOString() : "unknown"
      }`,
      Math.max(0, dbConfig.circuitBreakerResetTimeMs - (Date.now() - (circuitBreaker.lastFailureTime || 0))) / 1000
    )
  }

  // Execute query with retry logic
  try {
    const result = await withRetry(
      async () => {
        try {
          // For template strings or direct queries
          if (typeof query === "string" || Array.isArray(query)) {
            return await sql(query, ...values)
          }
          // For parameterized queries
          else {
            return await sql(query.text, ...query.values)
          }
        } catch (error) {
          // Categorize errors for better retry decisions
          if (error instanceof Error) {
            const errorMsg = error.message.toLowerCase()
            
            // Connection errors - retryable
            if (
              errorMsg.includes("connection") ||
              errorMsg.includes("timeout") ||
              errorMsg.includes("socket") ||
              errorMsg.includes("network") ||
              errorMsg.includes("fetch failed") ||
              errorMsg.includes("und_err_socket") ||
              errorMsg.includes("other side closed")
            ) {
              // Very small delay (0.2s) to allow an almost-immediate retry,
              // which is often enough to recover from transient Neon ↔︎ Vercel
              // connection drops.
              throw new RetryableError(`Database connection error: ${error.message}`, 0.2)
            }
            
            // Lock or deadlock errors - retryable
            if (errorMsg.includes("lock") || errorMsg.includes("deadlock")) {
              throw new RetryableError(`Database lock error: ${error.message}`, 1)
            }
            
            // Rate limit or too many connections - retryable with longer delay
            if (errorMsg.includes("rate") || errorMsg.includes("too many connections")) {
              throw new RetryableError(`Database rate limit error: ${error.message}`, 5)
            }
          }
          
          // Re-throw non-retryable errors
          throw error
        }
      },
      dbConfig.retryAttempts,
      dbConfig.baseRetryDelayMs
    )

    // Record successful operation
    recordSuccess()
    return result
  } catch (error) {
    // Record failure and potentially open circuit breaker
    recordFailure(error)
    throw error
  }
}

// ========== HEALTH MONITORING ==========

// Test database connection with enhanced error handling
export async function testDatabaseConnection(): Promise<{ success: boolean; error?: string; responseTime?: number }> {
  try {
    const startTime = Date.now()
    await sqlEnhanced`SELECT 1 as test`
    const responseTime = Date.now() - startTime

    return {
      success: true,
      responseTime,
    }
  } catch (error) {
    console.error("Database connection test failed:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown database error",
    }
  }
}

// Get comprehensive database status
export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  try {
    // First check if circuit breaker is open
    if (circuitBreaker.isOpen) {
      return {
        connected: false,
        circuitBreakerOpen: true,
        lastError: "Circuit breaker is open due to multiple failures",
        lastErrorTime: circuitBreaker.lastFailureTime 
          ? new Date(circuitBreaker.lastFailureTime).toISOString()
          : undefined,
        consecutiveFailures: circuitBreaker.failureCount,
        timestamp: new Date().toISOString(),
      }
    }

    const startTime = Date.now()
    await sqlEnhanced`SELECT 1 as test`
    const responseTime = Date.now() - startTime

    // Check if required tables exist
    const tables = await sqlEnhanced<{ table_name: string }>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('jobs')
    `

    const existingTables = tables.map((row) => row.table_name)
    const requiredTables = ["jobs"]
    const missingTables = requiredTables.filter((table) => !existingTables.includes(table))

    // Get job statistics if tables exist
    const jobStats = {
      totalJobs: 0,
      jobsWithAI: 0,
      completionRate: 0,
    }

    if (existingTables.includes("jobs")) {
      const [totalResult] = await sqlEnhanced<{ count: string }>`SELECT COUNT(*) as count FROM jobs`
      const [aiResult] = await sqlEnhanced<{ count: string }>`
        SELECT COUNT(*) as count FROM jobs WHERE ai_impact_score IS NOT NULL
      `

      jobStats.totalJobs = Number.parseInt(totalResult.count)
      jobStats.jobsWithAI = Number.parseInt(aiResult.count)
      jobStats.completionRate =
        jobStats.totalJobs > 0 ? Math.round((jobStats.jobsWithAI / jobStats.totalJobs) * 100) : 0
    }

    return {
      connected: true,
      responseTime,
      circuitBreakerOpen: false,
      consecutiveFailures: circuitBreaker.failureCount,
      tables: {
        existing: existingTables,
        missing: missingTables,
        ready: missingTables.length === 0,
      },
      data: jobStats,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return {
      connected: false,
      circuitBreakerOpen: circuitBreaker.isOpen,
      lastError: error instanceof Error ? error.message : "Unknown database error",
      lastErrorTime: new Date().toISOString(),
      consecutiveFailures: circuitBreaker.failureCount,
      timestamp: new Date().toISOString(),
    }
  }
}

// ========== DATA VALIDATION ==========

// Validate job data before insertion/update
export function validateJobData(jobData: any): ValidationResult {
  const errors: string[] = []

  // Required fields
  if (!jobData.occ_code) errors.push("Occupation code is required")
  if (!jobData.occ_title) errors.push("Occupation title is required")

  // Format validation
  if (jobData.occ_code && !/^\d{2}-\d{4}$/.test(jobData.occ_code)) {
    errors.push("Occupation code must be in format XX-XXXX")
  }

  // Data type validation
  if (jobData.employment_2023 !== undefined && (isNaN(jobData.employment_2023) || jobData.employment_2023 < 0)) {
    errors.push("Employment must be a positive number")
  }

  if (jobData.median_wage !== undefined && (isNaN(jobData.median_wage) || jobData.median_wage < 0)) {
    errors.push("Median wage must be a positive number")
  }

  if (
    jobData.ai_impact_score !== undefined &&
    (isNaN(jobData.ai_impact_score) || jobData.ai_impact_score < 0 || jobData.ai_impact_score > 100)
  ) {
    errors.push("AI impact score must be a number between 0 and 100")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ========== TRANSACTION MANAGEMENT ==========

// Execute operations in a transaction with automatic rollback on error
export async function withTransaction<T>(operations: (client: NeonQueryFunction<any>) => Promise<T>): Promise<T> {
  try {
    // Start transaction
    await sqlEnhanced`BEGIN`
    
    try {
      // Execute operations
      const result = await operations(sql)
      
      // Commit transaction
      await sqlEnhanced`COMMIT`
      return result
    } catch (error) {
      // Rollback on error
      console.error("Transaction error, rolling back:", error)
      await sqlEnhanced`ROLLBACK`
      throw error
    }
  } catch (error) {
    // Handle case where even the BEGIN or ROLLBACK fails
    console.error("Critical transaction error:", error)
    
    // Try to rollback if possible
    try {
      await sql`ROLLBACK`
    } catch (rollbackError) {
      console.error("Rollback also failed:", rollbackError)
    }
    
    throw error
  }
}

// ========== BATCH OPERATIONS ==========

// Insert multiple records efficiently
export async function batchInsertJobs(jobs: any[]): Promise<{ success: boolean; inserted: number; errors: any[] }> {
  const errors: any[] = []
  let inserted = 0

  try {
    await withTransaction(async (client) => {
      for (const job of jobs) {
        // Validate job data
        const validation = validateJobData(job)
        if (!validation.valid) {
          errors.push({ job: job.occ_code, errors: validation.errors })
          continue
        }

        try {
          // Insert job
          await client`
            INSERT INTO jobs (
              occ_code, occ_title, employment_2023, projected_employment_2033, 
              median_wage, ai_impact_score, automation_risk, created_at, updated_at
            ) VALUES (
              ${job.occ_code}, ${job.occ_title}, ${job.employment_2023 || null}, ${job.projected_employment_2033 || null},
              ${job.median_wage || null}, ${job.ai_impact_score || null}, ${job.automation_risk || null}, 
              NOW(), NOW()
            )
            ON CONFLICT (occ_code) 
            DO UPDATE SET 
              occ_title = ${job.occ_title},
              employment_2023 = COALESCE(${job.employment_2023}, jobs.employment_2023),
              projected_employment_2033 = COALESCE(${job.projected_employment_2033}, jobs.projected_employment_2033),
              median_wage = COALESCE(${job.median_wage}, jobs.median_wage),
              ai_impact_score = COALESCE(${job.ai_impact_score}, jobs.ai_impact_score),
              automation_risk = COALESCE(${job.automation_risk}, jobs.automation_risk),
              updated_at = NOW()
          `
          inserted++
        } catch (error) {
          errors.push({ job: job.occ_code, error: error instanceof Error ? error.message : "Unknown error" })
        }
      }
    })

    return {
      success: true,
      inserted,
      errors,
    }
  } catch (error) {
    return {
      success: false,
      inserted,
      errors: [...errors, { error: error instanceof Error ? error.message : "Transaction failed" }],
    }
  }
}

// ========== UTILITY FUNCTIONS ==========

// Initialize database tables with enhanced error handling
export async function initializeTables(): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    console.log("🗄️ Initializing database tables...")

    await withTransaction(async (client) => {
      // Create jobs table
      await client`
        CREATE TABLE IF NOT EXISTS jobs (
          id SERIAL PRIMARY KEY,
          occ_code VARCHAR(10) UNIQUE NOT NULL,
          occ_title VARCHAR(255) NOT NULL,
          employment_2023 INTEGER,
          projected_employment_2033 INTEGER,
          median_wage INTEGER,
          ai_impact_score INTEGER,
          automation_risk VARCHAR(20),
          key_tasks TEXT,
          ai_analysis TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `

      // Create indexes for better performance
      await client`CREATE INDEX IF NOT EXISTS idx_jobs_occ_code ON jobs(occ_code)`
      await client`CREATE INDEX IF NOT EXISTS idx_jobs_ai_impact ON jobs(ai_impact_score)`
      await client`CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(occ_title)`
    }) // ← close withTransaction block

    console.log("✅ Database tables initialized successfully")
    return { success: true, message: "Database tables created successfully" }
  } catch (error) {
    console.error("❌ Failed to initialize database tables:", error)
    return {
      success: false,
      message: "Failed to initialize database tables",
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// Get job by occupation code with enhanced error handling
export async function getJobByCode(occupationCode: string) {
  try {
    const result = await sqlEnhanced<any>`
      SELECT * FROM jobs WHERE occ_code = ${occupationCode}
    `
    return result[0] || null
  } catch (error) {
    console.error(`Error fetching job ${occupationCode}:`, error)
    return null
  }
}

// Search jobs with enhanced error handling
export async function searchJobs(query: string, limit = 20) {
  try {
    const searchTerm = `%${query.toLowerCase()}%`
    const result = await sqlEnhanced<any>`
      SELECT 
        occ_code, occ_title, ai_impact_score, automation_risk, median_wage
      FROM jobs 
      WHERE LOWER(occ_title) LIKE ${searchTerm}
      AND ai_impact_score IS NOT NULL
      ORDER BY 
        CASE 
          WHEN LOWER(occ_title) = ${query.toLowerCase()} THEN 1
          WHEN LOWER(occ_title) LIKE ${query.toLowerCase() + "%"} THEN 2
          ELSE 3
        END,
        ai_impact_score DESC
      LIMIT ${limit}
    `
    return result
  } catch (error) {
    console.error("Error searching jobs:", error)
    return []
  }
}

// Get job rankings with enhanced error handling
export async function getJobRankings(sortBy = "ai_impact_score", order = "desc", limit = 50, offset = 0) {
  try {
    // Validate sortBy to prevent SQL injection
    const validSortColumns = [
      "occ_code",
      "occ_title",
      "employment_2023",
      "projected_employment_2033",
      "median_wage",
      "ai_impact_score",
      "updated_at",
    ]
    
    if (!validSortColumns.includes(sortBy)) {
      sortBy = "ai_impact_score" // Default to safe value if invalid
    }
    
    // Validate order
    if (order !== "asc" && order !== "desc") {
      order = "desc" // Default to safe value if invalid
    }

    const result = await sqlEnhanced<any>`
      SELECT 
        occ_code, occ_title, employment_2023, projected_employment_2033,
        median_wage, ai_impact_score, automation_risk, updated_at
      FROM jobs 
      WHERE ai_impact_score IS NOT NULL
      ORDER BY ${sql.unsafe(sortBy)} ${sql.unsafe(order)}
      LIMIT ${limit}
      OFFSET ${offset}
    `
    return result
  } catch (error) {
    console.error("Error fetching job rankings:", error)
    return []
  }
}

// ========== PERIODIC HEALTH CHECK ==========

// Start periodic health check (call this when app initializes)
export function startHealthCheck(intervalMs = dbConfig.healthCheckIntervalMs): NodeJS.Timeout {
  console.log(`🏥 Starting database health check (interval: ${intervalMs}ms)`)
  
  return setInterval(async () => {
    try {
      const status = await testDatabaseConnection()
      if (!status.success) {
        console.error(`❌ Database health check failed: ${status.error}`)
        
        // Try to reset circuit breaker if it's been open for too long
        checkCircuitBreakerReset()
      } else {
        // If successful and circuit breaker is open, consider resetting it
        if (circuitBreaker.isOpen) {
          console.log("🔄 Health check passed while circuit breaker open, resetting circuit breaker")
          resetCircuitBreaker()
        }
      }
    } catch (error) {
      console.error("❌ Error during database health check:", error)
    }
  }, intervalMs)
}

// Stop health check
export function stopHealthCheck(intervalId: NodeJS.Timeout) {
  clearInterval(intervalId)
  console.log("🛑 Database health check stopped")
}
