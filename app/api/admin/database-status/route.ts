import { NextResponse } from "next/server"
import { getDatabaseStatus } from "@/lib/database-enhanced"
import { sqlEnhanced } from "@/lib/database-enhanced"

// Force dynamic to prevent caching
export const dynamic = "force-dynamic"

/**
 * GET /api/admin/database-status
 * 
 * A simplified database status endpoint specifically for the admin dashboard.
 * Returns basic connection status, table count, and job record count.
 */
export async function GET() {
  try {
    // Get basic database status using the enhanced layer
    const status = await getDatabaseStatus()
    
    // If not connected, return simple error response
    if (!status.connected) {
      return NextResponse.json({
        connected: false,
        tables: 0,
        records: 0,
        error: status.error || "Database connection failed",
        timestamp: new Date().toISOString()
      })
    }
    
    // Get job record count
    let recordCount = 0
    try {
      // Specifically count records in the jobs table
      const result = await sqlEnhanced`SELECT COUNT(*) as count FROM jobs`
      recordCount = parseInt(result[0]?.count || '0', 10)
    } catch (countError) {
      console.error("Error counting job records:", countError)
      // Continue with zero count if this fails
    }
    
    // Return simplified response with just what the minimal dashboard needs
    return NextResponse.json({
      connected: true,
      tables: status.tables?.length || 0,
      records: recordCount,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error("Admin database status error:", error)
    
    // Return error response with safe defaults
    return NextResponse.json({
      connected: false,
      tables: 0,
      records: 0,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    })
  }
}
