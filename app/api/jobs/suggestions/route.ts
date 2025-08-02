import { NextResponse } from "next/server"
import { sqlEnhanced } from "@/lib/database-enhanced"

// Type definition for job suggestions
interface JobSuggestion {
  occ_code: string
  occ_title: string
  ai_impact_score?: number
}

/**
 * GET /api/jobs/suggestions
 * Returns job title suggestions for auto-complete functionality
 * 
 * Query parameters:
 * - q: search term for job titles or codes
 */
export async function GET(request: Request) {
  try {
    // Get search query from URL
    const url = new URL(request.url)
    const searchQuery = url.searchParams.get("q") || ""
    
    // Initialize suggestions array
    let suggestions: JobSuggestion[] = []
    
    // If search query is empty, return some featured or popular jobs
    if (!searchQuery.trim()) {
      try {
        // Get some featured jobs (high wage, diverse risk levels)
        suggestions = await sqlEnhanced<JobSuggestion>`
          (SELECT occ_code, occ_title, ai_impact_score FROM jobs 
           WHERE ai_impact_score >= 80 
           ORDER BY median_wage DESC NULLS LAST
           LIMIT 3)
          UNION
          (SELECT occ_code, occ_title, ai_impact_score FROM jobs 
           WHERE ai_impact_score < 20
           ORDER BY median_wage DESC NULLS LAST
           LIMIT 3)
          UNION
          (SELECT occ_code, occ_title, ai_impact_score FROM jobs 
           WHERE ai_impact_score BETWEEN 40 AND 60
           ORDER BY employment_2023 DESC NULLS LAST
           LIMIT 4)
          LIMIT 10
        `
      } catch (error) {
        // If that fails, just return an empty array
        console.error("Error fetching featured jobs:", error)
        suggestions = []
      }
    } else {
      // Search for jobs matching the query
      const searchTerm = `%${searchQuery.trim().toLowerCase()}%`
      
      try {
        suggestions = await sqlEnhanced<JobSuggestion>`
          SELECT occ_code, occ_title, ai_impact_score 
          FROM jobs 
          WHERE 
            LOWER(occ_title) LIKE ${searchTerm} OR
            LOWER(occ_code) LIKE ${searchTerm}
          ORDER BY 
            CASE 
              WHEN LOWER(occ_title) LIKE ${`${searchQuery.trim().toLowerCase()}%`} THEN 0
              WHEN LOWER(occ_title) LIKE ${`% ${searchQuery.trim().toLowerCase()}%`} THEN 1
              ELSE 2
            END,
            LENGTH(occ_title),
            occ_title
          LIMIT 10
        `
      } catch (error) {
        console.error("Error searching jobs:", error)
        suggestions = []
      }
    }
    
    // Return the suggestions
    return NextResponse.json({
      success: true,
      suggestions,
    })
  } catch (error) {
    console.error("Error getting job suggestions:", error)
    
    return NextResponse.json(
      {
        success: false,
        suggestions: [],
        error: error instanceof Error ? error.message : "Unknown error getting job suggestions",
      },
      { status: 500 }
    )
  }
}
