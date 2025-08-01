import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20"), 50)

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 })
    }

    const searchTerm = `%${query.trim().toLowerCase()}%`

    // Search jobs by title
    const jobs = await sql`
      SELECT 
        occ_code,
        occ_title,
        employment_2023,
        median_wage,
        ai_impact_score,
        automation_risk
      FROM jobs 
      WHERE LOWER(occ_title) LIKE ${searchTerm}
      AND ai_impact_score IS NOT NULL
      ORDER BY 
        CASE 
          WHEN LOWER(occ_title) = ${query.trim().toLowerCase()} THEN 1
          WHEN LOWER(occ_title) LIKE ${query.trim().toLowerCase() + "%"} THEN 2
          ELSE 3
        END,
        ai_impact_score DESC
      LIMIT ${limit}
    `

    // Format the response
    const results = jobs.map((job: any) => ({
      code: job.occ_code,
      title: job.occ_title,
      employment: job.employment_2023,
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
      },
    }))

    return NextResponse.json({
      query,
      results,
      count: results.length,
    })
  } catch (error) {
    console.error("Error searching jobs:", error)
    return NextResponse.json({ error: "Failed to search jobs" }, { status: 500 })
  }
}
