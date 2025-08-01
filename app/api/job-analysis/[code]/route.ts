import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const { code } = params

    if (!code) {
      return NextResponse.json({ error: "Job code is required" }, { status: 400 })
    }

    // Query the database for the specific job
    const result = await sql`
      SELECT 
        occ_code,
        occ_title,
        employment_2023,
        projected_employment_2033,
        median_wage,
        ai_impact_score,
        automation_risk,
        key_tasks,
        ai_analysis,
        created_at,
        updated_at
      FROM jobs 
      WHERE occ_code = ${code}
    `

    if (result.length === 0) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 })
    }

    const job = result[0]

    // Format the response
    const jobAnalysis = {
      code: job.occ_code,
      title: job.occ_title,
      employment: {
        current: job.employment_2023,
        projected: job.projected_employment_2033,
        change: job.projected_employment_2033 - job.employment_2023,
        changePercent: job.employment_2023
          ? Math.round(((job.projected_employment_2033 - job.employment_2023) / job.employment_2023) * 100)
          : 0,
      },
      wage: {
        median: job.median_wage,
        formatted: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(job.median_wage),
      },
      aiImpact: {
        score: job.ai_impact_score,
        risk: job.automation_risk,
        analysis: job.ai_analysis,
      },
      keyTasks: job.key_tasks ? JSON.parse(job.key_tasks) : [],
      lastUpdated: job.updated_at,
    }

    return NextResponse.json(jobAnalysis)
  } catch (error) {
    console.error("Error fetching job analysis:", error)
    return NextResponse.json({ error: "Failed to fetch job analysis" }, { status: 500 })
  }
}
