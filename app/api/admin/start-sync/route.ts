import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { BLSSyncService } from "@/lib/bls-sync-enhanced"

const sql = neon(process.env.DATABASE_URL!)

// Global sync state (in production, use Redis or database)
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
function getEnhancedSyncService(): BLSSyncService {
  if (!enhancedSyncService) {
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
    enhancedSyncService = new BLSSyncService(apiKeys)
    console.log(`🔄 Enhanced BLS Sync Service initialized with ${apiKeys.length} API keys`)
  }

  return enhancedSyncService
}

export async function POST(request: Request) {
  try {
    // Check if enhanced sync is requested
    const url = new URL(request.url)
    const useEnhanced = url.searchParams.get("enhanced") === "true"
    
    // Parse request body for configuration options
    let config = {}
    let forceRestart = false
    
    try {
      const body = await request.json()
      config = {
        maxConcurrent: body.maxConcurrent || 5,
        batchSize: body.batchSize || 50,
        retryAttempts: body.retryAttempts || 3,
        validateData: body.validateData !== false, // Default to true
      }
      forceRestart = body.forceRestart === true
    } catch (error) {
      // If body parsing fails, use default config
      console.log("No request body provided, using default configuration")
    }

    // If enhanced mode is requested, use the enhanced sync service
    if (useEnhanced) {
      return await handleEnhancedSync(config, forceRestart)
    }

    // Otherwise, use the legacy sync implementation
    if (syncState.isRunning) {
      return NextResponse.json({
        success: false,
        message: "Sync is already running",
        syncState,
      })
    }

    // Check if we have API keys configured
    const apiKeys = [process.env.BLS_API_KEY, process.env.BLS_API_KEY_2, process.env.BLS_API_KEY_3].filter(Boolean)

    if (apiKeys.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No BLS API keys configured",
        syncState,
      })
    }

    // Check database connection
    try {
      await sql`SELECT 1`
    } catch (error) {
      return NextResponse.json({
        success: false,
        message: "Database connection failed",
        error: error instanceof Error ? error.message : "Unknown database error",
        syncState,
      })
    }

    // Start the sync process
    syncState.isRunning = true
    syncState.startTime = new Date()
    syncState.processedJobs = 0
    syncState.successfulJobs = 0
    syncState.failedJobs = 0
    syncState.lastUpdated = new Date().toISOString()

    // Start background sync (don't await - let it run in background)
    startBackgroundSync(apiKeys)

    return NextResponse.json({
      success: true,
      message: `Sync started with ${apiKeys.length} API keys`,
      syncState,
    })
  } catch (error) {
    console.error("Error starting sync:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to start sync",
        error: error instanceof Error ? error.message : "Unknown error",
        syncState,
      },
      { status: 500 },
    )
  }
}

/**
 * Handle enhanced sync using the BLSSyncService
 */
async function handleEnhancedSync(config: any, forceRestart: boolean) {
  try {
    // Get enhanced sync service
    const syncService = getEnhancedSyncService()
    
    // Check if sync is already running
    const currentProgress = syncService.getSyncProgress()
    if (currentProgress.isRunning && !forceRestart) {
      // Map enhanced progress to legacy format for backward compatibility
      const legacyFormat = mapToLegacyFormat(currentProgress)
      
      return NextResponse.json({
        success: false,
        message: "Enhanced sync is already running. Use forceRestart=true to restart.",
        syncState: legacyFormat,
        enhancedSync: true,
      })
    }
    
    // Start sync process (don't await - let it run in background)
    const syncPromise = syncService.startSync(forceRestart)
    
    // Get initial progress for response
    const initialProgress = syncService.getSyncProgress()
    const legacyFormat = mapToLegacyFormat(initialProgress)
    
    return NextResponse.json({
      success: true,
      message: forceRestart 
        ? "Enhanced sync started with forced restart" 
        : "Enhanced sync started",
      syncState: legacyFormat,
      enhancedSync: true,
      config,
    })
  } catch (error) {
    console.error("Error starting enhanced sync:", error)
    return NextResponse.json(
      {
        success: false,
        message: "Failed to start enhanced sync",
        error: error instanceof Error ? error.message : "Unknown error",
        syncState,
        enhancedSync: true,
      },
      { status: 500 }
    )
  }
}

