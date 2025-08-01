import { NextResponse } from "next/server"
import { BLSService } from "@/lib/bls-service"

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
        keyStatuses: [],
      })
    }

    // Initialize BLS service with all keys
    const blsService = new BLSService(uniqueKeys)
    const keyStatuses = blsService.getAllKeyStatuses()
    const totalRemaining = blsService.getTotalRemainingRequests()
    const currentKeyInfo = blsService.getCurrentKeyInfo()

    return NextResponse.json({
      success: true,
      totalKeys: uniqueKeys.length,
      totalDailyLimit: uniqueKeys.length * 500,
      totalRemainingRequests: totalRemaining,
      currentKey: currentKeyInfo,
      keyStatuses: keyStatuses.map((status) => ({
        keyPreview: status.keyPreview,
        requestsUsed: status.requestsUsed,
        requestsRemaining: status.requestsRemaining,
        isBlocked: status.isBlocked,
        blockUntil: status.blockUntil,
      })),
      timeUntilReset: blsService.getTimeUntilNextReset(),
      message: `${uniqueKeys.length} API keys configured with ${totalRemaining} total requests remaining today.`,
    })
  } catch (error) {
    console.error("Error fetching API key status:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch API key status",
        details: error instanceof Error ? error.message : "Unknown error",
        totalKeys: 0,
        totalDailyLimit: 0,
        totalRemainingRequests: 0,
        keyStatuses: [],
      },
      { status: 500 },
    )
  }
}
