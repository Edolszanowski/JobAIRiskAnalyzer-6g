import { neon } from "@neondatabase/serverless"

// Initialize the database connection
const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL

if (!databaseUrl) {
  throw new Error(
    "Database URL not found. Please set DATABASE_URL, NEON_DATABASE_URL, or POSTGRES_URL environment variable.",
  )
}

export const sql = neon(databaseUrl)

// Database connection configuration
export const dbConfig = {
  connectionTimeoutMillis: 10000, // 10 seconds
  idleTimeoutMillis: 30000, // 30 seconds
  max: 20, // Maximum number of connections in pool
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1 as test`
    return true
  } catch (error) {
    console.error("Database connection test failed:", error)
    return false
  }
}

// Get database status
export async function getDatabaseStatus() {
  try {
    const startTime = Date.now()
    await sql`SELECT 1 as test`
    const responseTime = Date.now() - startTime

    // Check if required tables exist
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('jobs', 'job_codes')
    `

    const existingTables = tables.map((row: any) => row.table_name)
    const requiredTables = ["jobs", "job_codes"]
    const missingTables = requiredTables.filter((table) => !existingTables.includes(table))

    // Get job statistics if tables exist
    const jobStats = {
      totalJobs: 0,
      jobsWithAI: 0,
      completionRate: 0,
    }

    if (existingTables.includes("jobs")) {
      const [totalResult] = await sql`SELECT COUNT(*) as count FROM jobs`
      const [aiResult] = await sql`SELECT COUNT(*) as count FROM jobs WHERE ai_impact_score IS NOT NULL`

      jobStats.totalJobs = Number.parseInt(totalResult.count)
      jobStats.jobsWithAI = Number.parseInt(aiResult.count)
      jobStats.completionRate =
        jobStats.totalJobs > 0 ? Math.round((jobStats.jobsWithAI / jobStats.totalJobs) * 100) : 0
    }

    return {
      connected: true,
      responseTime,
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
      error: error instanceof Error ? error.message : "Unknown database error",
      timestamp: new Date().toISOString(),
    }
  }
}

// Initialize database tables
export async function initializeTables() {
  try {
    console.log("🗄️ Initializing database tables...")

    // Create jobs table
    await sql`
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

    // Create job_codes table
    await sql`
      CREATE TABLE IF NOT EXISTS job_codes (
        id SERIAL PRIMARY KEY,
        occ_code VARCHAR(10) UNIQUE NOT NULL,
        occ_title VARCHAR(255) NOT NULL,
        major_group VARCHAR(100),
        minor_group VARCHAR(100),
        broad_occupation VARCHAR(100),
        detailed_occupation VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `

    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_occ_code ON jobs(occ_code)`
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_ai_impact ON jobs(ai_impact_score)`
    await sql`CREATE INDEX IF NOT EXISTS idx_jobs_title ON jobs(occ_title)`
    await sql`CREATE INDEX IF NOT EXISTS idx_job_codes_occ_code ON job_codes(occ_code)`

    console.log("✅ Database tables initialized successfully")
    return { success: true, message: "Database tables created successfully" }
  } catch (error) {
    console.error("❌ Failed to initialize database tables:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// Utility functions for common database operations
export async function getJobByCode(occupationCode: string) {
  try {
    const result = await sql`
      SELECT * FROM jobs WHERE occ_code = ${occupationCode}
    `
    return result[0] || null
  } catch (error) {
    console.error(`Error fetching job ${occupationCode}:`, error)
    return null
  }
}

export async function searchJobs(query: string, limit = 20) {
  try {
    const searchTerm = `%${query.toLowerCase()}%`
    const result = await sql`
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

export async function getJobRankings(sortBy = "ai_impact_score", order = "desc", limit = 50, offset = 0) {
  try {
    const result = await sql`
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
