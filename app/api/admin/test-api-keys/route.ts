import { NextResponse } from "next/server"

// Test BLS API key with a simple request
async function testBLSApiKey(apiKey: string): Promise<{ success: boolean; error?: string; details?: any }> {
  try {
    console.log(`Testing BLS API key: ${apiKey.substring(0, 8)}...`)

    const response = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        seriesid: ["LAUCN040010000000005"], // Simple unemployment rate series
        startyear: "2023",
        endyear: "2023",
        registrationkey: apiKey,
      }),
    })

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const data = await response.json()
    console.log(`BLS API response for ${apiKey.substring(0, 8)}...:`, data)

    if (data.status === "REQUEST_SUCCEEDED") {
      return {
        success: true,
        details: {
          status: data.status,
          responseTime: data.responseTime,
          dataReceived: data.Results?.series?.[0]?.data?.length || 0,
        },
      }
    } else {
      return {
        success: false,
        error: data.message ? data.message.join(", ") : "API request failed",
        details: data,
      }
    }
  } catch (error) {
    console.error(`Error testing API key ${apiKey.substring(0, 8)}...:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    }
  }
}

export async function GET() {
  try {
    // Get API keys from environment
    const keys: string[] = []

    if (process.env.BLS_API_KEYS) {
      keys.push(...process.env.BLS_API_KEYS.split(",").map((key) => key.trim()))
    }

    if (process.env.BLS_API_KEY) keys.push(process.env.BLS_API_KEY)
    if (process.env.BLS_API_KEY_2) keys.push(process.env.BLS_API_KEY_2)
    if (process.env.BLS_API_KEY_3) keys.push(process.env.BLS_API_KEY_3)
    if (process.env.BLS_API_KEY_4) keys.push(process.env.BLS_API_KEY_4)
    if (process.env.BLS_API_KEY_5) keys.push(process.env.BLS_API_KEY_5)

    // Remove duplicates and empty strings
    const uniqueKeys = [...new Set(keys.filter((key) => key && key.length > 0))]

    if (uniqueKeys.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No API keys configured",
        message: "Please add BLS API keys to your environment variables",
        totalKeys: 0,
        totalDailyLimit: 0,
        totalRemainingRequests: 0,
        testResults: [],
        keyStatuses: [],
      })
    }

    console.log(`Testing ${uniqueKeys.length} BLS API keys...`)

    // Test each API key
    const testResults = await Promise.all(
      uniqueKeys.map(async (key, index) => {
        const keyPreview = `${key.substring(0, 8)}...${key.substring(key.length - 4)}`
        const testResult = await testBLSApiKey(key)

        return {
          keyIndex: index + 1,
          keyPreview,
          status: testResult.success ? "✅ Valid" : "❌ Invalid",
          message: testResult.success
            ? `Working correctly - ${testResult.details?.dataReceived || 0} data points received`
            : testResult.error || "Unknown error",
          dataReceived: testResult.success,
          success: testResult.success,
          error: testResult.error,
          details: testResult.details,
        }
      }),
    )

    // Count working keys
    const workingKeys = testResults.filter((result) => result.success)
    const totalDailyLimit = workingKeys.length * 500
    const totalRemainingRequests = workingKeys.length * 500 // Assume fresh daily limit

    // Create key status summary
    const keyStatuses = testResults.map((result) => ({
      keyPreview: result.keyPreview,
      requestsUsed: 0, // Would be tracked in real implementation
      requestsRemaining: result.success ? 500 : 0,
      isBlocked: !result.success,
      blockUntil: !result.success ? new Date(Date.now() + 24 * 60 * 60 * 1000) : undefined,
    }))

    return NextResponse.json({
      success: workingKeys.length > 0,
      totalKeys: uniqueKeys.length,
      workingKeys: workingKeys.length,
      totalDailyLimit,
      totalRemainingRequests,
      testResults,
      keyStatuses,
      message:
        workingKeys.length > 0
          ? `${workingKeys.length} of ${uniqueKeys.length} API keys are working. Total daily limit: ${totalDailyLimit} requests.`
          : "No working API keys found. Please check your API key configuration.",
    })
  } catch (error) {
    console.error("Error testing API keys:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to test API keys",
        details: error instanceof Error ? error.message : "Unknown error",
        totalKeys: 0,
        totalDailyLimit: 0,
        totalRemainingRequests: 0,
        testResults: [],
        keyStatuses: [],
      },
      { status: 500 },
    )
  }
}
