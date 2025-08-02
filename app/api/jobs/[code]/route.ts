import { NextResponse } from "next/server"
import { sqlEnhanced } from "@/lib/database-enhanced"

// Job data type definition
interface Job {
  occ_code: string
  occ_title: string
  description?: string
  employment_2023?: number
  projected_employment_2033?: number
  employment_change?: number
  employment_change_percent?: number
  median_wage?: number
  ai_impact_score?: number
  automation_risk?: string
  updated_at?: string
}

// Similar job type
interface SimilarJob {
  occ_code: string
  occ_title: string
  ai_impact_score?: number
  median_wage?: number
  similarity_score?: number
}

/**
 * GET /api/jobs/[code]
 * Returns detailed information about a specific job by occupation code
 */
export async function GET(
  request: Request,
  { params }: { params: { code: string } }
) {
  try {
    // Get the occupation code from the route parameters
    const code = params.code

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          error: "Occupation code is required",
        },
        { status: 400 }
      )
    }

    // Query the database for the specific job
    const jobs = await sqlEnhanced<Job>`
      SELECT * FROM jobs
      WHERE occ_code = ${code}
      LIMIT 1
    `

    // Check if job exists
    if (!jobs || jobs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Job with code ${code} not found`,
        },
        { status: 404 }
      )
    }

    const job = jobs[0]

    // Calculate employment change if both values exist
    if (job.employment_2023 && job.projected_employment_2033) {
      job.employment_change = job.projected_employment_2033 - job.employment_2023
      
      // Calculate employment change percentage
      if (job.employment_2023 > 0) {
        job.employment_change_percent = ((job.projected_employment_2033 - job.employment_2023) / job.employment_2023) * 100
      }
    }

    // Find similar jobs based on AI impact score and/or occupation family
    let similarJobs: SimilarJob[] = []
    
    try {
      // Get occupation family (first 2 digits of occupation code)
      const occFamily = code.substring(0, 2)
      
      // Find jobs in the same family with similar AI impact scores
      if (job.ai_impact_score !== undefined) {
        const aiScoreMin = Math.max(0, job.ai_impact_score - 20)
        const aiScoreMax = Math.min(100, job.ai_impact_score + 20)
        
        similarJobs = await sqlEnhanced<SimilarJob>`
          SELECT 
            occ_code, 
            occ_title, 
            ai_impact_score, 
            median_wage,
            CASE 
              WHEN occ_code LIKE ${occFamily + '%'} THEN 0.8
              ELSE 0.5
            END +
            CASE
              WHEN ABS(ai_impact_score - ${job.ai_impact_score}) < 10 THEN 0.4
              WHEN ABS(ai_impact_score - ${job.ai_impact_score}) < 20 THEN 0.2
              ELSE 0.1
            END AS similarity_score
          FROM jobs
          WHERE 
            occ_code != ${code} AND
            (
              occ_code LIKE ${occFamily + '%'} OR
              (ai_impact_score BETWEEN ${aiScoreMin} AND ${aiScoreMax})
            )
          ORDER BY similarity_score DESC
          LIMIT 6
        `
      } else {
        // If no AI score, just use occupation family
        similarJobs = await sqlEnhanced<SimilarJob>`
          SELECT 
            occ_code, 
            occ_title, 
            ai_impact_score, 
            median_wage,
            0.8 AS similarity_score
          FROM jobs
          WHERE 
            occ_code != ${code} AND
            occ_code LIKE ${occFamily + '%'}
          ORDER BY occ_title
          LIMIT 6
        `
      }
    } catch (similarJobsError) {
      console.error("Error fetching similar jobs:", similarJobsError)
      // Continue without similar jobs if there's an error
    }

    // Return the job data and similar jobs
    return NextResponse.json({
      success: true,
      job,
      similarJobs,
    })
  } catch (error) {
    console.error("Error fetching job details:", error)
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error fetching job details",
      },
      { status: 500 }
    )
  }
}
