"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

/**
 * Admin Layout - COMPLETELY CLIENT SIDE RENDERED
 * 
 * This layout wraps all admin routes and ensures they are ONLY rendered
 * on the client side. This aggressive approach completely eliminates
 * hydration errors by ensuring server and client renders are identical
 * (both showing just a loading spinner until client takes over).
 * 
 * This is the most robust solution for preventing React hydration errors
 * (#418, #423, #425) in the admin section.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // State to track if we're on the client
  const [mounted, setMounted] = useState(false)
  
  // Only set mounted to true after component has mounted on the client
  useEffect(() => {
    setMounted(true)
    
    // Extra safety: Add a class to the body when in client mode
    // This can be used for CSS targeting to hide SSR content
    document.body.classList.add('client-rendered')
    
    return () => {
      document.body.classList.remove('client-rendered')
    }
  }, [])
  
  // During SSR and initial client render, return only a loading spinner
  // This ensures identical markup between server and client
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-blue-600" />
          <h2 className="text-xl font-medium mb-1">Loading Admin Dashboard</h2>
          <p className="text-gray-500">Please wait while we prepare the dashboard...</p>
        </div>
      </div>
    )
  }
  
  // Only render the actual admin content after client-side mount
  // This completely avoids any hydration mismatches
  return (
    <div id="admin-client-root" data-client-rendered="true">
      {children}
    </div>
  )
}
