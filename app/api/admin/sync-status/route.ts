import { NextResponse } from "next/server"
import { BLSSyncService } from "@/lib/bls-sync-enhanced"

// Force this route to be treated as dynamic at build time
export const dynamic = "force-dynamic"

// Import the getSyncService function from the enhanced-sync module
// This ensures we're using the same singleton instance
let syncService: BLSSyncService | null = null

// Get the singleton sync service instance
function getSyncService(): BLSSyncService | null {
  try {
    if (!syncService) {
      // Get API keys from environment variables
      const apiKeys = [
        process.env.BLS_API_KEY,
        process.env.BLS_API_KEY_2,
        process.env.BLS_API_KEY_3,
      ].filter(Boolean) as string[]

      if (apiKeys.length === 0) {
        console.warn("No BLS API keys configured for sync service")
        return null
      }

      // Create new sync service instance
      syncService = new BLSSyncService(apiKeys)
      console.log(`🔄 Sync Status: BLS Sync Service initialized with ${apiKeys.length} API keys`)
    }

    return syncService
  } catch (error) {
    console.error("Failed to initialize sync service:", error)
    return null
  }
}

/**
 * GET /api/admin/sync-status
 * Returns the current status of the data synchronization process.
 */
export async function GET(request: Request) {
  try {
    // Always try to use the enhanced sync service first
    const service = getSyncService()
    
    if (service) {
      // Get enhanced progress
      const progress = service.getSyncProgress()
      
      // Return the enhanced sync progress in the format the Admin Dashboard expects
      return NextResponse.json({
        isRunning: progress.isRunning,
        totalJobs: progress.totalJobs,
        processedJobs: progress.processedJobs,
        successfulJobs: progress.successfulJobs,
        failedJobs: progress.failedJobs,
        skippedJobs: progress.skippedJobs || 0,
        currentJob: progress.currentJob,
        lastError: progress.lastError,
        lastErrorTime: progress.lastErrorTime,
        startTime: progress.startTime,
        endTime: progress.endTime,
        lastUpdated: progress.lastUpdated,
        apiKeysStatus: progress.apiKeysStatus || {
          totalKeys: 0,
          totalDailyLimit: 0,
          totalRemainingRequests: 0,
          keyStatuses: []
        },
        enhancedDetails: {
          currentBatch: progress.currentBatch,
          totalBatches: progress.totalBatches,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          checkpoints: progress.checkpoints || []
        }
      })
    }
    
    // Fall back to a basic response if sync service is not available
    console.warn("Enhanced sync service not available, returning basic status")
    return NextResponse.json({
      isRunning: false,
      totalJobs: 850,
      processedJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      currentJob: null,
      lastUpdated: new Date().toISOString(),
      apiKeysStatus: {
        totalKeys: 0,
        totalDailyLimit: 0,
        totalRemainingRequests: 0,
        keyStatuses: []
      },
      error: "Enhanced sync service not initialized"
    })
  } catch (error) {
    console.error("Error getting sync status:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to get sync status",
        error: error instanceof Error ? error.message : "Unknown error",
        isRunning: false,
        totalJobs: 850,
        processedJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        lastUpdated: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}
