"use client"

// Prevent static generation & caching. This guarantees the route is rendered
// fresh on every request and then immediately taken over by client-only logic,
// avoiding any potential mismatch with pre-generated HTML.
export const dynamic = "force-dynamic"

import { useState, useEffect } from "react"

// Import the new ultra-lightweight, client-only dashboard
import MinimalAdminDashboard from "@/components/admin/MinimalAdminDashboard"

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
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f9fafb",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Loading admin dashboard…</p>
      </div>
    )
  }
  
  // Only render the dashboard after client-side mount
  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      <MinimalAdminDashboard />
    </div>
  )
}
