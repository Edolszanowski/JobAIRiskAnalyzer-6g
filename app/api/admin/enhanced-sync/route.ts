import { NextResponse } from "next/server"
import { BLSSyncService, SyncConfig, SyncProgress } from "@/lib/bls-sync-enhanced"

// Singleton instance of BLSSyncService to maintain state across requests
let syncService: BLSSyncService | null = null

// Initialize the sync service if it doesn't exist
function getSyncService(forceNew = false): BLSSyncService {
  if (!syncService || forceNew) {
    // Get API keys from environment variables
    const apiKeys = [
      process.env.BLS_API_KEY,
      process.env.BLS_API_KEY_2,
      process.env.BLS_API_KEY_3,
    ].filter(Boolean) as string[]

    if (apiKeys.length === 0) {
      throw new Error("No BLS API keys configured. Please set BLS_API_KEY environment variable.")
    }

    // Create new sync service instance
    syncService = new BLSSyncService(apiKeys)
    console.log(`🔄 Enhanced BLS Sync Service initialized with ${apiKeys.length} API keys`)
  }

  return syncService
}

/**
 * GET /api/admin/enhanced-sync
 * Get current sync status with detailed progress information
 */
export async function GET(request: Request) {
  try {
    // Get query parameters
    const url = new URL(request.url)
    const detailed = url.searchParams.get("detailed") === "true"

    // Initialize service if needed
    const service = getSyncService()
    
    // Get current progress
    const progress: SyncProgress = service.getSyncProgress()

    // For non-detailed requests, return a simplified response
    if (!detailed) {
      return NextResponse.json({
        success: true,
        isRunning: progress.isRunning,
        totalJobs: progress.totalJobs,
        processedJobs: progress.processedJobs,
        successfulJobs: progress.successfulJobs,
        failedJobs: progress.failedJobs,
        skippedJobs: progress.skippedJobs,
        progress: progress.totalJobs > 0 
          ? Math.round((progress.processedJobs / progress.totalJobs) * 100) 
          : 0,
        startTime: progress.startTime,
        endTime: progress.endTime,
        estimatedTimeRemaining: progress.estimatedTimeRemaining,
        lastUpdated: progress.lastUpdated,
        apiKeysStatus: {
          totalKeys: progress.apiKeysStatus.totalKeys,
          totalRemainingRequests: progress.apiKeysStatus.totalRemainingRequests,
        },
      })
    }

    // Return full detailed progress
    return NextResponse.json({
      success: true,
      progress,
    })
  } catch (error) {
    console.error("Error getting sync status:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/enhanced-sync
 * Start enhanced sync with configuration options
 */
export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json()
    
    // Extract configuration options
    const config: Partial<SyncConfig> = {
      maxConcurrent: body.maxConcurrent || 5,
      batchSize: body.batchSize || 50,
      retryAttempts: body.retryAttempts || 3,
      validateData: body.validateData !== false, // Default to true
      resumeFromLastCheckpoint: body.resumeFromLastCheckpoint !== false, // Default to true
    }
    
    // Force restart if specified
    const forceRestart = body.forceRestart === true
    
    // Initialize service
    const service = getSyncService()
    
    // Check if sync is already running
    const currentProgress = service.getSyncProgress()
    if (currentProgress.isRunning && !forceRestart) {
      return NextResponse.json({
        success: false,
        message: "Sync is already running. Use forceRestart=true to restart or DELETE to stop.",
        currentProgress: {
          isRunning: currentProgress.isRunning,
          processedJobs: currentProgress.processedJobs,
          totalJobs: currentProgress.totalJobs,
          progress: currentProgress.totalJobs > 0 
            ? Math.round((currentProgress.processedJobs / currentProgress.totalJobs) * 100) 
            : 0,
        },
      })
    }
    
    // Start sync process (don't await - let it run in background)
    const syncPromise = service.startSync(forceRestart)
    
    // Return immediate response
    return NextResponse.json({
      success: true,
      message: forceRestart 
        ? "Enhanced sync started with forced restart" 
        : "Enhanced sync started",
      config,
      initialStatus: service.getSyncProgress(),
    })
  } catch (error) {
    console.error("Error starting enhanced sync:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/enhanced-sync
 * Stop current sync process
 */
export async function DELETE() {
  try {
    // Get sync service
    const service = getSyncService()
    
    // Check if sync is running
    const currentProgress = service.getSyncProgress()
    if (!currentProgress.isRunning) {
      return NextResponse.json({
        success: false,
        message: "No sync is currently running",
      })
    }
    
    // Stop sync process
    const result = await service.stopSync()
    
    return NextResponse.json({
      success: result.success,
      message: result.message,
      finalStatus: service.getSyncProgress(),
    })
  } catch (error) {
    console.error("Error stopping sync:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
