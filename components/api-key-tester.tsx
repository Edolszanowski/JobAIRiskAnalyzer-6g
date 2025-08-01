"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Key, CheckCircle, XCircle } from "lucide-react"

interface APIKeyTestResult {
  success: boolean
  totalKeys: number
  workingKeys: number
  totalDailyLimit: number
  totalRemainingRequests: number
  testResults: Array<{
    keyIndex: number
    keyPreview: string
    status: string
    message: string
    success: boolean
    error?: string
  }>
  error?: string
  message?: string
}

export function APIKeyTester() {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<APIKeyTestResult | null>(null)

  const testAPIKeys = async () => {
    setTesting(true)
    setResult(null)

    try {
      const response = await fetch("/api/admin/test-api-keys")
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        success: false,
        totalKeys: 0,
        workingKeys: 0,
        totalDailyLimit: 0,
        totalRemainingRequests: 0,
        testResults: [],
        error: error instanceof Error ? error.message : "Network error",
        message: "Failed to test API keys"
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          BLS API Key Tester
        </CardTitle>
        <CardDescription>
          Test all configured BLS API keys to verify they are working correctly
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={testAPIKeys} 
          disabled={testing}
          className="w-full"
        >
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testing API Keys...
            </>
          ) : (
            <>
              <Key className="mr-2 h-4 w-4" />
              Test All API Keys
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-green-600 font-medium">
                    {result.workingKeys} of {result.totalKeys} API keys are working
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-red-600" />
                  <span className="text-red-600 font-medium">API key test failed</span>
                </>
              )}
            </div>

            {result.message && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">{result.message}</p>
              </div>
            )}

            {/* Key Statistics */}
            {result.totalKeys > 0 && (
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <p className="text-sm text-gray-600">Total Keys</p>
                  <p className="text-xl font-bold">{result.totalKeys}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Working Keys</p>
                  <p className="text-xl font-bold text-green-600">{result.workingKeys}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Daily Limit</p>
                  <p className="text-xl font-bold">{result.totalDailyLimit.toLocaleString()}</p>
                </div>
              </div>
            )}\
