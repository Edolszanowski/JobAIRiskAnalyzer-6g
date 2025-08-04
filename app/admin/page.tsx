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

export default function AdminPage() {
  return <UltraMinimalDashboard />
}
