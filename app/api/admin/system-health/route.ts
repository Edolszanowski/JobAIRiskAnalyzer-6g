import { NextResponse } from "next/server"
import { getHealthMonitor, HealthStatus, AlertLevel } from "@/lib/health-monitor"
import { BLSService } from "@/lib/bls-service"
import { BLSSyncService } from "@/lib/bls-sync-enhanced"

// Singleton instances for services
let blsService: BLSService | null = null
let syncService: BLSSyncService | null = null
let healthMonitorInitialized = false

/**
 * Initialize health monitoring system
 * @param forceRestart Force restart of health monitoring
 */
function initializeHealthMonitor(forceRestart = false): void {
  if (healthMonitorInitialized && !forceRestart) {
    return
  }

  try {
    // Get API keys from environment variables
    const apiKeys = [
      process.env.BLS_API_KEY,
      process.env.BLS_API_KEY_2,
      process.env.BLS_API_KEY_3,
    ].filter(Boolean) as string[]

    if (apiKeys.length === 0) {
      console.warn("⚠️ No BLS API keys configured for health monitoring")
    }

    // Initialize BLS Service if needed
    if (!blsService || forceRestart) {
      blsService = new BLSService(apiKeys)
    }

    // Initialize Sync Service if needed
    if (!syncService || forceRestart) {
      syncService = new BLSSyncService(apiKeys)
    }

    // Get health monitor and start monitoring
    const healthMonitor = getHealthMonitor({
      checkIntervalMs: 60000, // 1 minute
      historySize: 100,
    })

    // Register services for monitoring
    if (blsService) {
      healthMonitor.registerBLSService(blsService)
    }

    if (syncService) {
      healthMonitor.registerSyncService(syncService)
    }

    // Start health monitoring if not already running
    if (!healthMonitorInitialized || forceRestart) {
      healthMonitor.start()
      healthMonitorInitialized = true
      console.log("🏥 Health monitoring system initialized and started")
    }
  } catch (error) {
    console.error("❌ Failed to initialize health monitoring:", error)
    throw error
  }
}

/**
 * GET /api/admin/system-health
 * Get current system health status
 */
export async function GET(request: Request) {
  try {
    // Initialize health monitoring if not already running
    if (!healthMonitorInitialized) {
      initializeHealthMonitor()
    }

    // Get query parameters
    const url = new URL(request.url)
    const detailed = url.searchParams.get("detailed") === "true"
    const includeHistory = url.searchParams.get("history") === "true"
    const historyLimit = parseInt(url.searchParams.get("limit") || "10", 10)

    // Get health monitor
    const healthMonitor = getHealthMonitor()

    // Get current health
    const health = healthMonitor.getCurrentHealth()

    // Format response based on detail level
    if (!detailed) {
      // Simple response for dashboard overview
      return NextResponse.json({
        success: true,
        status: health.status,
        score: health.overallScore,
        components: {
          database: {
            status: health.components.database.status,
            message: health.components.database.message,
          },
          apiKeys: {
            status: health.components.apiKeys.status,
            message: health.components.apiKeys.message,
          },
          blsApi: {
            status: health.components.blsApi.status,
            message: health.components.blsApi.message,
          },
          dataSync: {
            status: health.components.dataSync.status,
            message: health.components.dataSync.message,
          },
        },
        alerts: health.alerts.filter(alert => !alert.resolved).length,
        recommendations: health.recommendations.length > 0 ? health.recommendations[0] : null,
        timestamp: health.timestamp,
      })
    }

    // Detailed response
    const response: any = {
      success: true,
      health,
    }

    // Include history if requested
    if (includeHistory) {
      const history = healthMonitor.getHealthHistory()
      response.history = history.slice(-historyLimit).map(item => ({
        timestamp: item.timestamp,
        status: item.status,
        score: item.overallScore,
        components: {
          database: item.components.database.status,
          apiKeys: item.components.apiKeys.status,
          blsApi: item.components.blsApi.status,
          dataSync: item.components.dataSync.status,
        },
      }))
    }

    // Include recovery actions
    response.recoveryActions = healthMonitor.getRecoveryActions()

    return NextResponse.json(response)
  } catch (error) {
    console.error("Error getting system health:", error)
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
 * POST /api/admin/system-health
 * Trigger manual health check
 */
export async function POST(request: Request) {
  try {
    // Parse request body
    const body = await request.json()
    
    // Extract options
    const forceRestart = body.forceRestart === true
    
    // Initialize or restart health monitoring
    initializeHealthMonitor(forceRestart)
    
    // Get health monitor
    const healthMonitor = getHealthMonitor()
    
    // Perform manual health check
    const health = await healthMonitor.checkHealth()
    
    // Return health status with recovery actions
    return NextResponse.json({
      success: true,
      message: "Manual health check completed",
      health,
      recoveryActions: healthMonitor.getRecoveryActions(),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error performing manual health check:", error)
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
 * Helper function to get status badge color for frontend
 * @param status Health status
 * @returns Color for status badge
 */
function getStatusColor(status: HealthStatus): string {
  switch (status) {
    case HealthStatus.HEALTHY:
      return "green"
    case HealthStatus.DEGRADED:
      return "yellow"
    case HealthStatus.WARNING:
      return "orange"
    case HealthStatus.CRITICAL:
      return "red"
    default:
      return "gray"
  }
}

/**
 * Helper function to get alert level color for frontend
 * @param level Alert level
 * @returns Color for alert badge
 */
function getAlertColor(level: AlertLevel): string {
  switch (level) {
    case AlertLevel.INFO:
      return "blue"
    case AlertLevel.WARNING:
      return "yellow"
    case AlertLevel.ERROR:
      return "red"
    case AlertLevel.CRITICAL:
      return "purple"
    default:
      return "gray"
  }
}
