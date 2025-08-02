"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Users,
  ArrowLeft,
  Briefcase,
  LineChart,
  Lightbulb,
  BookOpen,
  Award,
  Clock,
  ChevronRight,
} from "lucide-react"
import Link from "next/link"

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

export default function JobDetailPage() {
  // State management
  const [job, setJob] = useState<Job | null>(null)
  const [similarJobs, setSimilarJobs] = useState<SimilarJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Router and params
  const router = useRouter()
  const params = useParams()
  const jobCode = params.code as string
  
  // Fetch job data
  useEffect(() => {
    async function fetchJobDetails() {
      if (!jobCode) return
      
      setLoading(true)
      setError(null)
      
      try {
        // Fetch the specific job by code
        const response = await fetch(`/api/jobs/${jobCode}`)
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`)
        }
        
        const data = await response.json()
        
        if (!data.success) {
          throw new Error(data.error || "Failed to fetch job details")
        }
        
        // Set job data
        setJob(data.job)
        
        // Set similar jobs if available
        if (data.similarJobs && Array.isArray(data.similarJobs)) {
          setSimilarJobs(data.similarJobs)
        }
      } catch (err) {
        console.error("Error fetching job details:", err)
        setError(err instanceof Error ? err.message : "Unknown error occurred")
      } finally {
        setLoading(false)
      }
    }
    
    fetchJobDetails()
  }, [jobCode])
  
  // Helper functions
  
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
  
  // Get risk badge component
  const getRiskBadge = (score?: number) => {
    if (score === undefined) return null
    
    if (score >= 80) {
      return <Badge variant="destructive" className="text-base px-3 py-1">{score}% Risk</Badge>
    } else if (score >= 60) {
      return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200 text-base px-3 py-1">{score}% Risk</Badge>
    } else if (score >= 40) {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200 text-base px-3 py-1">{score}% Risk</Badge>
    } else if (score >= 20) {
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-base px-3 py-1">{score}% Risk</Badge>
    } else {
      return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-base px-3 py-1">{score}% Risk</Badge>
    }
  }
  
  // Get risk color class
  const getRiskColorClass = (score?: number) => {
    if (score === undefined) return "text-gray-600"
    
    if (score >= 80) {
      return "text-red-700"
    } else if (score >= 60) {
      return "text-orange-700"
    } else if (score >= 40) {
      return "text-yellow-700"
    } else if (score >= 20) {
      return "text-blue-700"
    } else {
      return "text-green-700"
    }
  }
  
  // Get detailed risk analysis
  const getRiskAnalysis = (score?: number) => {
    if (score === undefined) return "No risk data available for this occupation."
    
    if (score >= 80) {
      return {
        summary: "High risk of automation",
        detail: "This occupation faces significant risk from AI and automation technologies. Many of the core tasks in this role can be automated using current and emerging technologies.",
        impact: "Jobs in this category may see substantial reduction in demand or significant transformation of required skills within the next decade.",
        advice: "Consider upskilling in areas that require human creativity, emotional intelligence, or complex problem-solving that AI currently struggles with. Developing complementary skills to work alongside AI systems may help maintain employability."
      }
    } else if (score >= 60) {
      return {
        summary: "Medium-high risk of automation",
        detail: "This occupation has considerable exposure to automation. While not all aspects can be automated, many routine tasks are vulnerable to replacement by AI and automation technologies.",
        impact: "Expect significant changes to job responsibilities and required skills over the next decade, with possible reduction in overall demand.",
        advice: "Focus on developing skills in areas of the job that require human judgment, interpersonal skills, or specialized expertise that's difficult to automate. Consider how you might adapt your role to complement AI systems."
      }
    } else if (score >= 40) {
      return {
        summary: "Medium risk of automation",
        detail: "This occupation has moderate vulnerability to automation. Some tasks may be automated, but the core of the role will likely remain intact.",
        impact: "The nature of this job will evolve as technology advances, requiring adaptation and new skills, but overall demand should remain relatively stable.",
        advice: "Stay current with technological changes in your field and focus on developing skills that complement automation. Emphasize aspects of your role that require human qualities like creativity, empathy, and complex decision-making."
      }
    } else if (score >= 20) {
      return {
        summary: "Low-medium risk of automation",
        detail: "This occupation has some exposure to automation but is relatively secure. Most core tasks require human capabilities that are difficult to automate.",
        impact: "While some aspects may be enhanced or changed by technology, overall demand for this role should remain stable or potentially increase.",
        advice: "Look for opportunities to use AI tools to enhance your productivity and effectiveness. Developing skills to work effectively with new technologies will likely be valuable in this field."
      }
    } else {
      return {
        summary: "Low risk of automation",
        detail: "This occupation is highly resistant to automation. The core tasks require uniquely human capabilities that are very difficult for AI to replicate.",
        impact: "This role may actually benefit from AI augmentation, potentially becoming more productive and valuable as technology advances.",
        advice: "Focus on how emerging technologies can enhance your effectiveness rather than replace your role. Developing skills to leverage AI tools could further strengthen your career prospects."
      }
    }
  }
  
  // Get growth analysis
  const getGrowthAnalysis = (percent?: number) => {
    if (percent === undefined) return "No growth projection data available for this occupation."
    
    if (percent >= 15) {
      return "This occupation is projected to grow much faster than average for all occupations. Strong job prospects are expected over the next decade."
    } else if (percent >= 8) {
      return "This occupation is projected to grow faster than average. Good job opportunities are expected in the coming years."
    } else if (percent >= 0) {
      return "This occupation is projected to grow at about the average rate for all occupations. Moderate job opportunities are expected."
    } else if (percent >= -8) {
      return "This occupation is projected to grow slower than average or slightly decline. Competition for jobs may increase."
    } else {
      return "This occupation is projected to decline significantly. Job seekers may face strong competition, and workers may need to develop transferable skills."
    }
  }
  
  // Get career recommendations based on risk and growth
  const getCareerRecommendations = (risk?: number, growth?: number) => {
    if (risk === undefined) return []
    
    const recommendations = []
    
    // Risk-based recommendations
    if (risk >= 80) {
      recommendations.push("Consider developing skills in emerging technologies like AI, cloud computing, or data analysis")
      recommendations.push("Look for opportunities to transition to adjacent fields with lower automation risk")
      recommendations.push("Focus on developing uniquely human skills like creativity, empathy, and complex problem-solving")
    } else if (risk >= 60) {
      recommendations.push("Identify which aspects of your role are most vulnerable to automation and which are most resistant")
      recommendations.push("Develop specialized expertise or niche skills that are harder to automate")
      recommendations.push("Consider how your role might evolve to work alongside AI systems rather than be replaced by them")
    } else if (risk >= 40) {
      recommendations.push("Stay current with technological changes in your field")
      recommendations.push("Look for opportunities to use AI tools to enhance your productivity")
      recommendations.push("Develop skills in areas that complement automation technologies")
    } else if (risk >= 20) {
      recommendations.push("Focus on the aspects of your role that require human judgment and creativity")
      recommendations.push("Explore how AI tools could help you become more effective in your role")
      recommendations.push("Consider specializing in areas where human expertise adds the most value")
    } else {
      recommendations.push("Your occupation has low automation risk, but staying current with industry trends is still important")
      recommendations.push("Look for ways to leverage AI tools to enhance your effectiveness and productivity")
      recommendations.push("Consider developing leadership skills as your role may involve directing AI-assisted work")
    }
    
    // Growth-based recommendations
    if (growth !== undefined) {
      if (growth >= 15) {
        recommendations.push("Strong growth projections suggest good career prospects in this field")
        recommendations.push("Consider specializing to take advantage of expanding opportunities")
      } else if (growth >= 0) {
        recommendations.push("Moderate growth projections suggest stable career prospects")
        recommendations.push("Focus on continuous skill development to remain competitive")
      } else {
        recommendations.push("Declining employment projections suggest preparing for potential career transitions")
        recommendations.push("Develop transferable skills that could be valuable in related fields")
      }
    }
    
    return recommendations
  }
  
  // Get risk level text
  const getRiskLevelText = (score?: number) => {
    if (score === undefined) return "Unknown"
    
    if (score >= 80) return "High"
    if (score >= 60) return "Medium-High"
    if (score >= 40) return "Medium"
    if (score >= 20) return "Low-Medium"
    return "Low"
  }
  
  // Render loading state
  if (loading) {
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
              </nav>
            </div>
          </div>
        </header>

        {/* Loading state */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-6">
            <Button variant="outline" size="sm" className="bg-transparent mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Button>
            
            <Skeleton className="h-10 w-2/3 mb-2" />
            <Skeleton className="h-6 w-1/3 mb-6" />
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
            
            <div className="space-y-6">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </main>
      </div>
    )
  }
  
  // Render error state
  if (error || !job) {
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
              </nav>
            </div>
          </div>
        </header>

        {/* Error state */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="bg-red-50 border border-red-200 text-red-700 p-8 rounded-lg mb-8">
            <h3 className="text-xl font-semibold mb-4">Error Loading Job Details</h3>
            <p className="mb-4">{error || "Job not found. The requested occupation may not exist or there was an error retrieving the data."}</p>
            <div className="flex space-x-4">
              <Button 
                variant="outline" 
                className="bg-transparent"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
              <Link href="/jobs">
                <Button>Browse All Jobs</Button>
              </Link>
            </div>
          </div>
        </main>
      </div>
    )
  }
  
  // Get risk analysis for the current job
  const riskAnalysis = getRiskAnalysis(job.ai_impact_score)
  const growthAnalysis = getGrowthAnalysis(job.employment_change_percent)
  const recommendations = getCareerRecommendations(job.ai_impact_score, job.employment_change_percent)
  const riskColorClass = getRiskColorClass(job.ai_impact_score)
  
  // Main render with job data
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
              <Link href="/analyze">
                <Button variant="outline">Analyze My Job</Button>
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Back button */}
        <Link href="/jobs">
          <Button variant="outline" size="sm" className="bg-transparent mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Jobs
          </Button>
        </Link>
        
        {/* Job header */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
            <h1 className="text-3xl font-bold text-gray-900">{job.occ_title}</h1>
            {getRiskBadge(job.ai_impact_score)}
          </div>
          <p className="text-gray-600">Occupation Code: {job.occ_code}</p>
        </div>
        
        {/* Key metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Salary card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-purple-100 p-2 rounded-full">
                  <DollarSign className="h-6 w-6 text-purple-700" />
                </div>
                <h3 className="font-semibold text-lg">Median Annual Wage</h3>
              </div>
              <div className="text-3xl font-bold text-purple-700 mb-2">
                {formatCurrency(job.median_wage)}
              </div>
              <p className="text-sm text-gray-500">
                National median annual wage for this occupation
              </p>
            </CardContent>
          </Card>
          
          {/* Employment card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-blue-100 p-2 rounded-full">
                  <Users className="h-6 w-6 text-blue-700" />
                </div>
                <h3 className="font-semibold text-lg">Employment</h3>
              </div>
              <div className="text-3xl font-bold text-blue-700 mb-2">
                {formatNumber(job.employment_2023)}
              </div>
              <p className="text-sm text-gray-500">
                Total employment in 2023
              </p>
            </CardContent>
          </Card>
          
          {/* Growth card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-green-100 p-2 rounded-full">
                  <TrendingUp className="h-6 w-6 text-green-700" />
                </div>
                <h3 className="font-semibold text-lg">Projected Growth</h3>
              </div>
              <div className={`text-3xl font-bold mb-2 ${
                job.employment_change_percent && job.employment_change_percent > 0 
                  ? 'text-green-600' 
                  : job.employment_change_percent && job.employment_change_percent < 0 
                    ? 'text-red-600' 
                    : 'text-gray-700'
              }`}>
                {formatPercent(job.employment_change_percent)}
              </div>
              <p className="text-sm text-gray-500">
                Projected change from 2023 to 2033
              </p>
            </CardContent>
          </Card>
        </div>
        
        {/* AI Risk Analysis */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className={`h-6 w-6 ${riskColorClass}`} />
              <CardTitle>AI Automation Risk Analysis</CardTitle>
            </div>
            <CardDescription>
              Assessment of how artificial intelligence and automation may impact this occupation
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex-1">
                  <h3 className={`text-xl font-semibold mb-3 ${riskColorClass}`}>
                    {riskAnalysis.summary}
                  </h3>
                  <p className="text-gray-700 mb-4">
                    {riskAnalysis.detail}
                  </p>
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <h4 className="font-semibold mb-2">Expected Impact</h4>
                    <p className="text-gray-700">
                      {riskAnalysis.impact}
                    </p>
                  </div>
                </div>
                <div className="md:w-64 bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-3">Risk Assessment</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Risk Level:</span>
                        <span className={`font-medium ${riskColorClass}`}>{getRiskLevelText(job.ai_impact_score)}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div 
                          className={`h-2.5 rounded-full ${
                            job.ai_impact_score && job.ai_impact_score >= 80 ? 'bg-red-600' :
                            job.ai_impact_score && job.ai_impact_score >= 60 ? 'bg-orange-500' :
                            job.ai_impact_score && job.ai_impact_score >= 40 ? 'bg-yellow-500' :
                            job.ai_impact_score && job.ai_impact_score >= 20 ? 'bg-blue-500' :
                            'bg-green-500'
                          }`} 
                          style={{ width: `${job.ai_impact_score || 0}%` }}
                        ></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Growth Outlook:</span>
                        <span className={`font-medium ${
                          job.employment_change_percent && job.employment_change_percent > 8 ? 'text-green-600' :
                          job.employment_change_percent && job.employment_change_percent > 0 ? 'text-blue-600' :
                          job.employment_change_percent && job.employment_change_percent > -8 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {job.employment_change_percent && job.employment_change_percent > 8 ? 'Strong' :
                           job.employment_change_percent && job.employment_change_percent > 0 ? 'Moderate' :
                           job.employment_change_percent && job.employment_change_percent > -8 ? 'Slow' :
                           'Declining'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Last Updated:</span>
                        <span className="font-medium">
                          {job.updated_at ? new Date(job.updated_at).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Employment Projections */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-3">
              <LineChart className="h-6 w-6 text-blue-700" />
              <CardTitle>Employment Projections</CardTitle>
            </div>
            <CardDescription>
              Bureau of Labor Statistics employment projections for this occupation (2023-2033)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-semibold mb-4">Employment Outlook</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-gray-600">Current Employment (2023):</span>
                    <span className="font-semibold">{formatNumber(job.employment_2023)}</span>
                  </div>
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-gray-600">Projected Employment (2033):</span>
                    <span className="font-semibold">{formatNumber(job.projected_employment_2033)}</span>
                  </div>
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-gray-600">Numeric Change:</span>
                    <span className={`font-semibold ${
                      job.employment_change && job.employment_change > 0 ? 'text-green-600' : 
                      job.employment_change && job.employment_change < 0 ? 'text-red-600' : ''
                    }`}>
                      {job.employment_change && job.employment_change > 0 ? '+' : ''}
                      {formatNumber(job.employment_change)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600">Percent Change:</span>
                    <span className={`font-semibold ${
                      job.employment_change_percent && job.employment_change_percent > 0 ? 'text-green-600' : 
                      job.employment_change_percent && job.employment_change_percent < 0 ? 'text-red-600' : ''
                    }`}>
                      {formatPercent(job.employment_change_percent)}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-4">Growth Analysis</h3>
                <p className="text-gray-700 mb-4">
                  {growthAnalysis}
                </p>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-5 w-5 text-blue-600" />
                    <h4 className="font-semibold">Long-term Outlook</h4>
                  </div>
                  <p className="text-gray-700 text-sm">
                    {job.employment_change_percent && job.employment_change_percent > 0 
                      ? "This occupation is projected to grow over the next decade. Workers in this field may benefit from increasing job opportunities and potential wage growth."
                      : "This occupation is projected to decline over the next decade. Workers may face increased competition for jobs and should consider developing complementary skills."}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Career Recommendations */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Lightbulb className="h-6 w-6 text-yellow-600" />
              <CardTitle>Career Recommendations</CardTitle>
            </div>
            <CardDescription>
              Personalized advice based on AI impact and employment projections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4">Strategic Career Advice</h3>
                <p className="text-gray-700 mb-4">
                  {riskAnalysis.advice}
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-3">Recommended Actions</h3>
                <ul className="space-y-3">
                  {recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <ChevronRight className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="bg-blue-50 p-5 rounded-lg border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-5 w-5 text-blue-700" />
                  <h4 className="font-semibold text-blue-800">Skills Development Focus</h4>
                </div>
                <p className="text-blue-800 mb-3">
                  Based on this occupation's automation risk profile, consider developing these skills:
                </p>
                <div className="flex flex-wrap gap-2">
                  {job.ai_impact_score && job.ai_impact_score >= 60 ? (
                    <>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Creative Problem Solving</Badge>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Emotional Intelligence</Badge>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Complex Decision Making</Badge>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Adaptability</Badge>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Human-AI Collaboration</Badge>
                    </>
                  ) : (
                    <>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">AI Literacy</Badge>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Data Analysis</Badge>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Technical Proficiency</Badge>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Critical Thinking</Badge>
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">Leadership</Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Similar Jobs */}
        {similarJobs.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Briefcase className="h-6 w-6 text-indigo-700" />
                <CardTitle>Similar Occupations</CardTitle>
              </div>
              <CardDescription>
                Related occupations you might consider exploring
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {similarJobs.map((similarJob) => (
                  <Link href={`/jobs/${similarJob.occ_code}`} key={similarJob.occ_code}>
                    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-gray-800">{similarJob.occ_title}</h4>
                        {similarJob.ai_impact_score !== undefined && (
                          <Badge variant={similarJob.ai_impact_score >= 60 ? "destructive" : "outline"} className="text-xs">
                            {similarJob.ai_impact_score}% Risk
                          </Badge>
                        )}
                      </div>
                      {similarJob.median_wage !== undefined && (
                        <div className="text-sm text-gray-600">
                          Median Wage: {formatCurrency(similarJob.median_wage)}
                        </div>
                      )}
                      {similarJob.similarity_score !== undefined && (
                        <div className="mt-2 text-xs">
                          <Badge variant="secondary" className="bg-gray-100">
                            {Math.round(similarJob.similarity_score * 100)}% Similar
                          </Badge>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
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
