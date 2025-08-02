import { NextResponse } from "next/server"
import { sqlEnhanced } from "@/lib/database-enhanced"

interface JobDetails {
  totalJobs: number
  jobsWithAIAnalysis: number
  averageAIImpact: number
  highRiskJobs: number
  mediumHighRiskJobs: number
  mediumRiskJobs: number
  lowRiskJobs: number
  lastUpdated: string
  recentJobs: Array<{
    code: string
    title: string
    aiImpactScore: number
    automationRisk: string
    updatedAt: string
  }>
  error?: string
}

/**
 * GET /api/admin/job-details
 * Returns analytics and details about jobs in the database
 */
export async function GET() {
  try {
    // Initialize default response
    const defaultResponse: JobDetails = {
      totalJobs: 0,
      jobsWithAIAnalysis: 0,
      averageAIImpact: 0,
      highRiskJobs: 0,
      mediumHighRiskJobs: 0,
      mediumRiskJobs: 0,
      lowRiskJobs: 0,
      lastUpdated: new Date().toISOString(),
      recentJobs: [],
    }

    // Check if database has jobs table
    try {
      // Get total number of jobs
      const [totalResult] = await sqlEnhanced<{ count: string }>`
        SELECT COUNT(*) as count FROM jobs
      `
      
      const totalJobs = parseInt(totalResult?.count || "0", 10)
      
      // If no jobs exist yet, return default response
      if (totalJobs === 0) {
        return NextResponse.json({
          ...defaultResponse,
          message: "No jobs in database yet",
        })
      }
      
      // Get jobs with AI analysis
      const [analyzedResult] = await sqlEnhanced<{ count: string }>`
        SELECT COUNT(*) as count FROM jobs 
        WHERE ai_impact_score IS NOT NULL
      `
      
      const jobsWithAIAnalysis = parseInt(analyzedResult?.count || "0", 10)
      
      // Get average AI impact score
      const [avgResult] = await sqlEnhanced<{ avg: string }>`
        SELECT AVG(ai_impact_score) as avg FROM jobs 
        WHERE ai_impact_score IS NOT NULL
      `
      
      const averageAIImpact = parseFloat(avgResult?.avg || "0")
      
      // Get risk distribution
      const [highRiskResult] = await sqlEnhanced<{ count: string }>`
        SELECT COUNT(*) as count FROM jobs 
        WHERE ai_impact_score >= 80
      `
      
      const [mediumHighRiskResult] = await sqlEnhanced<{ count: string }>`
        SELECT COUNT(*) as count FROM jobs 
        WHERE ai_impact_score >= 60 AND ai_impact_score < 80
      `
      
      const [mediumRiskResult] = await sqlEnhanced<{ count: string }>`
        SELECT COUNT(*) as count FROM jobs 
        WHERE ai_impact_score >= 40 AND ai_impact_score < 60
      `
      
      const [lowRiskResult] = await sqlEnhanced<{ count: string }>`
        SELECT COUNT(*) as count FROM jobs 
        WHERE ai_impact_score < 40 AND ai_impact_score IS NOT NULL
      `
      
      const highRiskJobs = parseInt(highRiskResult?.count || "0", 10)
      const mediumHighRiskJobs = parseInt(mediumHighRiskResult?.count || "0", 10)
      const mediumRiskJobs = parseInt(mediumRiskResult?.count || "0", 10)
      const lowRiskJobs = parseInt(lowRiskResult?.count || "0", 10)
      
      // Get recent jobs that have been analyzed
      const recentJobs = await sqlEnhanced<{
        occ_code: string
        occ_title: string
        ai_impact_score: number
        automation_risk: string
        updated_at: string
      }>`
        SELECT 
          occ_code, 
          occ_title, 
          ai_impact_score, 
          automation_risk, 
          updated_at
        FROM jobs 
        WHERE ai_impact_score IS NOT NULL
        ORDER BY updated_at DESC
        LIMIT 10
      `
      
      // Format recent jobs for response
      const formattedRecentJobs = recentJobs.map(job => ({
        code: job.occ_code,
        title: job.occ_title,
        aiImpactScore: job.ai_impact_score,
        automationRisk: job.automation_risk,
        updatedAt: job.updated_at
      }))
      
      // Get last updated timestamp
      const lastUpdated = formattedRecentJobs.length > 0 
        ? formattedRecentJobs[0].updatedAt 
        : new Date().toISOString()
      
      // Return complete job details
      return NextResponse.json({
        totalJobs,
        jobsWithAIAnalysis,
        averageAIImpact,
        highRiskJobs,
        mediumHighRiskJobs,
        mediumRiskJobs,
        lowRiskJobs,
        lastUpdated,
        recentJobs: formattedRecentJobs,
      })
      
    } catch (dbError) {
      console.error("Database query error:", dbError)
      
      // If database tables don't exist yet, return default response
      return NextResponse.json({
        ...defaultResponse,
        error: "Database tables not initialized or query error",
      })
    }
  } catch (error) {
    console.error("Error getting job details:", error)
    
    return NextResponse.json(
      {
        totalJobs: 0,
        jobsWithAIAnalysis: 0,
        averageAIImpact: 0,
        highRiskJobs: 0,
        mediumHighRiskJobs: 0,
        mediumRiskJobs: 0,
        lowRiskJobs: 0,
        lastUpdated: new Date().toISOString(),
        recentJobs: [],
        error: error instanceof Error ? error.message : "Unknown error getting job details",
      },
      { status: 500 }
    )
  }
}
