import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

export async function GET() {
  try {
    const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL

    if (!databaseUrl) {
      return NextResponse.json({
        connected: false,
        error: "No database URL configured",
        timestamp: new Date().toISOString(),
      })
    }

    const sql = neon(databaseUrl)

    // Test basic connection
    const startTime = Date.now()
    await sql`SELECT 1 as test`
    const responseTime = Date.now() - startTime

    // Check if tables exist
    const tablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('jobs', 'job_codes')
    `

    const existingTables = tablesResult.map((row: any) => row.table_name)
    const requiredTables = ["jobs", "job_codes"]
    const missingTables = requiredTables.filter((table) => !existingTables.includes(table))

    // Get job count if tables exist
    let jobCount = 0
    let jobsWithAI = 0

    if (existingTables.includes("jobs")) {
      try {
        const countResult = await sql`SELECT COUNT(*) as count FROM jobs`
        jobCount = Number.parseInt(countResult[0].count)

        const aiCountResult = await sql`SELECT COUNT(*) as count FROM jobs WHERE ai_impact_score IS NOT NULL`
        jobsWithAI = Number.parseInt(aiCountResult[0].count)
      } catch (error) {
        console.log("Error counting jobs:", error)
      }
    }

    return NextResponse.json({
      connected: true,
      responseTime,
      database: {
        url: databaseUrl.split("@")[1]?.split("/")[0] || "unknown",
        tables: {
          existing: existingTables,
          missing: missingTables,
          ready: missingTables.length === 0,
        },
        data: {
          totalJobs: jobCount,
          jobsWithAI: jobsWithAI,
          completionRate: jobCount > 0 ? Math.round((jobsWithAI / jobCount) * 100) : 0,
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Database connection error:", error)

    return NextResponse.json({
      connected: false,
      error: error instanceof Error ? error.message : "Unknown database error",
      timestamp: new Date().toISOString(),
    })
  }
}
