"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Database, CheckCircle, XCircle, AlertCircle } from "lucide-react"

interface ConnectionTestResult {
  connected: boolean
  responseTime?: number
  error?: string
  timestamp: string
}

export function DatabaseConnectionTest() {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ConnectionTestResult | null>(null)

  const testConnection = async () => {
    setTesting(true)
    setResult(null)

    try {
      const startTime = Date.now()
      const response = await fetch("/api/database-status")
      const endTime = Date.now()

      const data = await response.json()

      setResult({
        connected: data.connected,
        responseTime: endTime - startTime,
        error: data.error,
        timestamp: new Date().toISOString(),
      })
    } catch (error) {
      setResult({
        connected: false,
        error: error instanceof Error ? error.message : "Network error",
        timestamp: new Date().toISOString(),
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Connection Test
        </CardTitle>
        <CardDescription>Test the connection to your Neon database</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={testConnection} disabled={testing} className="w-full">
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing Connection...
            </>
          ) : (
            "Test Database Connection"
          )}
        </Button>

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {result.connected ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-600 font-medium">Connection Successful</span>
                  {result.responseTime && <Badge variant="secondary">{result.responseTime}ms</Badge>}
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-red-600 font-medium">Connection Failed</span>
                </>
              )}
            </div>

            {result.error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Error Details</p>
                  <p className="text-sm text-red-700">{result.error}</p>
                </div>
              </div>
            )}

            <div className="text-xs text-gray-500">Tested at: {new Date(result.timestamp).toLocaleString()}</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
