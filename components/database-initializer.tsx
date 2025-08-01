"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Database, CheckCircle, XCircle, AlertCircle, Play } from "lucide-react"

interface InitializationResult {
  success: boolean
  message: string
  details?: {
    tablesCreated: string[]
    sampleJobsInserted: number
    timestamp: string
  }
  error?: string
}

export function DatabaseInitializer() {
  const [initializing, setInitializing] = useState(false)
  const [result, setResult] = useState<InitializationResult | null>(null)

  const initializeDatabase = async () => {
    setInitializing(true)
    setResult(null)

    try {
      const response = await fetch("/api/initialize-database", {
        method: "POST",
      })

      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        success: false,
        message: "Failed to initialize database",
        error: error instanceof Error ? error.message : "Network error",
      })
    } finally {
      setInitializing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Database Initialization
        </CardTitle>
        <CardDescription>Create database tables and insert sample job data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={initializeDatabase} disabled={initializing} className="w-full">
          {initializing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Initializing Database...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Initialize Database
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-600 font-medium">Initialization Successful</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-red-600 font-medium">Initialization Failed</span>
                </>
              )}
            </div>

            <p className="text-sm text-gray-700">{result.message}</p>

            {result.details && (
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-medium">Tables Created:</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {result.details.tablesCreated.map((table) => (
                      <Badge key={table} variant="secondary">
                        {table}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium">Sample Jobs Inserted:</p>
                  <Badge variant="outline">{result.details.sampleJobsInserted}</Badge>
                </div>
              </div>
            )}

            {result.error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Error Details</p>
                  <p className="text-sm text-red-700">{result.error}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
