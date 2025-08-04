/**
 * Admin Dashboard Page (Ultra-minimal)
 *
 * This version renders only the UltraMinimalDashboard component to quickly
 * verify whether hydration errors are eliminated when the page is stripped
 * down to the simplest possible client-only implementation.
 */

"use client"

// Always render dynamically to avoid stale cache / mismatches.
export const dynamic = "force-dynamic"

import UltraMinimalDashboard from "../../components/admin/UltraMinimalDashboard"
import { useEffect, useState } from "react"

export default function AdminPage() {
  /**
   * Hydration-proof strategy
   * 1. During SSR → component not mounted → return null (no markup).
   * 2. On client mount → wait a short delay (200 ms) before rendering any UI.
   *    This guarantees the browser has taken over before React produces markup.
   */

  // True only after first client paint
  const [mounted, setMounted] = useState(false)
  // True only after an additional delay
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // mark as mounted immediately on client
    setMounted(true)
    // add small delay to guarantee client-only render
    const timer = setTimeout(() => {
      setReady(true)
    }, 200)
    return () => clearTimeout(timer)
  }, [])

  // SSR: render nothing
  if (!mounted) {
    return null
  }

  // Client but still within delay: show minimal loading UI
  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p>Loading admin dashboard…</p>
      </div>
    )
  }

  // Fully ready on client: render dashboard
  return <UltraMinimalDashboard />
}
