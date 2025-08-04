"use client"

import { useState, useEffect, useRef, ReactNode } from "react"
import { Loader2, Database, Key, Activity, BarChart3, RefreshCw, Play, Pause, 
  AlertTriangle, CheckCircle, Clock, Users, TrendingUp, AlertCircle } from "lucide-react"
import { ErrorBoundary } from "react-error-boundary"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { toast } from "@/components/ui/use-toast"

// Import types
import type { 
  DatabaseStatus, 
  APIKeyStatus, 
  SyncStatus, 
  JobDetails 
} from "@/types/admin"

/**
 * ErrorFallback component for displaying errors
 */
function ErrorFallback({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-md p-6 bg-red-50 border border-red-200 rounded-lg">
        <h2 className="text-xl font-bold text-red-700 mb-2">Something went wrong</h2>
        <p className="text-red-600 mb-4">{error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  )
}

/**
 * ClientOnlyAdminDashboard is the main component that ensures
 * the admin dashboard is only rendered on the client side
 * This completely eliminates hydration mismatches
 */
export default function ClientOnlyAdminDashboard() {
  // Use mounted state to ensure we only render on client
  const [mounted, setMounted] = useState(false)
  
  // Main dashboard state
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null)
  const [apiKeyStatus, setAPIKeyStatus] = useState<APIKeyStatus | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncStarting, setSyncStarting] = useState(false)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Data fetching functions
  const fetchDatabaseStatus = async () => {
    try {
      const response = await fetch("/api/database-status")
      const data = await response.json()
      setDatabaseStatus(data)
    } catch (error) {
      console.error("Failed to fetch database status:", error)
    }
  }

  const fetchAPIKeyStatus = async () => {
    try {
      const response = await fetch("/api/admin/api-keys")
      const data = await response.json()
      setAPIKeyStatus(data)
    } catch (error) {
      console.error("Failed to fetch API key status:", error)
    }
  }

  const fetchSyncStatus = async () => {
    try {
      const response = await fetch("/api/admin/sync-status")
      const data = await response.json()
      
      if (data.syncState) {
        setSyncStatus(data.syncState)
      } else {
        setSyncStatus(data)
      }
      
      return data.syncState?.isRunning || data.isRunning || false
    } catch (error) {
      console.error("Failed to fetch sync status:", error)
      return false
    }
  }

  const fetchJobDetails = async () => {
    try {
      const response = await fetch("/api/admin/job-details")
      const data = await response.json()
      setJobDetails(data)
    } catch (error) {
      console.error("Failed to fetch job details:", error)
    }
  }

  const refreshAll = async () => {
    setRefreshing(true)
    await Promise.all([fetchDatabaseStatus(), fetchAPIKeyStatus(), fetchSyncStatus(), fetchJobDetails()])
    setRefreshing(false)
  }

  // Update refresh interval based on sync status
  const updateRefreshInterval = (isRunning: boolean) => {
    // Clear existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }
    
    // Set new interval based on sync status
    const intervalTime = isRunning ? 3000 : 30000 // 3 seconds if running, 30 seconds otherwise
    refreshIntervalRef.current = setInterval(async () => {
      const stillRunning = await fetchSyncStatus()
      if (stillRunning) {
        // If sync is running, also refresh job details
        await fetchJobDetails()
      } else {
        // If sync stopped, refresh everything and update interval
        await refreshAll()
        updateRefreshInterval(false)
      }
    }, intervalTime)
  }

  const startSync = async () => {
    try {
      setSyncStarting(true)
      
      const response = await fetch("/api/admin/enhanced-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          forceRestart: true,
          maxConcurrent: 5,
          batchSize: 50,
        }),
      })
      
      const data = await response.json()

      if (data.success) {
        toast({
          title: "Sync Started",
          description: "Data synchronization process has started successfully.",
          variant: "default",
        })
        
        // Update sync status
        if (data.syncState) {
          setSyncStatus(data.syncState)
        }
        
        // Start more frequent updates
        updateRefreshInterval(true)
      } else {
        toast({
          title: "Failed to Start Sync",
          description: data.message || "An error occurred while starting the sync process.",
          variant: "destructive",
        })
        console.error("Failed to start sync:", data.error || data.message)
      }
    } catch (error) {
      toast({
        title: "Sync Error",
        description: "Could not connect to the sync service. Please try again.",
        variant: "destructive",
      })
      console.error("Failed to start sync:", error)
    } finally {
      setSyncStarting(false)
      // Refresh status immediately
      await fetchSyncStatus()
    }
  }

  // Initial data loading
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true)
      await refreshAll()
      
      // Check if sync is already running
      const isRunning = syncStatus?.isRunning || false
      updateRefreshInterval(isRunning)
      
      setLoading(false)
    }

    if (mounted) {
      loadInitialData()
    }

    // Cleanup interval on component unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
      }
    }
  }, [mounted])

  // Mark component as mounted to avoid hydration warnings
  useEffect(() => {
    setMounted(true)
  }, [])

  // Return loading state until client-side mounted
  if (!mounted || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  // Main dashboard render
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">iThriveAI Job Analysis System</p>
            </div>
            <Button onClick={refreshAll} disabled={refreshing} variant="outline">
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh All
            </Button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Database className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Database</p>
                    <div className="flex items-center">
                      {databaseStatus?.connected ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                          <span className="text-lg font-bold text-green-600">Connected</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-600 mr-1" />
                          <span className="text-lg font-bold text-red-600">Disconnected</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Key className="h-8 w-8 text-purple-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">API Keys</p>
                    <div className="text-lg font-bold">{apiKeyStatus?.totalKeys || 0} Active</div>
                    <p className="text-xs text-gray-500">{apiKeyStatus?.totalRemainingRequests || 0} requests left</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Users className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Jobs</p>
                    <div className="text-lg font-bold">{jobDetails?.totalJobs?.toLocaleString() || 0}</div>
                    <p className="text-xs text-gray-500">{jobDetails?.jobsWithAIAnalysis || 0} analyzed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <Activity className="h-8 w-8 text-orange-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Sync Status</p>
                    <div className="flex items-center">
                      {syncStatus?.isRunning ? (
                        <>
                          <div className="h-2 w-2 bg-green-600 rounded-full animate-pulse mr-2" />
                          <span className="text-lg font-bold text-green-600">Running</span>
                        </>
                      ) : (
                        <>
                          <div className="h-2 w-2 bg-gray-400 rounded-full mr-2" />
                          <span className="text-lg font-bold text-gray-600">Idle</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="database">Database</TabsTrigger>
              <TabsTrigger value="api-keys">API Keys</TabsTrigger>
              <TabsTrigger value="sync">Data Sync</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* System Health */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      System Health
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span>Database Connection</span>
                      {databaseStatus?.connected ? (
                        <Badge variant="default">Healthy</Badge>
                      ) : (
                        <Badge variant="destructive">Error</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span>API Keys</span>
                      {apiKeyStatus?.success ? (
                        <Badge variant="default">{apiKeyStatus.totalKeys} Active</Badge>
                      ) : (
                        <Badge variant="destructive">Not Configured</Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Data Completeness</span>
                      <Badge variant="secondary">{databaseStatus?.database?.data.completionRate || 0}%</Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Recent Activity */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Recent Jobs Analyzed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {jobDetails?.recentJobs && jobDetails.recentJobs.length > 0 ? (
                      <div className="space-y-3">
                        {jobDetails.recentJobs.slice(0, 5).map((job) => (
                          <div key={job.code} className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{job.title}</p>
                              <p className="text-xs text-gray-500">{job.code}</p>
                            </div>
                            <Badge
                              variant={
                                job.automationRisk === "Very High"
                                  ? "destructive"
                                  : job.automationRisk === "High"
                                    ? "destructive"
                                    : job.automationRisk === "Medium"
                                      ? "secondary"
                                      : "default"
                              }
                            >
                              {job.aiImpactScore}% Risk
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">No recent jobs analyzed</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="database" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Database Status
                  </CardTitle>
                  <CardDescription>Connection status and table information</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {databaseStatus ? (
                    <>
                      <div className="flex items-center gap-2">
                        {databaseStatus.connected ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-green-600">Connected</span>
                            {databaseStatus.responseTime && (
                              <Badge variant="secondary">{databaseStatus.responseTime}ms</Badge>
                            )}
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                            <span className="text-red-600">Disconnected</span>
                          </>
                        )}
                      </div>

                      {databaseStatus.database && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-medium mb-2">Tables</h4>
                            <div className="flex flex-wrap gap-2">
                              {databaseStatus.database.tables.existing.map((table) => (
                                <Badge key={table} variant="default">
                                  {table} ✓
                                </Badge>
                              ))}
                              {databaseStatus.database.tables.missing.map((table) => (
                                <Badge key={table} variant="destructive">
                                  {table} ✗
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <Separator />
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Total Jobs</p>
                              <p className="text-2xl font-bold">
                                {databaseStatus.database.data.totalJobs.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">With AI Analysis</p>
                              <p className="text-2xl font-bold">
                                {databaseStatus.database.data.jobsWithAI.toLocaleString()}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Completion Rate</p>
                              <p className="text-2xl font-bold">{databaseStatus.database.data.completionRate}%</p>
                            </div>
                          </div>
                        </>
                      )}

                      {databaseStatus.error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-sm text-red-800">{databaseStatus.error}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p>Loading database status...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="api-keys" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    BLS API Keys Status
                  </CardTitle>
                  <CardDescription>Monitor API key usage and limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {apiKeyStatus ? (
                    <>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Total Keys</p>
                          <p className="text-2xl font-bold">{apiKeyStatus.totalKeys}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Daily Limit</p>
                          <p className="text-2xl font-bold">{apiKeyStatus.totalDailyLimit.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Remaining</p>
                          <p className="text-2xl font-bold">{apiKeyStatus.totalRemainingRequests.toLocaleString()}</p>
                        </div>
                      </div>

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-3">Individual Key Status</h4>
                        <div className="space-y-3">
                          {apiKeyStatus.keyStatuses.map((key, index) => (
                            <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                              <div>
                                <p className="font-medium">{key.keyPreview}</p>
                                <p className="text-sm text-gray-600">{key.requestsUsed}/500 requests used</p>
                              </div>
                              <div className="text-right">
                                <Badge variant={key.isBlocked ? "destructive" : "default"}>
                                  {key.isBlocked ? "Blocked" : "Active"}
                                </Badge>
                                <p className="text-sm text-gray-600 mt-1">{key.requestsRemaining} remaining</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {apiKeyStatus.error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                          <p className="text-sm text-red-800">{apiKeyStatus.error}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p>Loading API key status...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sync" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Data Synchronization
                  </CardTitle>
                  <CardDescription>Manage job data synchronization with BLS API</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {syncStatus ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">Sync Status</h4>
                          <p className="text-sm text-gray-600">
                            {syncStatus.isRunning ? "Currently running..." : "Ready to start"}
                          </p>
                        </div>
                        <Button 
                          onClick={startSync} 
                          disabled={syncStatus.isRunning || syncStarting} 
                          className="flex items-center gap-2"
                        >
                          {syncStarting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Starting...
                            </>
                          ) : syncStatus.isRunning ? (
                            <>
                              <Pause className="h-4 w-4" />
                              Running...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4" />
                              Start Sync
                            </>
                          )}
                        </Button>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">Total Jobs</p>
                          <p className="text-2xl font-bold">{syncStatus.totalJobs}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Processed</p>
                          <p className="text-2xl font-bold">{syncStatus.processedJobs}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Successful</p>
                          <p className="text-2xl font-bold text-green-600">{syncStatus.successfulJobs}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Failed</p>
                          <p className="text-2xl font-bold text-red-600">{syncStatus.failedJobs}</p>
                        </div>
                      </div>

                      {syncStatus.processedJobs > 0 && (
                        <>
                          <div>
                            <div className="flex justify-between text-sm mb-2">
                              <span>Progress</span>
                              <span>
                                {Math.round((syncStatus.processedJobs / syncStatus.totalJobs) * 100)}%
                                {syncStatus.enhancedDetails?.currentBatch && syncStatus.enhancedDetails?.totalBatches && (
                                  <span className="ml-2 text-gray-500">
                                    (Batch {syncStatus.enhancedDetails.currentBatch}/{syncStatus.enhancedDetails.totalBatches})
                                  </span>
                                )}
                              </span>
                            </div>
                            <Progress
                              value={(syncStatus.processedJobs / syncStatus.totalJobs) * 100}
                              className="w-full"
                            />
                          </div>

                          {syncStatus.enhancedDetails?.estimatedTimeRemaining && (
                            <div className="flex items-center text-sm text-gray-600 mt-1">
                              <Clock className="h-4 w-4 mr-1" />
                              <span>
                                Estimated time remaining: {Math.round(syncStatus.enhancedDetails.estimatedTimeRemaining / 60000)} minutes
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      {syncStatus.currentJob && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <p className="text-sm text-blue-800">
                            Currently processing: <span className="font-medium">{syncStatus.currentJob}</span>
                          </p>
                        </div>
                      )}

                      {syncStatus.lastError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-md flex items-start">
                          <AlertCircle className="h-5 w-5 text-red-600 mr-2 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-red-800">Sync Error</p>
                            <p className="text-sm text-red-700">{syncStatus.lastError}</p>
                          </div>
                        </div>
                      )}

                      {syncStatus.skippedJobs > 0 && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                          <p className="text-sm text-yellow-800">
                            Skipped {syncStatus.skippedJobs} jobs that already had AI analysis
                          </p>
                        </div>
                      )}

                      {syncStatus.apiKeysStatus && syncStatus.apiKeysStatus.totalRemainingRequests < 100 && (
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md flex items-start">
                          <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800">API Request Limit Warning</p>
                            <p className="text-sm text-yellow-700">
                              Only {syncStatus.apiKeysStatus.totalRemainingRequests} API requests remaining today.
                              Sync may pause when limit is reached.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      <p>Loading sync status...</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      AI Risk Distribution
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {jobDetails ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Very High Risk (80%+)</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-red-600 h-2 rounded-full"
                                style={{
                                  width: `${jobDetails.totalJobs > 0 ? (jobDetails.highRiskJobs / jobDetails.totalJobs) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium">{jobDetails.highRiskJobs}</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">High Risk (60-79%)</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-orange-600 h-2 rounded-full"
                                style={{
                                  width: `${jobDetails.totalJobs > 0 ? (jobDetails.mediumHighRiskJobs / jobDetails.totalJobs) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium">{jobDetails.mediumHighRiskJobs}</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Medium Risk (40-59%)</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-yellow-600 h-2 rounded-full"
                                style={{
                                  width: `${jobDetails.totalJobs > 0 ? (jobDetails.mediumRiskJobs / jobDetails.totalJobs) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium">{jobDetails.mediumRiskJobs}</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm">Low Risk (0-39%)</span>
                          <div className="flex items-center gap-2">
                            <div className="w-20 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-green-600 h-2 rounded-full"
                                style={{
                                  width: `${jobDetails.totalJobs > 0 ? (jobDetails.lowRiskJobs / jobDetails.totalJobs) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm font-medium">{jobDetails.lowRiskJobs}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p>Loading analytics...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Key Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {jobDetails ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Average AI Impact Score</span>
                          <span className="text-2xl font-bold">{jobDetails.averageAIImpact.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Jobs Analyzed</span>
                          <span className="text-2xl font-bold">{jobDetails.jobsWithAIAnalysis.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Analysis Coverage</span>
                          <span className="text-2xl font-bold">
                            {jobDetails.totalJobs > 0
                              ? Math.round((jobDetails.jobsWithAIAnalysis / jobDetails.totalJobs) * 100)
                              : 0}
                            %
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">High Risk Jobs</span>
                          <span className="text-2xl font-bold text-red-600">
                            {jobDetails.highRiskJobs.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p>Loading metrics...</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </ErrorBoundary>
  )
}
