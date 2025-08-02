import { NextResponse } from "next/server"
import { sqlEnhanced } from "@/lib/database-enhanced"

// Types for job data
interface Job {
  occ_code: string
  occ_title: string
  employment_2023?: number
  projected_employment_2033?: number
  employment_change?: number
  employment_change_percent?: number
  median_wage?: number
  ai_impact_score?: number
  automation_risk?: string
  updated_at?: string
}

interface JobsResponse {
  success: boolean
  jobs: Job[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  filters?: {
    risk?: string
    search?: string
    sort?: string
    order?: string
  }
  error?: string
}

/**
 * GET /api/jobs
 * Returns jobs with filtering, sorting, and pagination
 * 
 * Query parameters:
 * - risk: high (80-100), medium (40-79), low (20-39), safe (0-19)
 * - search: search term for job titles
 * - sort: ai_impact_score, median_wage, employment_2023, occ_title
 * - order: asc, desc
 * - page: page number (default: 1)
 * - limit: items per page (default: 20, max: 100)
 */
export async function GET(request: Request) {
  try {
    // Parse query parameters
    const url = new URL(request.url)
    const risk = url.searchParams.get("risk")
    const search = url.searchParams.get("search")
    const sort = url.searchParams.get("sort") || "ai_impact_score"
    const order = url.searchParams.get("order") || "desc"
    const page = parseInt(url.searchParams.get("page") || "1", 10)
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100)
    const offset = (page - 1) * limit
    
    // Check if the jobs table exists and execute simplified queries
    try {
      // Initialize variables for query results
      let jobs: Job[] = []
      let total = 0
      
      // SIMPLIFIED APPROACH: Use specific hardcoded queries for common scenarios
      
      // 1. HIGH RISK JOBS
      if (risk === "high") {
        if (search) {
          const searchTerm = `%${search.trim().toLowerCase()}%`
          
          // High risk jobs with search
          if (order === "asc") {
            if (sort === "occ_title") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                AND LOWER(occ_title) LIKE ${searchTerm}
                ORDER BY occ_title ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else if (sort === "median_wage") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                AND LOWER(occ_title) LIKE ${searchTerm}
                ORDER BY median_wage ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else if (sort === "employment_2023") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                AND LOWER(occ_title) LIKE ${searchTerm}
                ORDER BY employment_2023 ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else {
              // Default to ai_impact_score
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                AND LOWER(occ_title) LIKE ${searchTerm}
                ORDER BY ai_impact_score ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            }
          } else {
            // DESC order
            if (sort === "occ_title") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                AND LOWER(occ_title) LIKE ${searchTerm}
                ORDER BY occ_title DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else if (sort === "median_wage") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                AND LOWER(occ_title) LIKE ${searchTerm}
                ORDER BY median_wage DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else if (sort === "employment_2023") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                AND LOWER(occ_title) LIKE ${searchTerm}
                ORDER BY employment_2023 DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else {
              // Default to ai_impact_score
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                AND LOWER(occ_title) LIKE ${searchTerm}
                ORDER BY ai_impact_score DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            }
          }
          
          // Get count for high risk with search
          const [countResult] = await sqlEnhanced<{ count: string }>`
            SELECT COUNT(*) as count FROM jobs 
            WHERE ai_impact_score >= 80
            AND LOWER(occ_title) LIKE ${searchTerm}
          `
          total = parseInt(countResult?.count || "0", 10)
        } else {
          // High risk jobs without search
          if (order === "asc") {
            if (sort === "occ_title") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                ORDER BY occ_title ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else if (sort === "median_wage") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                ORDER BY median_wage ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else if (sort === "employment_2023") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                ORDER BY employment_2023 ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else {
              // Default to ai_impact_score
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                ORDER BY ai_impact_score ASC
                LIMIT ${limit} OFFSET ${offset}
              `
            }
          } else {
            // DESC order
            if (sort === "occ_title") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                ORDER BY occ_title DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else if (sort === "median_wage") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                ORDER BY median_wage DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else if (sort === "employment_2023") {
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                ORDER BY employment_2023 DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            } else {
              // Default to ai_impact_score
              jobs = await sqlEnhanced<Job>`
                SELECT * FROM jobs 
                WHERE ai_impact_score >= 80
                ORDER BY ai_impact_score DESC
                LIMIT ${limit} OFFSET ${offset}
              `
            }
          }
          
          // Get count for high risk without search
          const [countResult] = await sqlEnhanced<{ count: string }>`
            SELECT COUNT(*) as count FROM jobs 
            WHERE ai_impact_score >= 80
          `
          total = parseInt(countResult?.count || "0", 10)
        }
      }
      // 2. SAFE JOBS
      else if (risk === "safe") {
        if (search) {
          const searchTerm = `%${search.trim().toLowerCase()}%`
          
          // Safe jobs with search (ai_impact_score < 20)
          if (order === "asc") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE ai_impact_score < 20
              AND LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY ai_impact_score ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE ai_impact_score < 20
              AND LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY ai_impact_score DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          }
          
          // Get count for safe jobs with search
          const [countResult] = await sqlEnhanced<{ count: string }>`
            SELECT COUNT(*) as count FROM jobs 
            WHERE ai_impact_score < 20
            AND LOWER(occ_title) LIKE ${searchTerm}
          `
          total = parseInt(countResult?.count || "0", 10)
        } else {
          // Safe jobs without search
          if (order === "asc") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE ai_impact_score < 20
              ORDER BY ai_impact_score ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE ai_impact_score < 20
              ORDER BY ai_impact_score DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          }
          
          // Get count for safe jobs without search
          const [countResult] = await sqlEnhanced<{ count: string }>`
            SELECT COUNT(*) as count FROM jobs 
            WHERE ai_impact_score < 20
          `
          total = parseInt(countResult?.count || "0", 10)
        }
      }
      // 3. SEARCH ONLY
      else if (search) {
        const searchTerm = `%${search.trim().toLowerCase()}%`
        
        // Search all jobs
        if (order === "asc") {
          if (sort === "ai_impact_score") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY ai_impact_score ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else if (sort === "occ_title") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY occ_title ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else if (sort === "median_wage") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY median_wage ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY employment_2023 ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          }
        } else {
          // DESC order
          if (sort === "ai_impact_score") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY ai_impact_score DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else if (sort === "occ_title") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY occ_title DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else if (sort === "median_wage") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY median_wage DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              WHERE LOWER(occ_title) LIKE ${searchTerm}
              ORDER BY employment_2023 DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          }
        }
        
        // Get count for search
        const [countResult] = await sqlEnhanced<{ count: string }>`
          SELECT COUNT(*) as count FROM jobs 
          WHERE LOWER(occ_title) LIKE ${searchTerm}
        `
        total = parseInt(countResult?.count || "0", 10)
      }
      // 4. DEFAULT - ALL JOBS
      else {
        // Get all jobs with default sorting
        if (order === "asc") {
          if (sort === "ai_impact_score") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              ORDER BY ai_impact_score ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else if (sort === "occ_title") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              ORDER BY occ_title ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else if (sort === "median_wage") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              ORDER BY median_wage ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              ORDER BY employment_2023 ASC
              LIMIT ${limit} OFFSET ${offset}
            `
          }
        } else {
          // DESC order
          if (sort === "ai_impact_score") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              ORDER BY ai_impact_score DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else if (sort === "occ_title") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              ORDER BY occ_title DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else if (sort === "median_wage") {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              ORDER BY median_wage DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          } else {
            jobs = await sqlEnhanced<Job>`
              SELECT * FROM jobs 
              ORDER BY employment_2023 DESC
              LIMIT ${limit} OFFSET ${offset}
            `
          }
        }
        
        // Get total count for all jobs
        const [countResult] = await sqlEnhanced<{ count: string }>`
          SELECT COUNT(*) as count FROM jobs
        `
        total = parseInt(countResult?.count || "0", 10)
      }
      
      const totalPages = Math.ceil(total / limit)
      
      // Enhance job data with calculated fields
      const enhancedJobs = jobs.map(job => {
        // Calculate employment change if both values exist
        const employmentChange = job.employment_2023 && job.projected_employment_2033
          ? job.projected_employment_2033 - job.employment_2023
          : undefined
          
        // Calculate employment change percentage
        const employmentChangePercent = job.employment_2023 && job.projected_employment_2033 && job.employment_2023 > 0
          ? ((job.projected_employment_2033 - job.employment_2023) / job.employment_2023) * 100
          : undefined
          
        return {
          ...job,
          employment_change: employmentChange,
          employment_change_percent: employmentChangePercent,
        }
      })
      
      // Return the response
      return NextResponse.json({
        success: true,
        jobs: enhancedJobs,
        pagination: {
          total,
          page,
          limit,
          totalPages,
        },
        filters: {
          risk: risk || undefined,
          search: search || undefined,
          sort,
          order,
        }
      } as JobsResponse)
      
    } catch (dbError) {
      console.error("Database query error:", dbError)
      
      // If database tables don't exist yet, return empty response
      return NextResponse.json({
        success: false,
        jobs: [],
        pagination: {
          total: 0,
          page: 1,
          limit,
          totalPages: 0,
        },
        error: "Database tables not initialized or query error",
      } as JobsResponse)
    }
  } catch (error) {
    console.error("Error getting jobs:", error)
    
    return NextResponse.json(
      {
        success: false,
        jobs: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        },
        error: error instanceof Error ? error.message : "Unknown error getting jobs",
      } as JobsResponse,
      { status: 500 }
    )
  }
}