/**
 * Map enhanced sync progress to legacy format for backward compatibility
 */
function mapToLegacyFormat(enhancedProgress: any) {
  return {
    isRunning: enhancedProgress.isRunning,
    totalJobs: enhancedProgress.totalJobs,
    processedJobs: enhancedProgress.processedJobs,
    successfulJobs: enhancedProgress.successfulJobs,
    failedJobs: enhancedProgress.failedJobs,
    skippedJobs: enhancedProgress.skippedJobs || 0,
    currentJob: enhancedProgress.currentJob || null,
    startTime: enhancedProgress.startTime ? new Date(enhancedProgress.startTime) : null,
    lastUpdated: enhancedProgress.lastUpdated,
    // Include enhanced properties with different names to avoid conflicts
    enhancedDetails: {
      currentBatch: enhancedProgress.currentBatch,
      totalBatches: enhancedProgress.totalBatches,
      estimatedTimeRemaining: enhancedProgress.estimatedTimeRemaining,
      checkpoints: enhancedProgress.checkpoints,
    },
    apiKeysStatus: enhancedProgress.apiKeysStatus,
  }
}

async function startBackgroundSync(apiKeys: string[]) {
  console.log(`🚀 Starting background sync with ${apiKeys.length} API keys`)

  try {
    // Get list of jobs that need processing
    const existingJobs = await sql`
      SELECT occ_code FROM jobs 
      WHERE ai_impact_score IS NOT NULL AND ai_impact_score > 0
    `
    const existingCodes = new Set(existingJobs.map((job: any) => job.occ_code))

    // Sample occupation codes (in production, this would be the full 850+ list)
    const occupationCodes = [
      "11-1011", // Chief Executives
      "11-1021", // General and Operations Managers
      "11-2021", // Marketing Managers
      "11-3021", // Computer and Information Systems Managers
      "15-1211", // Computer Systems Analysts
      "15-1212", // Information Security Analysts
      "15-1252", // Software Developers
      "15-1254", // Web Developers
      "25-2021", // Elementary School Teachers
      "25-2031", // Secondary School Teachers
      "29-1141", // Registered Nurses
      "29-1171", // Nurse Practitioners
      "33-3051", // Police and Sheriff's Patrol Officers
      "35-3031", // Waiters and Waitresses
      "41-2011", // Cashiers
      "41-2031", // Retail Salespersons
      "43-4051", // Customer Service Representatives
      "43-9061", // Office Clerks, General
      "47-2031", // Carpenters
      "47-2111", // Electricians
      "49-3023", // Automotive Service Technicians and Mechanics
      "53-3032", // Heavy and Tractor-Trailer Truck Drivers
    ]

    const jobsToProcess = occupationCodes.filter((code) => !existingCodes.has(code))
    syncState.totalJobs = jobsToProcess.length

    console.log(`📊 Processing ${jobsToProcess.length} new jobs`)

    let currentKeyIndex = 0
    const keyUsage = apiKeys.map(() => ({ used: 0, limit: 500 }))

    for (let i = 0; i < jobsToProcess.length; i++) {
      const code = jobsToProcess[i]
      syncState.currentJob = code
      syncState.processedJobs = i + 1
      syncState.lastUpdated = new Date().toISOString()

      try {
        // Find available API key
        let availableKeyIndex = -1
        for (let j = 0; j < apiKeys.length; j++) {
          const keyIndex = (currentKeyIndex + j) % apiKeys.length
          if (keyUsage[keyIndex].used < keyUsage[keyIndex].limit) {
            availableKeyIndex = keyIndex
            break
          }
        }

        if (availableKeyIndex === -1) {
          console.log("⏸️ All API keys exhausted for today")
          break
        }

        currentKeyIndex = availableKeyIndex
        keyUsage[currentKeyIndex].used++

        // Simulate job processing (in production, this would call BLS API)
        await processJob(code, apiKeys[currentKeyIndex])
        syncState.successfulJobs++

        console.log(`✅ Processed ${code} (${i + 1}/${jobsToProcess.length})`)

        // Add delay to respect API limits
        await new Promise((resolve) => setTimeout(resolve, 200))
      } catch (error) {
        console.error(`❌ Failed to process ${code}:`, error)
        syncState.failedJobs++
      }
    }

    syncState.isRunning = false
    syncState.currentJob = null
    syncState.lastUpdated = new Date().toISOString()

    console.log(`🎉 Sync completed: ${syncState.successfulJobs} successful, ${syncState.failedJobs} failed`)
  } catch (error) {
    console.error("Background sync error:", error)
    syncState.isRunning = false
    syncState.currentJob = null
    syncState.lastUpdated = new Date().toISOString()
  }
}

