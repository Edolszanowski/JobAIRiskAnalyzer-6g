/**
 * NUCLEAR-PROOF ADMIN LAYOUT
 * --------------------------
 * 1. Removes **all** external dependencies – only React hooks are used.
 * 2. Renders NOTHING during SSR (returns `null`) ⇒ server & client markup
 *    are guaranteed to be identical.
 * 3. After client mounts, waits 150 ms before painting children to ensure
 *    browser has fully taken over.
 * 4. Uses only plain HTML elements & inline styles – no class names, no CSS
 *    frameworks, no icons, no tailwind, no lucide, etc.
 */

"use client"

import { useEffect, useState } from "react"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mounted, setMounted] = useState(false)   // true after first client paint
  const [ready, setReady] = useState(false)       // true after small delay

  useEffect(() => {
    // mark mounted immediately on client
    setMounted(true)

    // tiny delay (150 ms) guarantees browser has control before first paint
    const t = setTimeout(() => setReady(true), 150)

    // body flag in case external styles need to hide SSR content
    document.body.dataset.client = "true"

    return () => {
      clearTimeout(t)
      delete document.body.dataset.client
    }
  }, [])

  /* -------------------------------------------------------------------- */
  /* 1. Server-Side Render & very first client pass – output **nothing**   */
  /* -------------------------------------------------------------------- */
  if (!mounted) return null

  /* -------------------------------------------------------------------- */
  /* 2. Brief client-side placeholder while we wait for `ready` flag       */
  /* -------------------------------------------------------------------- */
  if (!ready) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#f3f4f6",
          color: "#374151",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              border: "4px solid #93c5fd",
              borderTopColor: "transparent",
              borderRadius: "50%",
              margin: "0 auto 12px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <p style={{ fontSize: "16px", fontWeight: 500 }}>
            Loading Admin Dashboard…
          </p>
        </div>
        {/* simple keyframes without external CSS */}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg) } }
        `}</style>
      </div>
    )
  }

  /* -------------------------------------------------------------------- */
  /* 3. Fully ready – render children (client-only markup)                 */
  /* -------------------------------------------------------------------- */
  return <div>{children}</div>
}
