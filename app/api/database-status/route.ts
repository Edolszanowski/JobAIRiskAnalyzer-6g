import { NextResponse } from "next/server"
import { getDatabaseStatus } from "@/lib/database-enhanced"

/**
 * GET /api/database-status
 * Uses the enhanced database layer (circuit-breaker + retry) to return
 * current database health information.  The response shape is kept
 * backward-compatible with the existing admin dashboard while adding
 * extra diagnostics (circuitBreakerOpen, consecutiveFailures, etc.).
 */
export async function GET() {
  try {
    const status = await getDatabaseStatus()

    // When the enhanced helper cannot connect it already returns a
    // structured object; surface it directly for consumers.
    if (!status.connected) {
      return NextResponse.json(status)
    }

    // Map the enhanced status into the legacy response schema expected
    // by the dashboard, while preserving new diagnostics at the root.
    return NextResponse.json({
      connected: true,
      responseTime: status.responseTime,
      circuitBreakerOpen: status.circuitBreakerOpen,
      consecutiveFailures: status.consecutiveFailures,
      database: {
        url: process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ||
          process.env.NEON_DATABASE_URL?.split("@")[1]?.split("/")[0] ||
          process.env.POSTGRES_URL?.split("@")[1]?.split("/")[0] ||
          "unknown",
        tables: status.tables,
        data: status.data,
      },
      timestamp: status.timestamp,
    })
  } catch (error) {
    console.error("database-status endpoint error:", error)
    return NextResponse.json({
      connected: false,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    })
  }
}
