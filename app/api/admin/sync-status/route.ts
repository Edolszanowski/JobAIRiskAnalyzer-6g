import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    // Get API keys configuration
    const apiKeys = [process.env.BLS_API_KEY, process.env.BLS_API_KEY_2, process.env.BLS_API_KEY_3].filter(Boolean)

    // Get database stats
    const [jobStats] = await sql`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN ai_impact_score IS NOT NULL THEN 1 END) as processed_jobs,
        COUNT(CASE WHEN ai_impact_score > 80 THEN 1 END) as high_risk_jobs,
        AVG(ai_impact_score) as avg_impact_score
      FROM jobs
    `

    // Mock sync status (in production, this would come from Redis or database)
    const syncStatus = {
      isRunning: false,
      totalJobs: 850,
      processedJobs: Number.parseInt(jobStats.processed_jobs) || 0,
      successfulJobs: Number.parseInt(jobStats.processed_jobs) || 0,
      failedJobs: 0,
      currentJob: null,
      estimatedTimeRemaining: null,
      lastUpdated: new Date().toISOString(),
      apiKeysStatus: {
        totalKeys: apiKeys.length,
        totalDailyLimit: apiKeys.length * 500,
        totalRemainingRequests: apiKeys.length * 500, // Mock remaining requests
        keyStatuses: apiKeys.map((key, index) => ({
          keyPreview: `${key?.substring(0, 8)}...${key?.substring(key.length - 4)}`,
          requestsUsed: Math.floor(Math.random() * 100), // Mock usage
          requestsRemaining: 500 - Math.floor(Math.random() * 100),
          isBlocked: false,
        })),
      },
    }

    return NextResponse.json(syncStatus)
  } catch (error) {
    console.error("Error fetching sync status:", error)
    return NextResponse.json(
      {
        isRunning: false,
        totalJobs: 850,
        processedJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        currentJob: null,
        estimatedTimeRemaining: null,
        lastUpdated: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        apiKeysStatus: {
          totalKeys: 0,
          totalDailyLimit: 0,
          totalRemainingRequests: 0,
          keyStatuses: [],
        },
      },
      { status: 200 }, // Always return 200 to prevent frontend crashes
    )
  }
}
