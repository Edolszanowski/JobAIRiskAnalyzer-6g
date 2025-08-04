/**
 * UltraMinimalDashboard
 * ---------------------
 * Renders a completely STATIC React tree. After hydration, all dynamic data is
 * fetched and painted via imperative DOM manipulation (document.getElementById).
 * This eliminates **all** possible React hydration mismatches because React
 * never re-renders after the initial mount.
 */

"use client"

import { useEffect, useRef } from "react"

export default function UltraMinimalDashboard() {
  // store interval ref for cleanup
  const intervalRef = useRef<NodeJS.Timeout>()

  // helpers ------------------------------------------------------------------
  const $ = (id: string) => document.getElementById(id)

  const setText = (id: string, value: string) => {
    const el = $(id)
    if (el) el.textContent = value
  }

  const setBar = (id: string, pct: number) => {
    const el = $(id) as HTMLElement | null
    if (el) el.style.width = `${Math.min(Math.max(pct, 0), 100)}%`
  }

  const fetchDatabaseStatus = async () => {
    try {
      const res = await fetch("/api/admin/database-status")
      const d = await res.json()
      setText("db-conn", d.connected ? "Connected" : "Disconnected")
      setText("db-tables", String(d.tables ?? 0))
      setText("db-records", String(d.records ?? 0))
    } catch (err) {
      console.error("db status error", err)
    }
  }

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch("/api/admin/sync-status")
      const s = await res.json()
      setText("sync-state", s.isRunning ? "Running" : "Idle")
      setText("sync-progress", `${s.processedJobs} / ${s.totalJobs}`)
      const pct =
        s.totalJobs > 0 ? Math.round((s.processedJobs / s.totalJobs) * 100) : 0
      setBar("progress-bar", pct)
      setText("progress-label", `${pct}%`)
      setText("sync-success", String(s.successfulJobs))
      setText("sync-fail", String(s.failedJobs))
    } catch (err) {
      console.error("sync status error", err)
    }
  }

  const startSync = async () => {
    try {
      await fetch("/api/admin/enhanced-sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      })
      alert("Sync started!")
      fetchSyncStatus()
    } catch (err: any) {
      alert(`Failed to start sync: ${err.message ?? err}`)
    }
  }

  // effect: initial load & interval
  useEffect(() => {
    // first paint
    fetchDatabaseStatus()
    fetchSyncStatus()

    intervalRef.current = setInterval(() => {
      fetchDatabaseStatus()
      fetchSyncStatus()
    }, 4000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  // static markup ------------------------------------------------------------
  return (
    <div
      style={{
        padding: "20px",
        maxWidth: "1000px",
        margin: "0 auto",
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: "#f9fafb",
      }}
    >
      <h1
        style={{
          fontSize: "24px",
          marginBottom: "20px",
          color: "#111827",
        }}
      >
        Admin Dashboard
      </h1>
      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <button
          style={{
            padding: "8px 16px",
            backgroundColor: "#F3F4F6",
            border: "1px solid #D1D5DB",
            borderRadius: "4px",
            cursor: "pointer",
          }}
          onClick={() => {
            fetchDatabaseStatus()
            fetchSyncStatus()
          }}
        >
          Refresh
        </button>
        <button
          style={{
            padding: "8px 16px",
            backgroundColor: "#10B981",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
          onClick={startSync}
        >
          Start Sync
        </button>
      </div>

      {/* cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))",
          gap: "20px",
        }}
      >
        {/* DB card */}
        <div
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: "8px",
            padding: "16px",
            backgroundColor: "white",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              marginBottom: "12px",
              fontWeight: 600,
              color: "#111827",
            }}
          >
            Database Status
          </h2>
          <p>
            <strong>Connection:</strong>{" "}
            <span id="db-conn" style={{ marginLeft: "6px" }}>
              Checking…
            </span>
          </p>
          <p>
            <strong>Tables:</strong>{" "}
            <span id="db-tables" style={{ marginLeft: "6px" }}>
              --
            </span>
          </p>
          <p>
            <strong>Records:</strong>{" "}
            <span id="db-records" style={{ marginLeft: "6px" }}>
              --
            </span>
          </p>
        </div>

        {/* Sync card */}
        <div
          style={{
            border: "1px solid #E5E7EB",
            borderRadius: "8px",
            padding: "16px",
            backgroundColor: "white",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              marginBottom: "12px",
              fontWeight: 600,
              color: "#111827",
            }}
          >
            Sync Status
          </h2>
          <p>
            <strong>Status:</strong>{" "}
            <span id="sync-state" style={{ marginLeft: "6px" }}>
              --
            </span>
          </p>
          <p>
            <strong>Progress:</strong>{" "}
            <span id="sync-progress" style={{ marginLeft: "6px" }}>
              -- / --
            </span>
          </p>

          <div
            style={{
              height: "20px",
              backgroundColor: "#E5E7EB",
              borderRadius: "10px",
              overflow: "hidden",
              margin: "8px 0",
            }}
          >
            <div
              id="progress-bar"
              style={{
                height: "100%",
                width: "0%",
                backgroundColor: "#10B981",
                transition: "width 0.3s ease",
              }}
            ></div>
          </div>
          <div
            id="progress-label"
            style={{ textAlign: "center", fontSize: "14px", color: "#6B7280" }}
          >
            0%
          </div>

          <p>
            <strong>Successful:</strong>{" "}
            <span id="sync-success" style={{ marginLeft: "6px" }}>
              --
            </span>
          </p>
          <p>
            <strong>Failed:</strong>{" "}
            <span id="sync-fail" style={{ marginLeft: "6px" }}>
              --
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}

