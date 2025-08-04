"use client"

import React, { useState, useEffect } from 'react'

/**
 * UltraMinimalDashboard - Extremely simplified dashboard with zero hydration issues
 * 
 * This component uses only basic HTML elements and minimal React hooks
 * to ensure there are absolutely no hydration mismatches between server and client.
 * It has no external dependencies and uses only inline styles.
 */
export default function UltraMinimalDashboard() {
  // Client-side only rendering guard
  const [mounted, setMounted] = useState(false)
  
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
  
  // Polling interval reference for cleanup
  const statusIntervalRef = React.useRef(null)
  
  // Client-side only guard
  useEffect(() => {
    setMounted(true)
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
      }
    }
  }, [])
  
  // Load initial data
  useEffect(() => {
    if (!mounted) return
    
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
  }, [mounted])
  
  // Set up polling for sync status
  useEffect(() => {
    if (!mounted) return
    
    // Clear any existing interval
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current)
    }
    
    // Set up new interval
    statusIntervalRef.current = setInterval(() => {
      fetchSyncStatus()
      fetchDatabaseStatus()
    }, 4000) // Poll every 4 seconds
    
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current)
      }
    }
  }, [mounted])
  
  // Fetch database status
  const fetchDatabaseStatus = async () => {
    try {
      const response = await fetch('/api/admin/database-status')
      if (!response.ok) throw new Error(`HTTP error ${response.status}`)
      
      const data = await response.json()
      setDbStatus({
        connected: data.connected,
        tables: data.tables || 0,
        records: data.records || 0
      })
    } catch (err) {
      console.error("Database status error:", err)
      // Don't set global error to avoid blocking UI
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
  if (!mounted) {
    return null
  }
  
  // Render ultra-minimal dashboard
  return (
    <div style={{ 
      padding: '20px', 
      maxWidth: '1000px', 
      margin: '0 auto', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f9fafb'
    }}>
      <h1 style={{ 
        fontSize: '24px', 
        marginBottom: '20px',
        color: '#111827'
      }}>Admin Dashboard</h1>
      
      {error && (
        <div style={{ 
          backgroundColor: '#FEE2E2', 
          color: '#B91C1C', 
          padding: '12px', 
          borderRadius: '4px',
          marginBottom: '20px',
          border: '1px solid #F87171'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <button 
          onClick={refreshData} 
          disabled={refreshing}
          style={{
            padding: '8px 16px',
            backgroundColor: refreshing ? '#E5E7EB' : '#F3F4F6',
            border: '1px solid #D1D5DB',
            borderRadius: '4px',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            color: refreshing ? '#9CA3AF' : '#111827',
            fontWeight: '500'
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Data'}
        </button>
        
        <button 
          onClick={startSync} 
          disabled={syncStatus.isRunning || loading}
          style={{
            padding: '8px 16px',
            backgroundColor: syncStatus.isRunning ? '#E5E7EB' : '#10B981',
            color: syncStatus.isRunning ? '#9CA3AF' : 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: syncStatus.isRunning ? 'not-allowed' : 'pointer',
            fontWeight: '500'
          }}
        >
          {syncStatus.isRunning ? 'Sync Running...' : 'Start Sync'}
        </button>
      </div>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: '20px',
        marginBottom: '20px'
      }}>
        {/* Database Status Card */}
        <div style={{ 
          border: '1px solid #E5E7EB', 
          borderRadius: '8px', 
          padding: '16px',
          backgroundColor: 'white'
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            marginBottom: '12px',
            color: '#111827',
            fontWeight: '600'
          }}>Database Status</h2>
          
          <div style={{ marginBottom: '8px' }}>
            <strong>Connection:</strong> 
            <span style={{ 
              color: dbStatus.connected ? '#10B981' : '#EF4444',
              marginLeft: '8px',
              fontWeight: '500'
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
          border: '1px solid #E5E7EB', 
          borderRadius: '8px', 
          padding: '16px',
          backgroundColor: 'white'
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            marginBottom: '12px',
            color: '#111827',
            fontWeight: '600'
          }}>Sync Status</h2>
          
          <div style={{ marginBottom: '8px' }}>
            <strong>Status:</strong> 
            <span style={{ 
              color: syncStatus.isRunning ? '#10B981' : '#6B7280',
              marginLeft: '8px',
              fontWeight: '500'
            }}>
              {syncStatus.isRunning ? 'Running' : 'Idle'}
            </span>
          </div>
          
          <div style={{ marginBottom: '8px' }}>
            <strong>Progress:</strong> {syncStatus.processedJobs} / {syncStatus.totalJobs} jobs
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <div style={{ 
              height: '20px', 
              backgroundColor: '#E5E7EB', 
              borderRadius: '10px',
              overflow: 'hidden',
              marginTop: '8px'
            }}>
              <div style={{ 
                height: '100%', 
                width: `${progressPercentage}%`, 
                backgroundColor: '#10B981',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <div style={{ 
              textAlign: 'center', 
              marginTop: '4px',
              fontSize: '14px',
              color: '#6B7280'
            }}>
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
      
      <div style={{ 
        marginTop: '20px', 
        fontSize: '12px', 
        color: '#6B7280',
        textAlign: 'center'
      }}>
        Last updated: {new Date().toLocaleString()}
      </div>
    </div>
  )
}
