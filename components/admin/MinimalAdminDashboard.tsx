"use client"

import { useState, useEffect, useRef } from "react"

/**
 * MinimalAdminDashboard - Extremely simplified dashboard with zero hydration issues
 * 
 * This component uses only basic HTML elements and minimal React hooks
 * to ensure there are absolutely no hydration mismatches between server and client.
 */
export default function MinimalAdminDashboard() {
  // Client-side only rendering guard
  const [isClient, setIsClient] = useState(false)
  
  // Basic state management
  const [dbStatus, setDbStatus] = useState({ connected: false, tables: 0, records: 0 })
  const [syncStatus, setSyncStatus] = useState({ 
    isRunning: false,
    totalJobs: 0,
    processedJobs: 0,
    successfulJobs: 0,
    failedJobs: 0,
    startTime: null,
    endTime: null
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  
  // Interval reference for cleanup
  const statusIntervalRef = useRef(null)
  
  // Client-side only guard
  useEffect(() => {
    setIsClient(true)
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
      }
    }
  }, [])
  
  // Load initial data
  useEffect(() => {
    if (!isClient) return
    
    const loadInitialData = async () => {
      try {
        setLoading(true)
        await Promise.all([
          fetchDatabaseStatus(),
          fetchSyncStatus()
        ])
      } catch (err) {
        setError(`Failed to load initial data: ${err.message}`)
      } finally {
        setLoading(false)
      }
    }
    
    loadInitialData()
  }, [isClient])
  
  // Set up polling for sync status
  useEffect(() => {
    if (!isClient) return
    
    // Clear any existing interval
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current)
    }
    
    // Set up new interval
    statusIntervalRef.current = setInterval(() => {
      if (syncStatus.isRunning) {
        fetchSyncStatus()
      }
    }, 3000) // Poll every 3 seconds
    
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
      }
    }
  }, [isClient, syncStatus.isRunning])
  
  // Fetch database status
  const fetchDatabaseStatus = async () => {
    try {
      const response = await fetch('/api/admin/database-status')
      if (!response.ok) throw new Error(`HTTP error ${response.status}`)
      
      const data = await response.json()
      setDbStatus({
        connected: data.connected,
        tables: data.tables?.length || 0,
        records: data.records || 0
      })
    } catch (err) {
      console.error("Database status error:", err)
      setError(`Database status error: ${err.message}`)
    }
  }
  
  // Fetch sync status
  const fetchSyncStatus = async () => {
    try {
      const response = await fetch('/api/admin/sync-status')
      if (!response.ok) throw new Error(`HTTP error ${response.status}`)
      
      const data = await response.json()
      setSyncStatus({
        isRunning: data.isRunning || false,
        totalJobs: data.totalJobs || 0,
        processedJobs: data.processedJobs || 0,
        successfulJobs: data.successfulJobs || 0,
        failedJobs: data.failedJobs || 0,
        startTime: data.startTime,
        endTime: data.endTime
      })
    } catch (err) {
      console.error("Sync status error:", err)
      // Don't set global error for sync status issues to avoid blocking UI
    }
  }
  
  // Start sync process
  const startSync = async () => {
    try {
      setError("")
      const response = await fetch('/api/admin/enhanced-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `HTTP error ${response.status}`)
      }
      
      // Immediately fetch status after starting
      await fetchSyncStatus()
      
      // Show success message
      alert("Sync process started successfully!")
    } catch (err) {
      console.error("Start sync error:", err)
      setError(`Failed to start sync: ${err.message}`)
      alert(`Failed to start sync: ${err.message}`)
    }
  }
  
  // Refresh all data
  const refreshData = async () => {
    try {
      setRefreshing(true)
      setError("")
      await Promise.all([
        fetchDatabaseStatus(),
        fetchSyncStatus()
      ])
    } catch (err) {
      setError(`Refresh failed: ${err.message}`)
    } finally {
      setRefreshing(false)
    }
  }
  
  // Calculate progress percentage
  const progressPercentage = syncStatus.totalJobs > 0
    ? Math.round((syncStatus.processedJobs / syncStatus.totalJobs) * 100)
    : 0
  
  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }
  
  // Don't render anything during SSR
  if (!isClient) {
    return <div>Loading...</div>
  }
  
  // Render minimal dashboard
  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '20px' }}>Admin Dashboard</h1>
      
      {error && (
        <div style={{ 
          backgroundColor: '#FFEBEE', 
          color: '#B71C1C', 
          padding: '10px', 
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button 
          onClick={refreshData} 
          disabled={refreshing}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f0f0f0',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: refreshing ? 'not-allowed' : 'pointer'
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
        
        <button 
          onClick={startSync} 
          disabled={syncStatus.isRunning || loading}
          style={{
            padding: '8px 16px',
            backgroundColor: syncStatus.isRunning ? '#f0f0f0' : '#4CAF50',
            color: syncStatus.isRunning ? '#666' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: syncStatus.isRunning ? 'not-allowed' : 'pointer'
          }}
        >
          {syncStatus.isRunning ? 'Sync Running...' : 'Start Sync'}
        </button>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Database Status Card */}
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '8px', 
          padding: '16px',
          backgroundColor: 'white'
        }}>
          <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Database Status</h2>
          <div style={{ marginBottom: '8px' }}>
            <strong>Connection:</strong> 
            <span style={{ 
              color: dbStatus.connected ? 'green' : 'red',
              marginLeft: '8px'
            }}>
              {dbStatus.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Tables:</strong> {dbStatus.tables}
          </div>
          <div>
            <strong>Records:</strong> {dbStatus.records}
          </div>
        </div>
        
        {/* Sync Status Card */}
        <div style={{ 
          border: '1px solid #ddd', 
          borderRadius: '8px', 
          padding: '16px',
          backgroundColor: 'white'
        }}>
          <h2 style={{ fontSize: '18px', marginBottom: '12px' }}>Sync Status</h2>
          <div style={{ marginBottom: '8px' }}>
            <strong>Status:</strong> 
            <span style={{ 
              color: syncStatus.isRunning ? 'green' : 'blue',
              marginLeft: '8px'
            }}>
              {syncStatus.isRunning ? 'Running' : 'Idle'}
            </span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Progress:</strong> {syncStatus.processedJobs} / {syncStatus.totalJobs} jobs
          </div>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ 
              height: '20px', 
              backgroundColor: '#e0e0e0', 
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              <div style={{ 
                height: '100%', 
                width: `${progressPercentage}%`, 
                backgroundColor: '#4CAF50',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ textAlign: 'center', marginTop: '4px' }}>
              {progressPercentage}%
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Successful:</strong> {syncStatus.successfulJobs}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Failed:</strong> {syncStatus.failedJobs}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Started:</strong> {formatDate(syncStatus.startTime)}
          </div>
          <div>
            <strong>Completed:</strong> {formatDate(syncStatus.endTime)}
          </div>
        </div>
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        Last updated: {new Date().toLocaleString()}
      </div>
    </div>
  )
}
