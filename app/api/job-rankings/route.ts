import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sortBy = searchParams.get("sortBy") || "ai_impact_score"
    const order = searchParams.get("order") || "desc"
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "50"), 100)
    const offset = Math.max(Number.parseInt(searchParams.get("offset") || "0"), 0)
    const riskLevel = searchParams.get("riskLevel")

    // Validate sort parameters
    const validSortFields = ["ai_impact_score", "median_wage", "employment_2023", "occ_title"]
    const validOrders = ["asc", "desc"]

    if (!validSortFields.includes(sortBy)) {
      return NextResponse.json({ error: "Invalid sort field" }, { status: 400 })
    }

    if (!validOrders.includes(order)) {
      return NextResponse.json({ error: "Invalid sort order" }, { status: 400 })
    }

    // Build the query
    let whereClause = "WHERE ai_impact_score IS NOT NULL"
    const params: any[] = []

    if (riskLevel) {
      switch (riskLevel.toLowerCase()) {
        case "very high":
          whereClause += " AND ai_impact_score >= 80"
          break
        case "high":
          whereClause += " AND ai_impact_score >= 60 AND ai_impact_score < 80"
          break
        case "medium":
          whereClause += " AND ai_impact_score >= 40 AND ai_impact_score < 60"
          break
        case "low":
          whereClause += " AND ai_impact_score < 40"
          break
      }
    }

    // Get total count
    const countResult = await sql`
      SELECT COUNT(*) as total 
      FROM jobs 
      ${sql.unsafe(whereClause)}
    `
    const total = Number.parseInt(countResult[0].total)

    // Get ranked jobs
    const jobs = await sql`
      SELECT 
        occ_code,
        occ_title,
        employment_2023,
        projected_employment_2033,
        median_wage,
        ai_impact_score,
        automation_risk,
        updated_at
      FROM jobs 
      ${sql.unsafe(whereClause)}
      ORDER BY ${sql.unsafe(sortBy)} ${sql.unsafe(order)}
      LIMIT ${limit}
      OFFSET ${offset}
    `

    // Format the response
    const rankings = jobs.map((job: any, index: number) => ({
      rank: offset + index + 1,
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
      },
      lastUpdated: job.updated_at,
    }))

    return NextResponse.json({
      rankings,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      filters: {
        sortBy,
        order,
        riskLevel,
      },
    })
  } catch (error) {
    console.error("Error fetching job rankings:", error)
    return NextResponse.json({ error: "Failed to fetch job rankings" }, { status: 500 })
  }
}
