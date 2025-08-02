import { NextResponse } from "next/server"
import { BLSSyncService } from "@/lib/bls-sync-enhanced"

// Global sync state for legacy system (in production, use Redis or database)
const syncState = {
  isRunning: false,
  totalJobs: 850,
  processedJobs: 0,
  successfulJobs: 0,
  failedJobs: 0,
  currentJob: null as string | null,
  startTime: null as Date | null,
  lastUpdated: new Date().toISOString(),
}

// Singleton instance of enhanced sync service
let enhancedSyncService: BLSSyncService | null = null

// Get or create enhanced sync service
function getEnhancedSyncService(): BLSSyncService | null {
  try {
    if (!enhancedSyncService) {
      // Get API keys from environment variables
      const apiKeys = [
        process.env.BLS_API_KEY,
        process.env.BLS_API_KEY_2,
        process.env.BLS_API_KEY_3,
      ].filter(Boolean) as string[]

      if (apiKeys.length === 0) {
        console.warn("No BLS API keys configured for enhanced sync service")
        return null
      }

      // Create new sync service instance
      enhancedSyncService = new BLSSyncService(apiKeys)
      console.log(`🔄 Enhanced BLS Sync Service initialized with ${apiKeys.length} API keys`)
    }

    return enhancedSyncService
  } catch (error) {
    console.error("Failed to initialize enhanced sync service:", error)
    return null
  }
}

/**
 * GET /api/admin/sync-status
 * Returns the current status of the data synchronization process.
 * Supports both legacy and enhanced sync systems.
 */
export async function GET(request: Request) {
  try {
    // Check if enhanced sync is requested
    const url = new URL(request.url)
    const useEnhanced = url.searchParams.get("enhanced") === "true"
    
    // If enhanced mode is requested and available, use the enhanced sync service
    if (useEnhanced) {
      const syncService = getEnhancedSyncService()
      
      if (syncService) {
        // Get enhanced progress and map to expected format
        const enhancedProgress = syncService.getSyncProgress()
        
        // Create API key status object
        const apiKeysStatus = {
          totalKeys: enhancedProgress.apiKeysStatus?.totalKeys || 0,
          totalDailyLimit: enhancedProgress.apiKeysStatus?.totalDailyLimit || 0,
          totalRemainingRequests: enhancedProgress.apiKeysStatus?.totalRemainingRequests || 0,
          keyStatuses: enhancedProgress.apiKeysStatus?.keyStatuses || [],
        }
        
        return NextResponse.json({
          isRunning: enhancedProgress.isRunning,
          totalJobs: enhancedProgress.totalJobs,
          processedJobs: enhancedProgress.processedJobs,
          successfulJobs: enhancedProgress.successfulJobs,
          failedJobs: enhancedProgress.failedJobs,
          currentJob: enhancedProgress.currentJob,
          lastUpdated: enhancedProgress.lastUpdated,
          apiKeysStatus,
          enhancedSync: true,
          // Include enhanced details for advanced clients
          enhancedDetails: {
            currentBatch: enhancedProgress.currentBatch,
            totalBatches: enhancedProgress.totalBatches,
            estimatedTimeRemaining: enhancedProgress.estimatedTimeRemaining,
            checkpoints: enhancedProgress.checkpoints,
          }
        })
      }
    }
    
    // Fall back to legacy sync state
    // In a real app, this would fetch from a database or state management system
    
    // Create mock API key status for legacy system
    const apiKeysStatus = {
      totalKeys: 1,
      totalDailyLimit: 500,
      totalRemainingRequests: 450,
      keyStatuses: [
        {
          keyPreview: process.env.BLS_API_KEY ? `${process.env.BLS_API_KEY.substring(0, 4)}...` : "N/A",
          requestsUsed: 50,
          requestsRemaining: 450,
          isBlocked: false,
        }
      ]
    }
    
    return NextResponse.json({
      ...syncState,
      apiKeysStatus,
      enhancedSync: false
    })
  } catch (error) {
    console.error("Error getting sync status:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to get sync status",
        error: error instanceof Error ? error.message : "Unknown error",
        syncState,
      },
      { status: 500 }
    )
  }
}
