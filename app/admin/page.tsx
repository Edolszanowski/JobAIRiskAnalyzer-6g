"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

// Import the dashboard component directly since we're handling client-side rendering ourselves
import ClientOnlyAdminDashboard from "@/components/admin/ClientOnlyAdminDashboard"

/**
 * Admin Dashboard Page - COMPLETELY CLIENT SIDE RENDERED
 * 
 * This page is explicitly marked as client-only with "use client" directive.
 * It uses a mounted state check to ensure absolutely nothing renders during SSR.
 * This aggressive approach eliminates all hydration errors by ensuring
 * server and client renders are identical (both empty until client takes over).
 */
export default function AdminPage() {
  // State to track if we're on the client
  const [mounted, setMounted] = useState(false)
  
  // Only set mounted to true after component has mounted on the client
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // During SSR and initial client render, return absolutely nothing
  // This ensures identical markup between server and client
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    )
  }
  
  // Only render the dashboard after client-side mount
  return (
    <div className="min-h-screen bg-gray-50">
      <ClientOnlyAdminDashboard />
    </div>
  )
}
