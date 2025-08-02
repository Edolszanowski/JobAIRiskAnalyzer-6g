import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// Force this route to be treated as dynamic at build time to avoid
// Next.js DynamicServerError when `request.url` is used during static
// generation. This tells Next.js not to attempt to prerender the route.
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("q")
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "10"), 20)

    if (!query || query.trim().length < 1) {
      return NextResponse.json({ suggestions: [] })
    }

    const searchTerm = `%${query.trim().toLowerCase()}%`

    // Get autocomplete suggestions
    const suggestions = await sql`
      SELECT 
        occ_code,
        occ_title,
        ai_impact_score
      FROM jobs 
      WHERE LOWER(occ_title) LIKE ${searchTerm}
      AND ai_impact_score IS NOT NULL
      ORDER BY 
        CASE 
          WHEN LOWER(occ_title) LIKE ${query.trim().toLowerCase() + "%"} THEN 1
          ELSE 2
        END,
        LENGTH(occ_title),
        occ_title
      LIMIT ${limit}
    `

    // Format the response
    const results = suggestions.map((job: any) => ({
      code: job.occ_code,
      title: job.occ_title,
      aiImpactScore: job.ai_impact_score,
    }))

    return NextResponse.json({
      query,
      suggestions: results,
    })
  } catch (error) {
    console.error("Error fetching autocomplete suggestions:", error)
    return NextResponse.json(
      { suggestions: [] },
      { status: 200 }, // Return empty suggestions instead of error
    )
  }
}
