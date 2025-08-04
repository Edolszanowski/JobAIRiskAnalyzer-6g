"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Database, Key, Activity, BarChart3, RefreshCw, Play, Pause, 
  AlertTriangle, CheckCircle, Clock, Users, TrendingUp, AlertCircle } from "lucide-react"
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
 * ClientOnlyAdminDashboard is the main component that ensures
 * the admin dashboard is only rendered on the client side
 * This completely eliminates hydration mismatches
 */
export default function ClientOnlyAdminDashboard() {
  // Use explicit client-side only rendering
  const [isClient, setIsClient] = useState(false)
  
  // Error state for simpler error handling
  const [error, setError] = useState<Error | null>(null)
  
  // Main dashboard state with safe defaults
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null)
  const [apiKeyStatus, setAPIKeyStatus] = useState<APIKeyStatus | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [jobDetails, setJobDetails] = useState<JobDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncStarting, setSyncStarting] = useState(false)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Safe data fetching with error handling
  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const response = await fetch(url, options)
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`)
      }
      return await response.json()
    } catch (err) {
      console.error(`Error fetching from ${url}:`, err)
      return null
    }
  }

  // Data fetching functions with error handling
  const fetchDatabaseStatus = async () => {
    try {
      const data = await safeFetch("/api/database-status")
      if (data) setDatabaseStatus(data)
    } catch (error) {
      console.error("Failed to fetch database status:", error)
    }
  }

  const fetchAPIKeyStatus = async () => {
    try {
      const data = await safeFetch("/api/admin/api-keys")
      if (data) setAPIKeyStatus(data)
    } catch (error) {
      console.error("Failed to fetch API key status:", error)
    }
  }

  const fetchSyncStatus = async () => {
    try {
      const data = await safeFetch("/api/admin/sync-status")
      if (!data) return false
      
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
      const data = await safeFetch("/api/admin/job-details")
      if (data) setJobDetails(data)
    } catch (error) {
      console.error("Failed to fetch job details:", error)
    }
  }

  const refreshAll = async () => {
    if (!isClient) return // Safety check
    
    setRefreshing(true)
    try {
      await Promise.all([
        fetchDatabaseStatus(), 
        fetchAPIKeyStatus(), 
        fetchSyncStatus(), 
        fetchJobDetails()
      ])
    } catch (err) {
      console.error("Error refreshing data:", err)
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setRefreshing(false)
    }
  }

  // Update refresh interval based on sync status
  const updateRefreshInterval = (isRunning: boolean) => {
    if (!isClient) return // Safety check
    
    // Clear existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current)
      refreshIntervalRef.current = null
    }
    
    // Set new interval based on sync status
    const intervalTime = isRunning ? 3000 : 30000 // 3 seconds if running, 30 seconds otherwise
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const stillRunning = await fetchSyncStatus()
        if (stillRunning) {
          // If sync is running, also refresh job details
          await fetchJobDetails()
        } else {
          // If sync stopped, refresh everything and update interval
          await refreshAll()
          updateRefreshInterval(false)
        }
      } catch (err) {
        console.error("Error in refresh interval:", err)
      }
    }, intervalTime)
  }

  const startSync = async () => {
    if (!isClient) return // Safety check
    
    try {
      setSyncStarting(true)
      
      const data = await safeFetch("/api/admin/enhanced-sync", {
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

      if (!data) {
        throw new Error("Failed to start sync: No response from server")
      }

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
      console.error("Failed to start sync:", error)
      toast({
        title: "Sync Error",
        description: "Could not connect to the sync service. Please try again.",
        variant: "destructive",
      })
    } finally {
      setSyncStarting(false)
      // Refresh status immediately
      await fetchSyncStatus()
    }
  }

  // Initial client-side setup
  useEffect(() => {
    setIsClient(true) // Mark as client-side rendered
  }, [])

  // Initial data loading - only runs after component is mounted on client
  useEffect(() => {
    // Only run this effect on the client after mounting
    if (!isClient) return
    
    const loadInitialData = async () => {
      setLoading(true)
      try {
        await refreshAll()
        
        // Check if sync is already running
        const isRunning = syncStatus?.isRunning || false
        updateRefreshInterval(isRunning)
      } catch (err) {
        console.error("Error loading initial data:", err)
        setError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()

    // Cleanup interval on component unmount
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [isClient]) // Only re-run when isClient changes (once)

  // Handle errors
  if (error) {
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

  // Return loading state until client-side mounted
  if (!isClient || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    )
  }

  // Pre-calculate values to avoid hydration mismatches in JSX
  const isDbConnected = databaseStatus?.connected || false
  const dbCompletionRate = databaseStatus?.database?.data?.completionRate || 0
  const totalKeys = apiKeyStatus?.totalKeys || 0
  const remainingRequests = apiKeyStatus?.totalRemainingRequests || 0
  const totalJobs = jobDetails?.totalJobs || 0
  const analyzedJobs = jobDetails?.jobsWithAIAnalysis || 0
  const isSyncRunning = syncStatus?.isRunning || false
  const processedJobs = syncStatus?.processedJobs || 0
  const syncTotalJobs = syncStatus?.totalJobs || 0
  const progressPercentage = syncTotalJobs > 0 ? Math.round((processedJobs / syncTotalJobs) * 100) : 0
  const hasRecentJobs = jobDetails?.recentJobs && jobDetails.recentJobs.length > 0
  const recentJobsToShow = hasRecentJobs ? jobDetails?.recentJobs.slice(0, 5) : []
  
  // Main dashboard render - only happens on client
  return (
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
                    {isDbConnected ? (
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
                  <div className="text-lg font-bold">{totalKeys} Active</div>
                  <p className="text-xs text-gray-500">{remainingRequests} requests left</p>
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
                  <div className="text-lg font-bold">{totalJobs.toLocaleString()}</div>
                  <p className="text-xs text-gray-500">{analyzedJobs} analyzed</p>
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
                    {isSyncRunning ? (
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
                    {isDbConnected ? (
                      <Badge variant="default">Healthy</Badge>
                    ) : (
                      <Badge variant="destructive">Error</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>API Keys</span>
                    {apiKeyStatus?.success ? (
                      <Badge variant="default">{totalKeys} Active</Badge>
                    ) : (
                      <Badge variant="destructive">Not Configured</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Data Completeness</span>
                    <Badge variant="secondary">{dbCompletionRate}%</Badge>
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
                  {hasRecentJobs ? (
                    <div className="space-y-3">
                      {recentJobsToShow.map((job) => (
                        <div key={job.code} className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{job.title}</p>
                            <p className="text-xs text-gray-500">{job.code}</p>
                          </div>
                          <Badge
                            variant={
                              job.automationRisk === "Very High" || job.automationRisk === "High"
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
                      {isDbConnected ? (
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
                            <p className="text-2xl font-bold">{dbCompletionRate}%</p>
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
                        <p className="text-2xl font-bold">{totalKeys}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Daily Limit</p>
                        <p className="text-2xl font-bold">{apiKeyStatus.totalDailyLimit.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Remaining</p>
                        <p className="text-2xl font-bold">{remainingRequests.toLocaleString()}</p>
                      </div>
                    </div>

                    <Separator />

                    <div>
                      <h4 className="font-medium mb-3">Individual Key Status</h4>
                      <div className="space-y-3">
                        {apiKeyStatus.keyStatuses && apiKeyStatus.keyStatuses.map((key, index) => (
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
                          {isSyncRunning ? "Currently running..." : "Ready to start"}
                        </p>
                      </div>
                      <Button 
                        onClick={startSync} 
                        disabled={isSyncRunning || syncStarting} 
                        className="flex items-center gap-2"
                      >
                        {syncStarting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Starting...
                          </>
                        ) : isSyncRunning ? (
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
                        <p className="text-2xl font-bold">{syncTotalJobs}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Processed</p>
                        <p className="text-2xl font-bold">{processedJobs}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Successful</p>
                        <p className="text-2xl font-bold text-green-600">{syncStatus.successfulJobs || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Failed</p>
                        <p className="text-2xl font-bold text-red-600">{syncStatus.failedJobs || 0}</p>
                      </div>
                    </div>

                    {processedJobs > 0 && (
                      <>
                        <div>
                          <div className="flex justify-between text-sm mb-2">
                            <span>Progress</span>
                            <span>
                              {progressPercentage}%
                              {syncStatus.enhancedDetails?.currentBatch && syncStatus.enhancedDetails?.totalBatches && (
                                <span className="ml-2 text-gray-500">
                                  (Batch {syncStatus.enhancedDetails.currentBatch}/{syncStatus.enhancedDetails.totalBatches})
                                </span>
                              )}
                            </span>
                          </div>
                          <Progress
                            value={progressPercentage}
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

                    {(syncStatus.skippedJobs || 0) > 0 && (
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
                                width: `${totalJobs > 0 ? (jobDetails.highRiskJobs / totalJobs) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium">{jobDetails.highRiskJobs || 0}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">High Risk (60-79%)</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-orange-600 h-2 rounded-full"
                              style={{
                                width: `${totalJobs > 0 ? (jobDetails.mediumHighRiskJobs / totalJobs) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium">{jobDetails.mediumHighRiskJobs || 0}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Medium Risk (40-59%)</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-yellow-600 h-2 rounded-full"
                              style={{
                                width: `${totalJobs > 0 ? (jobDetails.mediumRiskJobs / totalJobs) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium">{jobDetails.mediumRiskJobs || 0}</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Low Risk (0-39%)</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-600 h-2 rounded-full"
                              style={{
                                width: `${totalJobs > 0 ? (jobDetails.lowRiskJobs / totalJobs) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium">{jobDetails.lowRiskJobs || 0}</span>
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
                        <span className="text-2xl font-bold">{(jobDetails.averageAIImpact || 0).toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Jobs Analyzed</span>
                        <span className="text-2xl font-bold">{analyzedJobs.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Analysis Coverage</span>
                        <span className="text-2xl font-bold">
                          {totalJobs > 0
                            ? Math.round((analyzedJobs / totalJobs) * 100)
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">High Risk Jobs</span>
                        <span className="text-2xl font-bold text-red-600">
                          {(jobDetails.highRiskJobs || 0).toLocaleString()}
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
  )
}
