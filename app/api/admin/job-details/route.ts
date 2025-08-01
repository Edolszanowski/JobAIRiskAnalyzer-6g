import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET() {
  try {
    // Get comprehensive job statistics
    const [stats] = await sql`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN ai_impact_score IS NOT NULL AND ai_impact_score > 0 THEN 1 END) as jobs_with_ai_analysis,
        COALESCE(AVG(CASE WHEN ai_impact_score > 0 THEN ai_impact_score END), 0) as average_ai_impact,
        COUNT(CASE WHEN ai_impact_score >= 80 THEN 1 END) as high_risk_jobs,
        COUNT(CASE WHEN ai_impact_score >= 60 AND ai_impact_score < 80 THEN 1 END) as medium_high_risk_jobs,
        COUNT(CASE WHEN ai_impact_score >= 40 AND ai_impact_score < 60 THEN 1 END) as medium_risk_jobs,
        COUNT(CASE WHEN ai_impact_score < 40 AND ai_impact_score > 0 THEN 1 END) as low_risk_jobs,
        MAX(updated_at) as last_updated
      FROM jobs
    `

    // Get recent jobs
    const recentJobs = await sql`
      SELECT occ_code, occ_title, ai_impact_score, automation_risk, updated_at
      FROM jobs 
      WHERE ai_impact_score IS NOT NULL 
      ORDER BY updated_at DESC 
      LIMIT 10
    `

    // Get top high-risk jobs
    const highRiskJobs = await sql`
      SELECT occ_code, occ_title, ai_impact_score, automation_risk, median_wage
      FROM jobs 
      WHERE ai_impact_score >= 80 
      ORDER BY ai_impact_score DESC 
      LIMIT 10
    `

    // Get low-risk jobs
    const lowRiskJobs = await sql`
      SELECT occ_code, occ_title, ai_impact_score, automation_risk, median_wage
      FROM jobs 
      WHERE ai_impact_score < 20 AND ai_impact_score > 0
      ORDER BY ai_impact_score ASC 
      LIMIT 10
    `

    const response = {
      totalJobs: Number.parseInt(stats.total_jobs) || 0,
      jobsWithAIAnalysis: Number.parseInt(stats.jobs_with_ai_analysis) || 0,
      averageAIImpact: Number.parseFloat(stats.average_ai_impact) || 0,
      highRiskJobs: Number.parseInt(stats.high_risk_jobs) || 0,
      mediumHighRiskJobs: Number.parseInt(stats.medium_high_risk_jobs) || 0,
      mediumRiskJobs: Number.parseInt(stats.medium_risk_jobs) || 0,
      lowRiskJobs: Number.parseInt(stats.low_risk_jobs) || 0,
      lastUpdated: stats.last_updated || new Date().toISOString(),
      recentJobs: recentJobs.map((job: any) => ({
        code: job.occ_code,
        title: job.occ_title,
        aiImpactScore: job.ai_impact_score,
        automationRisk: job.automation_risk,
        updatedAt: job.updated_at,
      })),
      highRiskJobsList: highRiskJobs.map((job: any) => ({
        code: job.occ_code,
        title: job.occ_title,
        aiImpactScore: job.ai_impact_score,
        automationRisk: job.automation_risk,
        medianWage: job.median_wage,
      })),
      lowRiskJobsList: lowRiskJobs.map((job: any) => ({
        code: job.occ_code,
        title: job.occ_title,
        aiImpactScore: job.ai_impact_score,
        automationRisk: job.automation_risk,
        medianWage: job.median_wage,
      })),
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error fetching job details:", error)

    // Return default values instead of throwing error
    const defaultResponse = {
      totalJobs: 0,
      jobsWithAIAnalysis: 0,
      averageAIImpact: 0,
      highRiskJobs: 0,
      mediumHighRiskJobs: 0,
      mediumRiskJobs: 0,
      lowRiskJobs: 0,
      lastUpdated: new Date().toISOString(),
      recentJobs: [],
      highRiskJobsList: [],
      lowRiskJobsList: [],
      error: error instanceof Error ? error.message : "Database connection error",
    }

    return NextResponse.json(defaultResponse, { status: 200 }) // Always return 200
  }
}
