"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Search,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  ChevronRight,
  Users,           // Added Users icon for employment section
} from "lucide-react"
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

export default function AnalyzePage() {
  // State management
  const [searchTerm, setSearchTerm] = useState("")
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)

  // Handle job search
  const handleSearch = async () => {
    if (searchTerm.trim() === "") return
    
    setLoading(true)
    setError(null)
    setHasSearched(true)
    
    try {
      const response = await fetch(`/api/jobs?search=${encodeURIComponent(searchTerm)}&limit=10`)
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch jobs")
      }
      
      setJobs(data.jobs)
    } catch (err) {
      console.error("Error searching jobs:", err)
      setError(err instanceof Error ? err.message : "Unknown error occurred")
      setJobs([])
    } finally {
      setLoading(false)
    }
  }

  // Helper for rendering risk badges and analysis
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
  
  const getRiskAnalysis = (score?: number) => {
    if (score === undefined) return "No risk data available"
    
    if (score >= 80) {
      return "High risk of automation. This occupation may be significantly impacted by AI and automation technologies in the coming decade."
    } else if (score >= 60) {
      return "Medium-high risk of automation. Many tasks in this occupation could be automated, requiring significant adaptation."
    } else if (score >= 40) {
      return "Medium risk of automation. Some tasks may be automated, but the core of the role will likely remain."
    } else if (score >= 20) {
      return "Low-medium risk of automation. This occupation will be somewhat affected by AI but should remain largely intact."
    } else {
      return "Low risk of automation. This occupation requires skills that are difficult to automate and may benefit from AI augmentation."
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
              <Link href="/jobs">
                <Button variant="outline">Browse Jobs</Button>
              </Link>
              <Link href="/admin">
                <Button variant="outline">Admin Dashboard</Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">Analyze Your Job</h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Enter your job title to discover how AI and automation might impact your career in the coming decade.
          </p>
        </div>

        {/* Search Form */}
        <div className="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-sm mb-12">
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Find Your Occupation</h3>
            <p className="text-gray-600">
              Enter your job title to see its automation risk score, salary data, and growth projections.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <Input
                type="text"
                placeholder="Job title (e.g., Software Developer, Nurse, Teacher)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch()
                }}
                className="pl-10 py-6 text-lg"
              />
            </div>
            <Button 
              size="lg" 
              onClick={handleSearch}
              disabled={loading || searchTerm.trim() === ""}
            >
              Analyze
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="max-w-4xl mx-auto bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg mb-8">
            <h3 className="font-semibold text-lg mb-2">Error analyzing job</h3>
            <p>{error}</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => handleSearch()}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <Skeleton className="h-8 w-64 mx-auto mb-2" />
              <Skeleton className="h-4 w-96 mx-auto" />
            </div>
            <div className="space-y-6">
              {[...Array(3)].map((_, i) => (
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
          </div>
        )}

        {/* No Results */}
        {!loading && hasSearched && jobs.length === 0 && (
          <div className="max-w-4xl mx-auto bg-white p-8 rounded-lg shadow-sm text-center mb-8">
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No matching jobs found</h3>
            <p className="text-gray-500 mb-4">
              We couldn't find any occupations matching "{searchTerm}". Try using different keywords or browse all jobs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button onClick={() => setSearchTerm("")}>Try Different Search</Button>
              <Link href="/jobs">
                <Button variant="outline" className="bg-transparent">Browse All Jobs</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && jobs.length > 0 && (
          <div className="max-w-4xl mx-auto">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Analysis Results</h3>
            <p className="text-gray-600 mb-6">
              We found {jobs.length} occupation{jobs.length !== 1 ? 's' : ''} matching your search. Select one to view detailed analysis.
            </p>
            
            <div className="space-y-6 mb-12">
              {jobs.map((job) => (
                <Card key={job.occ_code} className="overflow-hidden hover:shadow-md transition-shadow">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-xl">{job.occ_title}</CardTitle>
                        <p className="text-sm text-gray-500">Occupation Code: {job.occ_code}</p>
                      </div>
                      {getRiskBadge(job.ai_impact_score)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4">
                      <h4 className="font-semibold mb-2">AI Impact Analysis:</h4>
                      <p className="text-gray-700">{getRiskAnalysis(job.ai_impact_score)}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center gap-2 text-gray-700 mb-1">
                          <DollarSign className="h-4 w-4" />
                          <span className="font-medium">Median Wage</span>
                        </div>
                        <div className="text-lg font-semibold">{formatCurrency(job.median_wage)}</div>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center gap-2 text-gray-700 mb-1">
                          <Users className="h-4 w-4" />
                          <span className="font-medium">Employment</span>
                        </div>
                        <div className="text-lg font-semibold">{formatNumber(job.employment_2023)}</div>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center gap-2 text-gray-700 mb-1">
                          <TrendingUp className="h-4 w-4" />
                          <span className="font-medium">Growth Rate</span>
                        </div>
                        <div className={`text-lg font-semibold ${
                          job.employment_change_percent && job.employment_change_percent > 0 
                            ? 'text-green-600' 
                            : job.employment_change_percent && job.employment_change_percent < 0 
                              ? 'text-red-600' 
                              : ''
                        }`}>
                          {formatPercent(job.employment_change_percent)}
                        </div>
                      </div>
                    </div>
                    
                    <Link href={`/jobs/${job.occ_code}`}>
                      <Button className="w-full">
                        View Detailed Analysis
                        <ChevronRight className="ml-2 h-4 w-4" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
        
        {/* Call to Action */}
        {!loading && hasSearched && (
          <div className="max-w-4xl mx-auto bg-indigo-50 p-8 rounded-lg border border-indigo-100 text-center">
            <h3 className="text-xl font-semibold text-indigo-900 mb-2">Want more career insights?</h3>
            <p className="text-indigo-700 mb-4">
              Explore our full database of occupations to discover growing fields and AI-resistant careers.
            </p>
            <Link href="/jobs">
              <Button variant="outline" className="bg-white">Browse All Jobs</Button>
            </Link>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 mt-16">
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
                  <Link href="/analyze" className="hover:text-white">
                    Analyze My Job
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
