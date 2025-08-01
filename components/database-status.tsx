"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, Database, CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react"

interface DatabaseStatus {
  connected: boolean
  responseTime?: number
  database?: {
    url: string
    tables: {
      existing: string[]
      missing: string[]
      ready: boolean
    }
    data: {
      totalJobs: number
      jobsWithAI: number
      completionRate: number
    }
  }
  error?: string
  timestamp: string
}

export function DatabaseStatus() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const checkStatus = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/database-status")
      const data = await response.json()
      setStatus(data)
      setLastChecked(new Date())
    } catch (error) {
      console.error("Failed to check database status:", error)
      setStatus({
        connected: false,
        error: "Failed to connect to API",
        timestamp: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkStatus()
    // Auto-refresh every 30 seconds
    const interval = setInterval(checkStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking database connection...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-4 w-4" />
            <span>Unable to check database status</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Status
          <Button variant="ghost" size="sm" onClick={checkStatus} disabled={loading} className="ml-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardTitle>
        <CardDescription>{lastChecked && `Last checked: ${lastChecked.toLocaleTimeString()}`}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {status.connected ? (
            <>
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-green-600">Connected</span>
              {status.responseTime && <Badge variant="secondary">{status.responseTime}ms</Badge>}
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-600">Disconnected</span>
            </>
          )}
        </div>

        {/* Error Message */}
        {status.error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Error</p>
              <p className="text-sm text-red-700">{status.error}</p>
            </div>
          </div>
        )}

        {/* Database Info */}
        {status.database && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Database URL</p>
              <p className="text-sm text-muted-foreground">{status.database.url}</p>
            </div>

            {/* Tables Status */}
            <div>
              <p className="text-sm font-medium mb-2">Tables</p>
              <div className="flex flex-wrap gap-2">
                {status.database.tables.existing.map((table) => (
                  <Badge key={table} variant="default">
                    {table} ✓
                  </Badge>
                ))}
                {status.database.tables.missing.map((table) => (
                  <Badge key={table} variant="destructive">
                    {table} ✗
                  </Badge>
                ))}
              </div>
              {status.database.tables.ready ? (
                <p className="text-sm text-green-600 mt-2">All required tables exist</p>
              ) : (
                <p className="text-sm text-orange-600 mt-2">
                  Missing tables: {status.database.tables.missing.join(", ")}
                </p>
              )}
            </div>

            {/* Data Statistics */}
            <div>
              <p className="text-sm font-medium mb-2">Data</p>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Jobs</p>
                  <p className="font-medium">{status.database.data.totalJobs.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">With AI Analysis</p>
                  <p className="font-medium">{status.database.data.jobsWithAI.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Completion</p>
                  <p className="font-medium">{status.database.data.completionRate}%</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
