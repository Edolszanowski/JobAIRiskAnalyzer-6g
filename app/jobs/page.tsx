"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { JobSearchInput } from "@/components/ui/job-search-input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendingUp, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight, DollarSign } from "lucide-react"
import Link from "next/link"

// Job data type definition
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

// API response type
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

export default function JobsPage() {
  // State management
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  })
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Extract URL parameters
  const risk = searchParams.get("risk") || ""
  const search = searchParams.get("search") || ""
  const sort = searchParams.get("sort") || "ai_impact_score"
  const order = searchParams.get("order") || "desc"
  const page = parseInt(searchParams.get("page") || "1", 10)
  

  
  // Fetch jobs data
  useEffect(() => {
    async function fetchJobs() {
      setLoading(true)
      setError(null)
      
      try {
        // Build query string from current parameters
        const queryParams = new URLSearchParams()
        if (risk) queryParams.set("risk", risk)
        if (search) queryParams.set("search", search)
        if (sort) queryParams.set("sort", sort)
        if (order) queryParams.set("order", order)
        if (page) queryParams.set("page", page.toString())
        queryParams.set("limit", "20") // Fixed limit for consistency
        
        // Fetch data from API
        const response = await fetch(`/api/jobs?${queryParams.toString()}`)
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }
        
        const data: JobsResponse = await response.json()
        
        if (!data.success) {
          throw new Error(data.error || "Failed to fetch jobs")
        }
        
        // Update state with fetched data
        setJobs(data.jobs)
        setPagination(data.pagination)
      } catch (err) {
        console.error("Error fetching jobs:", err)
        setError(err instanceof Error ? err.message : "Unknown error occurred")
        setJobs([])
      } finally {
        setLoading(false)
      }
    }
    
    fetchJobs()
  }, [risk, search, sort, order, page])
  
  // Navigation helpers
  const updateFilters = (newParams: Record<string, string | null>) => {
    // Create a new URLSearchParams object from the current params
    const params = new URLSearchParams(searchParams.toString())
    
    // Update with new parameters
    Object.entries(newParams).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    
    // Always reset to page 1 when filters change
    params.set("page", "1")
    
    // Navigate to the new URL
    router.push(`/jobs?${params.toString()}`)
  }
  
  const handleRiskFilter = (riskLevel: string) => {
    updateFilters({ risk: risk === riskLevel ? null : riskLevel })
  }
  
  const handleSortChange = (newSort: string) => {
    updateFilters({ sort: newSort })
  }
  
  const handleOrderChange = () => {
    updateFilters({ order: order === "asc" ? "desc" : "asc" })
  }
  
  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return
    updateFilters({ page: newPage.toString() })
  }
  
  // Helper for rendering risk badges
  const getRiskBadge = (score?: number) => {
    if (score === undefined) return null
    
    if (score >= 80) {
      return <Badge variant="destructive">{score}% Risk</Badge>
    } else if (score >= 60) {
      return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">{score}% Risk</Badge>
    } else if (score >= 40) {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">{score}% Risk</Badge>
    } else if (score >= 20) {
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">{score}% Risk</Badge>
    } else {
      return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">{score}% Risk</Badge>
    }
  }
  
  // Format currency
  const formatCurrency = (value?: number) => {
    if (value === undefined) return "N/A"
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value)
  }
  
  // Format number with commas
  const formatNumber = (value?: number) => {
    if (value === undefined) return "N/A"
    return new Intl.NumberFormat('en-US').format(value)
  }
  
  // Format percentage
  const formatPercent = (value?: number) => {
    if (value === undefined) return "N/A"
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Link href="/">
                <h1 className="text-2xl font-bold text-gray-900 cursor-pointer">iThriveAI</h1>
              </Link>
              <Badge variant="secondary" className="ml-2">
                Beta
              </Badge>
            </div>
            <nav className="flex space-x-4">
              <Link href="/admin">
                <Button variant="outline">Admin Dashboard</Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Browse Jobs</h2>
          <p className="text-gray-600">
            Explore occupations and their AI automation risk, salary data, and employment projections.
          </p>
        </div>

        {/* Filters and Search */}
        <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <JobSearchInput
                placeholder="Search job titles..."
                onSelect={(job) => router.push(`/jobs/${job.occ_code}`)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-6">
            <Button
              variant={risk === "high" ? "default" : "outline"}
              className={risk === "high" ? "" : "bg-transparent"}
              onClick={() => handleRiskFilter("high")}
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              High Risk Jobs
            </Button>
            <Button
              variant={risk === "medium" ? "default" : "outline"}
              className={risk === "medium" ? "" : "bg-transparent"}
              onClick={() => handleRiskFilter("medium")}
            >
              Medium Risk Jobs
            </Button>
            <Button
              variant={risk === "safe" ? "default" : "outline"}
              className={risk === "safe" ? "" : "bg-transparent"}
              onClick={() => handleRiskFilter("safe")}
            >
              Safe Jobs
            </Button>
            {(risk || search) && (
              <Button
                variant="outline"
                className="bg-transparent"
                onClick={() => updateFilters({ risk: null, search: null })}
              >
                Clear Filters
              </Button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex items-center">
              <span className="text-sm text-gray-500 mr-2">Sort by:</span>
              <Select
                value={sort}
                onValueChange={handleSortChange}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ai_impact_score">AI Risk Score</SelectItem>
                  <SelectItem value="median_wage">Median Wage</SelectItem>
                  <SelectItem value="employment_2023">Employment</SelectItem>
                  <SelectItem value="employment_change_percent">Growth Rate</SelectItem>
                  <SelectItem value="occ_title">Job Title</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="bg-transparent"
              onClick={handleOrderChange}
            >
              <ArrowUpDown className="h-4 w-4 mr-2" />
              {order === "asc" ? "Ascending" : "Descending"}
            </Button>
            <div className="flex-1 text-right text-sm text-gray-500">
              {pagination.total > 0 && (
                <span>
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} jobs
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-8">
            <h3 className="font-semibold">Error loading jobs</h3>
            <p>{error}</p>
            <Button 
              variant="outline" 
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* No Results */}
        {!loading && jobs.length === 0 && (
          <div className="bg-white p-8 rounded-lg shadow-sm text-center mb-8">
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No jobs found</h3>
            <p className="text-gray-500 mb-4">
              Try adjusting your search criteria or filters to find more results.
            </p>
            <Button 
              variant="outline" 
              className="bg-transparent"
              onClick={() => updateFilters({ risk: null, search: null })}
            >
              Clear All Filters
            </Button>
          </div>
        )}

        {/* Jobs Grid */}
        {!loading && jobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {jobs.map((job) => (
              <Card key={job.occ_code} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{job.occ_title}</CardTitle>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Code: {job.occ_code}</span>
                    {getRiskBadge(job.ai_impact_score)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Median Wage:</span>
                      <span className="font-medium">{formatCurrency(job.median_wage)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Employment (2023):</span>
                      <span className="font-medium">{formatNumber(job.employment_2023)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Projected Growth:</span>
                      <span className={`font-medium ${
                        job.employment_change_percent && job.employment_change_percent > 0 
                          ? 'text-green-600' 
                          : job.employment_change_percent && job.employment_change_percent < 0 
                            ? 'text-red-600' 
                            : ''
                      }`}>
                        {formatPercent(job.employment_change_percent)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <Link href={`/jobs/${job.occ_code}`}>
                      <Button variant="outline" size="sm" className="w-full bg-transparent">
                        View Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && pagination.totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mb-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(1)}
              disabled={pagination.page === 1}
              className="bg-transparent"
            >
              First
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center">
              {[...Array(Math.min(5, pagination.totalPages))].map((_, i) => {
                // Calculate page numbers to show (centered around current page)
                let pageNum: number
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1
                } else if (pagination.page <= 3) {
                  pageNum = i + 1
                } else if (pagination.page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i
                } else {
                  pageNum = pagination.page - 2 + i
                }
                
                return (
                  <Button
                    key={i}
                    variant={pagination.page === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    className={`mx-1 ${pagination.page !== pageNum ? "bg-transparent" : ""}`}
                  >
                    {pageNum}
                  </Button>
                )
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
              className="bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.totalPages)}
              disabled={pagination.page === pagination.totalPages}
              className="bg-transparent"
            >
              Last
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h4 className="text-lg font-semibold mb-4">iThriveAI</h4>
              <p className="text-gray-400">AI-powered career insights based on Bureau of Labor Statistics data.</p>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <Link href="/jobs" className="hover:text-white">
                    Browse Jobs
                  </Link>
                </li>
                <li>
                  <Link href="/rankings" className="hover:text-white">
                    Job Rankings
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-white">
                    About
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Data Source</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Bureau of Labor Statistics</li>
                <li>Occupational Employment Statistics</li>
                <li>Employment Projections</li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Contact</h4>
              <p className="text-gray-400">
                Questions or feedback?
                <br />
                <Link href="mailto:hello@ithriveai.com" className="hover:text-white">
                  hello@ithriveai.com
                </Link>
              </p>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 iThriveAI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