async function processJob(occupationCode: string, apiKey: string) {
  // Simulate AI impact analysis
  const aiImpactScore = Math.floor(Math.random() * 95) + 5 // 5-100%
  const automationRisk =
    aiImpactScore > 80 ? "Very High" : aiImpactScore > 60 ? "High" : aiImpactScore > 40 ? "Medium" : "Low"

  const title = getJobTitle(occupationCode)
  const employment = Math.floor(Math.random() * 500000) + 10000
  const medianWage = Math.floor(Math.random() * 80000) + 30000

  // Insert into database
  await sql`
    INSERT INTO jobs (
      occ_code, occ_title, employment_2023, median_wage, 
      ai_impact_score, automation_risk, created_at, updated_at
    ) VALUES (
      ${occupationCode}, ${title}, ${employment}, ${medianWage},
      ${aiImpactScore}, ${automationRisk}, NOW(), NOW()
    )
    ON CONFLICT (occ_code) 
    DO UPDATE SET 
      ai_impact_score = ${aiImpactScore},
      automation_risk = ${automationRisk},
      updated_at = NOW()
  `
}

function getJobTitle(code: string): string {
  const titles: { [key: string]: string } = {
    "11-1011": "Chief Executives",
    "11-1021": "General and Operations Managers",
    "11-2021": "Marketing Managers",
    "11-3021": "Computer and Information Systems Managers",
    "15-1211": "Computer Systems Analysts",
    "15-1212": "Information Security Analysts",
    "15-1252": "Software Developers",
    "15-1254": "Web Developers",
    "25-2021": "Elementary School Teachers",
    "25-2031": "Secondary School Teachers",
    "29-1141": "Registered Nurses",
    "29-1171": "Nurse Practitioners",
    "33-3051": "Police and Sheriff's Patrol Officers",
    "35-3031": "Waiters and Waitresses",
    "41-2011": "Cashiers",
    "41-2031": "Retail Salespersons",
    "43-4051": "Customer Service Representatives",
    "43-9061": "Office Clerks, General",
    "47-2031": "Carpenters",
    "47-2111": "Electricians",
    "49-3023": "Automotive Service Technicians and Mechanics",
    "53-3032": "Heavy and Tractor-Trailer Truck Drivers",
  }
  return titles[code] || `Occupation ${code}`
}

export async function GET(request: Request) {
  try {
    // Check if enhanced sync is requested
    const url = new URL(request.url)
    const useEnhanced = url.searchParams.get("enhanced") === "true"
    
    // If enhanced mode is requested, use the enhanced sync service
    if (useEnhanced) {
      try {
        const syncService = getEnhancedSyncService()
        const enhancedProgress = syncService.getSyncProgress()
        const legacyFormat = mapToLegacyFormat(enhancedProgress)
        
        return NextResponse.json({
          success: true,
          syncState: legacyFormat,
          enhancedSync: true,
        })
      } catch (error) {
        console.error("Error getting enhanced sync status:", error)
        return NextResponse.json({
          success: false,
          message: "Failed to get enhanced sync status",
          error: error instanceof Error ? error.message : "Unknown error",
          syncState,
          enhancedSync: true,
        })
      }
    }
    
    // Otherwise, use legacy sync state
    return NextResponse.json({
      success: true,
      syncState,
    })
  } catch (error) {
    console.error("Error getting sync status:", error)
    return NextResponse.json({
      success: false,
      message: "Failed to get sync status",
      error: error instanceof Error ? error.message : "Unknown error",
      syncState,
    })
  }
}
