/* eslint-disable react-hooks/rules-of-hooks */
"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
// New auto-complete search input
import { JobSearchInput } from "@/components/ui/job-search-input"
import { Search, TrendingUp, AlertTriangle, Users, DollarSign } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
// local state for this page no longer needed

export default function HomePage() {
  const router = useRouter()


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-gray-900">iThriveAI</h1>
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

      {/* Hero Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold text-gray-900 mb-6">Discover How AI Will Impact Your Career</h2>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Get data-driven insights about AI automation risk, job growth projections, and salary trends for over 850
            occupations based on Bureau of Labor Statistics data.
          </p>

          {/* Search Bar with Auto-complete */}
          <div className="max-w-2xl mx-auto mb-12">
            <JobSearchInput
              placeholder="Search for a job title (e.g., Software Developer, Teacher, Nurse)"
              onSelect={(job) => router.push(`/jobs/${job.occ_code}`)}
              inputClassName="py-3 text-lg"
            />
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
            <Card>
              <CardContent className="p-6 text-center">
                <Users className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">850+</div>
                <div className="text-sm text-gray-600">Occupations Analyzed</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <TrendingUp className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">2033</div>
                <div className="text-sm text-gray-600">Projections Through</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <AlertTriangle className="h-8 w-8 text-orange-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">AI Risk</div>
                <div className="text-sm text-gray-600">Assessment Included</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 text-center">
                <DollarSign className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-gray-900">Salary</div>
                <div className="text-sm text-gray-600">Data & Trends</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Featured Jobs Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-gray-900 text-center mb-12">Explore Job Categories</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* High-Risk Jobs */}
            <Card className="border-red-200 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  High AI Risk Jobs
                </CardTitle>
                <CardDescription>Occupations with 80%+ automation risk</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-sm">Cashiers</span>
                    <Badge variant="destructive">92% Risk</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Data Entry Clerks</span>
                    <Badge variant="destructive">89% Risk</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Customer Service Reps</span>
                    <Badge variant="destructive">85% Risk</Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() => router.push("/jobs?risk=high")}
                >
                  View All High-Risk Jobs
                </Button>
              </CardContent>
            </Card>

            {/* Safe Jobs */}
            <Card className="border-green-200 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-700">
                  <Users className="h-5 w-5" />
                  AI-Resistant Jobs
                </CardTitle>
                <CardDescription>Occupations with low automation risk</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-sm">Registered Nurses</span>
                    <Badge variant="secondary">15% Risk</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Elementary Teachers</span>
                    <Badge variant="secondary">20% Risk</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Software Developers</span>
                    <Badge variant="secondary">25% Risk</Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() => router.push("/jobs?risk=safe")}
                >
                  View All Safe Jobs
                </Button>
              </CardContent>
            </Card>

            {/* Growing Jobs */}
            <Card className="border-blue-200 hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-700">
                  <TrendingUp className="h-5 w-5" />
                  Fastest Growing Jobs
                </CardTitle>
                <CardDescription>Occupations with highest growth projections</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between">
                    <span className="text-sm">Software Developers</span>
                    <Badge className="bg-blue-100 text-blue-800">+25%</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Nurse Practitioners</span>
                    <Badge className="bg-blue-100 text-blue-800">+38%</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Data Scientists</span>
                    <Badge className="bg-blue-100 text-blue-800">+35%</Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full bg-transparent"
                  onClick={() =>
                    router.push("/jobs?sort=employment_change_percent&order=desc")
                  }
                >
                  View All Growing Jobs
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-gray-900 mb-6">Ready to Future-Proof Your Career?</h3>
          <p className="text-xl text-gray-600 mb-8">
            Get personalized insights about your occupation and discover opportunities in the age of artificial
            intelligence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="px-8" onClick={() => router.push("/analyze")}>
              Analyze My Job
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="px-8 bg-transparent"
              onClick={() => router.push("/jobs")}
            >
              Browse All Jobs
            </Button>
          </div>
        </div>
      </section>

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
