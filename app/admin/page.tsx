import { Metadata } from "next"
import dynamic from "next/dynamic"

// Define metadata for the page
export const metadata: Metadata = {
  title: "Admin Dashboard | JobAIRiskAnalyzer",
  description: "Administration and monitoring dashboard for the JobAIRiskAnalyzer system",
}

// Import loading component for better UX during dynamic loading
import { Loader2 } from "lucide-react"

// Dynamic import with SSR disabled to prevent hydration errors
const ClientOnlyAdminDashboard = dynamic(
  () => import("@/components/admin/ClientOnlyAdminDashboard"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    ),
  }
)

/**
 * Admin Dashboard Page
 * 
 * This is a simple wrapper that imports the ClientOnlyAdminDashboard component.
 * All dashboard logic has been moved to the client-only component to avoid
 * hydration errors that occur when server and client renders don't match.
 */
export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <ClientOnlyAdminDashboard />
    </div>
  )
}
