import { EventEmitter } from "events"
import { getDatabaseStatus, testDatabaseConnection, DatabaseStatus } from "./database-enhanced"
import { BLSSyncService, SyncProgress } from "./bls-sync-enhanced"
import { BLSService } from "./bls-service"

// ========== TYPES AND INTERFACES ==========

export interface HealthConfig {
  checkIntervalMs: number
  historySize: number
  errorThreshold: number
  warningThreshold: number
  criticalErrorThreshold: number
  recoveryAttempts: number
  recoveryDelayMs: number
  apiResponseTimeThresholdMs: number
}

export interface SystemHealth {
  timestamp: string
  overallScore: number
  status: HealthStatus
  components: {
    database: ComponentHealth
    apiKeys: ComponentHealth
    blsApi: ComponentHealth
    dataSync: ComponentHealth
  }
  alerts: HealthAlert[]
  metrics: HealthMetrics
  recommendations: string[]
}

export interface ComponentHealth {
  status: HealthStatus
  score: number
  message: string
  lastChecked: string
  details?: any
}

export interface HealthAlert {
  level: AlertLevel
  component: string
  message: string
  timestamp: string
  resolved: boolean
  resolvedAt?: string
}

export interface HealthMetrics {
  database: {
    responseTimeMs: number
    connectionFailures: number
    consecutiveFailures: number
    circuitBreakerOpen: boolean
    lastErrorTime?: string
  }
  apiKeys: {
    totalKeys: number
    activeKeys: number
    blockedKeys: number
    totalRemainingRequests: number
    usagePercentage: number
  }
  blsApi: {
    averageResponseTimeMs: number
    errorRate: number
    successfulRequests: number
    failedRequests: number
    lastErrorTime?: string
  }
  dataSync: {
    isRunning: boolean
    progress: number
    successRate: number
    errorRate: number
    lastSyncTime?: string
    estimatedTimeRemainingMs?: number
  }
  performance: {
    cpuUsage?: number
    memoryUsage?: number
    requestsPerMinute?: number
  }
}

export enum HealthStatus {
  HEALTHY = "healthy",
  DEGRADED = "degraded",
  WARNING = "warning",
  CRITICAL = "critical",
  UNKNOWN = "unknown"
}

export enum AlertLevel {
  INFO = "info",
  WARNING = "warning",
  ERROR = "error",
  CRITICAL = "critical"
}

export interface RecoveryAction {
  component: string
  action: string
  timestamp: string
  successful: boolean
  details?: any
}

export interface HealthCheckResult {
  component: string
  status: HealthStatus
  details?: any
}

// ========== CONFIGURATION ==========

export const defaultHealthConfig: HealthConfig = {
  checkIntervalMs: 60000, // 1 minute
  historySize: 100, // Keep last 100 health records
  errorThreshold: 3, // Number of errors before triggering recovery
  warningThreshold: 2, // Number of warnings before alert
  criticalErrorThreshold: 5, // Number of critical errors before escalation
  recoveryAttempts: 3, // Number of recovery attempts
  recoveryDelayMs: 5000, // 5 seconds between recovery attempts
  apiResponseTimeThresholdMs: 2000, // 2 seconds threshold for API response
}

// ========== HEALTH MONITOR CLASS ==========

export class HealthMonitor extends EventEmitter {
  private config: HealthConfig
  private checkInterval: NodeJS.Timeout | null = null
  private healthHistory: SystemHealth[] = []
  private alerts: HealthAlert[] = []
  private recoveryActions: RecoveryAction[] = []
  private blsService: BLSService | null = null
  private syncService: BLSSyncService | null = null
  private metrics: {
    blsRequests: { success: number; failure: number; responseTimes: number[] }
    syncErrors: number
    databaseErrors: number
    consecutiveErrors: { database: number; blsApi: number; apiKeys: number; dataSync: number }
  }

  constructor(config: Partial<HealthConfig> = {}) {
    super()
    this.config = { ...defaultHealthConfig, ...config }
    
    // Initialize metrics
    this.metrics = {
      blsRequests: { success: 0, failure: 0, responseTimes: [] },
      syncErrors: 0,
      databaseErrors: 0,
      consecutiveErrors: { database: 0, blsApi: 0, apiKeys: 0, dataSync: 0 }
    }
    
    console.log(`🏥 Health Monitor initialized with check interval: ${this.config.checkIntervalMs}ms`)
  }

  // ========== PUBLIC METHODS ==========

  /**
   * Start health monitoring
   */
  public start(): void {
    if (this.checkInterval) {
      this.stop()
    }

    this.checkInterval = setInterval(() => this.performHealthCheck(), this.config.checkIntervalMs)
    console.log("🚀 Health monitoring started")
    
    // Perform initial health check
    this.performHealthCheck()
  }

  /**
   * Stop health monitoring
   */
  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
      console.log("🛑 Health monitoring stopped")
    }
  }

  /**
   * Get current system health
   */
  public getCurrentHealth(): SystemHealth {
    return this.healthHistory.length > 0 
      ? this.healthHistory[this.healthHistory.length - 1] 
      : this.createDefaultHealth()
  }

  /**
   * Get health history
   */
  public getHealthHistory(): SystemHealth[] {
    return [...this.healthHistory]
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): HealthAlert[] {
    return this.alerts.filter(alert => !alert.resolved)
  }

  /**
   * Get recovery actions history
   */
  public getRecoveryActions(): RecoveryAction[] {
    return [...this.recoveryActions]
  }

  /**
   * Register BLS service for monitoring
   */
  public registerBLSService(service: BLSService): void {
    this.blsService = service
    console.log("📊 BLS Service registered for health monitoring")
  }

  /**
   * Register Sync service for monitoring
   */
  public registerSyncService(service: BLSSyncService): void {
    this.syncService = service
    
    // Listen for sync events
    service.on("progress", (progress: SyncProgress) => {
      this.updateSyncMetrics(progress)
    })
    
    service.on("jobError", (error: any) => {
      this.metrics.syncErrors++
      this.metrics.consecutiveErrors.dataSync++
      
      // Reset consecutive errors on success
      service.on("jobProcessed", () => {
        this.metrics.consecutiveErrors.dataSync = 0
      })
    })
    
    console.log("📊 Sync Service registered for health monitoring")
  }

  /**
   * Manually trigger a health check
   */
  public async checkHealth(): Promise<SystemHealth> {
    return await this.performHealthCheck()
  }

  /**
   * Record BLS API request result
   */
  public recordBLSApiRequest(success: boolean, responseTimeMs: number): void {
    if (success) {
      this.metrics.blsRequests.success++
      this.metrics.consecutiveErrors.blsApi = 0
      this.metrics.blsRequests.responseTimes.push(responseTimeMs)
      
      // Keep only the last 100 response times
      if (this.metrics.blsRequests.responseTimes.length > 100) {
        this.metrics.blsRequests.responseTimes.shift()
      }
    } else {
      this.metrics.blsRequests.failure++
      this.metrics.consecutiveErrors.blsApi++
      
      // Create alert if consecutive errors exceed threshold
      if (this.metrics.consecutiveErrors.blsApi >= this.config.errorThreshold) {
        this.createAlert(AlertLevel.ERROR, "blsApi", "Multiple consecutive BLS API failures")
      }
    }
  }

  /**
   * Record database error
   */
  public recordDatabaseError(error: any): void {
    this.metrics.databaseErrors++
    this.metrics.consecutiveErrors.database++
    
    // Create alert if consecutive errors exceed threshold
    if (this.metrics.consecutiveErrors.database >= this.config.errorThreshold) {
      this.createAlert(AlertLevel.ERROR, "database", "Multiple consecutive database failures")
      
      // Attempt recovery if threshold exceeded
      if (this.metrics.consecutiveErrors.database >= this.config.criticalErrorThreshold) {
        this.attemptDatabaseRecovery()
      }
    }
  }

  /**
   * Record database success
   */
  public recordDatabaseSuccess(): void {
    this.metrics.consecutiveErrors.database = 0
  }

  // ========== PRIVATE METHODS ==========

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(): Promise<SystemHealth> {
    try {
      // Check database health
      const dbHealth = await this.checkDatabaseHealth()
      
      // Check API keys health
      const apiKeysHealth = await this.checkApiKeysHealth()
      
      // Check BLS API health
      const blsApiHealth = this.checkBlsApiHealth()
      
      // Check data sync health
      const dataSyncHealth = this.checkDataSyncHealth()
      
      // Calculate overall health
      const componentScores = [
        dbHealth.score,
        apiKeysHealth.score,
        blsApiHealth.score,
        dataSyncHealth.score
      ]
      
      const overallScore = Math.round(
        componentScores.reduce((sum, score) => sum + score, 0) / componentScores.length
      )
      
      // Determine overall status
      let overallStatus = HealthStatus.HEALTHY
      if (overallScore < 50) {
        overallStatus = HealthStatus.CRITICAL
      } else if (overallScore < 70) {
        overallStatus = HealthStatus.WARNING
      } else if (overallScore < 90) {
        overallStatus = HealthStatus.DEGRADED
      }
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(
        dbHealth, 
        apiKeysHealth, 
        blsApiHealth, 
        dataSyncHealth
      )
      
      // Create health metrics
      const metrics = this.createHealthMetrics(
        dbHealth.details,
        apiKeysHealth.details,
        blsApiHealth.details,
        dataSyncHealth.details
      )
      
      // Create system health record
      const health: SystemHealth = {
        timestamp: new Date().toISOString(),
        overallScore,
        status: overallStatus,
        components: {
          database: dbHealth,
          apiKeys: apiKeysHealth,
          blsApi: blsApiHealth,
          dataSync: dataSyncHealth
        },
        alerts: this.getActiveAlerts(),
        metrics,
        recommendations
      }
      
      // Add to history
      this.healthHistory.push(health)
      
      // Keep history size within limits
      if (this.healthHistory.length > this.config.historySize) {
        this.healthHistory = this.healthHistory.slice(-this.config.historySize)
      }
      
      // Emit health update event
      this.emit("healthUpdate", health)
      
      // Trigger recovery actions if needed
      this.triggerRecoveryIfNeeded(health)
      
      return health
    } catch (error) {
      console.error("Health check failed:", error)
      
      // Create fallback health record
      const fallbackHealth = this.createDefaultHealth()
      fallbackHealth.status = HealthStatus.CRITICAL
      fallbackHealth.overallScore = 0
      fallbackHealth.alerts.push({
        level: AlertLevel.CRITICAL,
        component: "system",
        message: `Health check system failure: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: new Date().toISOString(),
        resolved: false
      })
      
      // Add to history
      this.healthHistory.push(fallbackHealth)
      
      // Emit error event
      this.emit("healthCheckError", error)
      
      return fallbackHealth
    }
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    try {
      const status = await getDatabaseStatus()
      
      let healthStatus = HealthStatus.HEALTHY
      let score = 100
      let message = "Database is healthy"
      
      // Determine health status based on database status
      if (!status.connected) {
        healthStatus = HealthStatus.CRITICAL
        score = 0
        message = status.lastError || "Database connection failed"
        
        // Record database error
        this.recordDatabaseError(status.lastError)
      } else if (status.circuitBreakerOpen) {
        healthStatus = HealthStatus.WARNING
        score = 40
        message = "Circuit breaker is open"
      } else if (status.consecutiveFailures && status.consecutiveFailures > 0) {
        healthStatus = HealthStatus.DEGRADED
        score = 70
        message = `Database has ${status.consecutiveFailures} consecutive failures`
      } else if (status.responseTime && status.responseTime > 1000) {
        healthStatus = HealthStatus.DEGRADED
        score = 80
        message = `Database response time is high: ${status.responseTime}ms`
      } else {
        // Record database success
        this.recordDatabaseSuccess()
      }
      
      return {
        status: healthStatus,
        score,
        message,
        lastChecked: new Date().toISOString(),
        details: status
      }
    } catch (error) {
      console.error("Database health check failed:", error)
      
      // Record database error
      this.recordDatabaseError(error)
      
      return {
        status: HealthStatus.CRITICAL,
        score: 0,
        message: `Database health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        lastChecked: new Date().toISOString(),
        details: { error }
      }
    }
  }

  /**
   * Check API keys health
   */
  private async checkApiKeysHealth(): Promise<ComponentHealth> {
    try {
      if (!this.blsService) {
        return {
          status: HealthStatus.UNKNOWN,
          score: 50,
          message: "BLS Service not registered for monitoring",
          lastChecked: new Date().toISOString()
        }
      }
      
      const keyStatuses = this.blsService.getAllKeyStatuses()
      const totalKeys = keyStatuses.length
      const blockedKeys = keyStatuses.filter(key => key.isBlocked).length
      const activeKeys = totalKeys - blockedKeys
      const totalRemainingRequests = this.blsService.getTotalRemainingRequests()
      
      let healthStatus = HealthStatus.HEALTHY
      let score = 100
      let message = `${activeKeys}/${totalKeys} API keys active`
      
      // Determine health status based on API key status
      if (activeKeys === 0) {
        healthStatus = HealthStatus.CRITICAL
        score = 0
        message = "All API keys are blocked"
        
        // Increment consecutive errors
        this.metrics.consecutiveErrors.apiKeys++
        
        // Create alert
        this.createAlert(AlertLevel.CRITICAL, "apiKeys", "All API keys are blocked")
      } else if (blockedKeys > 0) {
        healthStatus = HealthStatus.DEGRADED
        score = Math.max(30, 100 - (blockedKeys / totalKeys) * 100)
        message = `${blockedKeys}/${totalKeys} API keys are blocked`
        
        // Create alert
        this.createAlert(AlertLevel.WARNING, "apiKeys", `${blockedKeys}/${totalKeys} API keys are blocked`)
      } else if (totalRemainingRequests < 100) {
        healthStatus = HealthStatus.WARNING
        score = 60
        message = `Low API requests remaining: ${totalRemainingRequests}`
        
        // Create alert
        this.createAlert(AlertLevel.WARNING, "apiKeys", `Low API requests remaining: ${totalRemainingRequests}`)
      } else {
        // Reset consecutive errors
        this.metrics.consecutiveErrors.apiKeys = 0
      }
      
      return {
        status: healthStatus,
        score,
        message,
        lastChecked: new Date().toISOString(),
        details: {
          totalKeys,
          activeKeys,
          blockedKeys,
          totalRemainingRequests,
          keyStatuses
        }
      }
    } catch (error) {
      console.error("API keys health check failed:", error)
      
      return {
        status: HealthStatus.CRITICAL,
        score: 0,
        message: `API keys health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        lastChecked: new Date().toISOString(),
        details: { error }
      }
    }
  }

  /**
   * Check BLS API health
   */
  private checkBlsApiHealth(): ComponentHealth {
    try {
      const { success, failure, responseTimes } = this.metrics.blsRequests
      const totalRequests = success + failure
      
      if (totalRequests === 0) {
        return {
          status: HealthStatus.UNKNOWN,
          score: 50,
          message: "No BLS API requests recorded",
          lastChecked: new Date().toISOString(),
          details: { totalRequests: 0 }
        }
      }
      
      const errorRate = totalRequests > 0 ? (failure / totalRequests) * 100 : 0
      const averageResponseTime = responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : 0
      
      let healthStatus = HealthStatus.HEALTHY
      let score = 100
      let message = "BLS API is healthy"
      
      // Determine health status based on error rate and response time
      if (errorRate > 20) {
        healthStatus = HealthStatus.CRITICAL
        score = Math.max(0, 100 - errorRate)
        message = `High BLS API error rate: ${errorRate.toFixed(1)}%`
        
        // Create alert
        this.createAlert(AlertLevel.ERROR, "blsApi", `High BLS API error rate: ${errorRate.toFixed(1)}%`)
      } else if (errorRate > 5) {
        healthStatus = HealthStatus.WARNING
        score = Math.max(50, 100 - errorRate * 2)
        message = `Elevated BLS API error rate: ${errorRate.toFixed(1)}%`
        
        // Create alert
        this.createAlert(AlertLevel.WARNING, "blsApi", `Elevated BLS API error rate: ${errorRate.toFixed(1)}%`)
      } else if (averageResponseTime > this.config.apiResponseTimeThresholdMs) {
        healthStatus = HealthStatus.DEGRADED
        score = Math.max(60, 100 - (averageResponseTime / this.config.apiResponseTimeThresholdMs) * 20)
        message = `Slow BLS API response time: ${averageResponseTime.toFixed(0)}ms`
      }
      
      return {
        status: healthStatus,
        score,
        message,
        lastChecked: new Date().toISOString(),
        details: {
          totalRequests,
          successfulRequests: success,
          failedRequests: failure,
          errorRate,
          averageResponseTime
        }
      }
    } catch (error) {
      console.error("BLS API health check failed:", error)
      
      return {
        status: HealthStatus.CRITICAL,
        score: 0,
        message: `BLS API health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        lastChecked: new Date().toISOString(),
        details: { error }
      }
    }
  }

  /**
   * Check data sync health
   */
  private checkDataSyncHealth(): ComponentHealth {
    try {
      if (!this.syncService) {
        return {
          status: HealthStatus.UNKNOWN,
          score: 50,
          message: "Sync Service not registered for monitoring",
          lastChecked: new Date().toISOString()
        }
      }
      
      const syncProgress = this.syncService.getSyncProgress()
      const isRunning = syncProgress.isRunning
      const totalJobs = syncProgress.totalJobs
      const processedJobs = syncProgress.processedJobs
      const successfulJobs = syncProgress.successfulJobs
      const failedJobs = syncProgress.failedJobs
      
      const progress = totalJobs > 0 ? (processedJobs / totalJobs) * 100 : 0
      const successRate = processedJobs > 0 ? (successfulJobs / processedJobs) * 100 : 100
      const errorRate = processedJobs > 0 ? (failedJobs / processedJobs) * 100 : 0
      
      let healthStatus = HealthStatus.HEALTHY
      let score = 100
      let message = isRunning 
        ? `Sync in progress: ${progress.toFixed(1)}% complete` 
        : "Sync is not running"
      
      // Determine health status based on sync progress
      if (isRunning && errorRate > 20) {
        healthStatus = HealthStatus.CRITICAL
        score = Math.max(0, 100 - errorRate)
        message = `High sync error rate: ${errorRate.toFixed(1)}%`
        
        // Create alert
        this.createAlert(AlertLevel.ERROR, "dataSync", `High sync error rate: ${errorRate.toFixed(1)}%`)
      } else if (isRunning && errorRate > 5) {
        healthStatus = HealthStatus.WARNING
        score = Math.max(50, 100 - errorRate * 2)
        message = `Elevated sync error rate: ${errorRate.toFixed(1)}%`
        
        // Create alert
        this.createAlert(AlertLevel.WARNING, "dataSync", `Elevated sync error rate: ${errorRate.toFixed(1)}%`)
      } else if (syncProgress.lastError) {
        healthStatus = HealthStatus.DEGRADED
        score = 70
        message = `Sync encountered errors: ${syncProgress.lastError}`
      }
      
      return {
        status: healthStatus,
        score,
        message,
        lastChecked: new Date().toISOString(),
        details: {
          isRunning,
          totalJobs,
          processedJobs,
          successfulJobs,
          failedJobs,
          progress,
          successRate,
          errorRate,
          lastError: syncProgress.lastError,
          lastErrorTime: syncProgress.lastErrorTime,
          estimatedTimeRemaining: syncProgress.estimatedTimeRemaining
        }
      }
    } catch (error) {
      console.error("Data sync health check failed:", error)
      
      return {
        status: HealthStatus.CRITICAL,
        score: 0,
        message: `Data sync health check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        lastChecked: new Date().toISOString(),
        details: { error }
      }
    }
  }

  /**
   * Create default health record
   */
  private createDefaultHealth(): SystemHealth {
    return {
      timestamp: new Date().toISOString(),
      overallScore: 50,
      status: HealthStatus.UNKNOWN,
      components: {
        database: {
          status: HealthStatus.UNKNOWN,
          score: 50,
          message: "Database health unknown",
          lastChecked: new Date().toISOString()
        },
        apiKeys: {
          status: HealthStatus.UNKNOWN,
          score: 50,
          message: "API keys health unknown",
          lastChecked: new Date().toISOString()
        },
        blsApi: {
          status: HealthStatus.UNKNOWN,
          score: 50,
          message: "BLS API health unknown",
          lastChecked: new Date().toISOString()
        },
        dataSync: {
          status: HealthStatus.UNKNOWN,
          score: 50,
          message: "Data sync health unknown",
          lastChecked: new Date().toISOString()
        }
      },
      alerts: [],
      metrics: this.createDefaultMetrics(),
      recommendations: ["Initialize health monitoring to get accurate health status"]
    }
  }

  /**
   * Create default metrics
   */
  private createDefaultMetrics(): HealthMetrics {
    return {
      database: {
        responseTimeMs: 0,
        connectionFailures: 0,
        consecutiveFailures: 0,
        circuitBreakerOpen: false
      },
      apiKeys: {
        totalKeys: 0,
        activeKeys: 0,
        blockedKeys: 0,
        totalRemainingRequests: 0,
        usagePercentage: 0
      },
      blsApi: {
        averageResponseTimeMs: 0,
        errorRate: 0,
        successfulRequests: 0,
        failedRequests: 0
      },
      dataSync: {
        isRunning: false,
        progress: 0,
        successRate: 0,
        errorRate: 0
      },
      performance: {}
    }
  }

  /**
   * Create health metrics from component details
   */
  private createHealthMetrics(
    dbDetails: any,
    apiKeysDetails: any,
    blsApiDetails: any,
    dataSyncDetails: any
  ): HealthMetrics {
    return {
      database: {
        responseTimeMs: dbDetails?.responseTime || 0,
        connectionFailures: this.metrics.databaseErrors,
        consecutiveFailures: dbDetails?.consecutiveFailures || 0,
        circuitBreakerOpen: dbDetails?.circuitBreakerOpen || false,
        lastErrorTime: dbDetails?.lastErrorTime
      },
      apiKeys: {
        totalKeys: apiKeysDetails?.totalKeys || 0,
        activeKeys: apiKeysDetails?.activeKeys || 0,
        blockedKeys: apiKeysDetails?.blockedKeys || 0,
        totalRemainingRequests: apiKeysDetails?.totalRemainingRequests || 0,
        usagePercentage: apiKeysDetails?.totalKeys > 0
          ? 100 - ((apiKeysDetails.totalRemainingRequests / (apiKeysDetails.totalKeys * 500)) * 100)
          : 0
      },
      blsApi: {
        averageResponseTimeMs: blsApiDetails?.averageResponseTime || 0,
        errorRate: blsApiDetails?.errorRate || 0,
        successfulRequests: blsApiDetails?.successfulRequests || 0,
        failedRequests: blsApiDetails?.failedRequests || 0,
        lastErrorTime: blsApiDetails?.lastErrorTime
      },
      dataSync: {
        isRunning: dataSyncDetails?.isRunning || false,
        progress: dataSyncDetails?.progress || 0,
        successRate: dataSyncDetails?.successRate || 0,
        errorRate: dataSyncDetails?.errorRate || 0,
        lastSyncTime: dataSyncDetails?.lastUpdated,
        estimatedTimeRemainingMs: dataSyncDetails?.estimatedTimeRemaining
          ? dataSyncDetails.estimatedTimeRemaining * 1000
          : undefined
      },
      performance: this.getSystemPerformance()
    }
  }

  /**
   * Get system performance metrics
   */
  private getSystemPerformance(): { cpuUsage?: number; memoryUsage?: number; requestsPerMinute?: number } {
    try {
      // In Node.js, we can get memory usage
      const memUsage = process.memoryUsage()
      const memoryUsage = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      
      // CPU usage would require additional modules or external monitoring
      
      return {
        memoryUsage
      }
    } catch (error) {
      console.error("Failed to get system performance:", error)
      return {}
    }
  }

  /**
   * Generate recommendations based on component health
   */
  private generateRecommendations(
    dbHealth: ComponentHealth,
    apiKeysHealth: ComponentHealth,
    blsApiHealth: ComponentHealth,
    dataSyncHealth: ComponentHealth
  ): string[] {
    const recommendations: string[] = []
    
    // Database recommendations
    if (dbHealth.status === HealthStatus.CRITICAL) {
      recommendations.push("Check database connection configuration and ensure database is running")
    } else if (dbHealth.status === HealthStatus.WARNING) {
      recommendations.push("Monitor database performance and consider scaling if response times remain high")
    }
    
    // API keys recommendations
    if (apiKeysHealth.status === HealthStatus.CRITICAL) {
      recommendations.push("Add additional BLS API keys or wait for current keys to reset")
    } else if (apiKeysHealth.status === HealthStatus.WARNING || apiKeysHealth.status === HealthStatus.DEGRADED) {
      recommendations.push("Consider adding more BLS API keys to distribute load")
    }
    
    // BLS API recommendations
    if (blsApiHealth.status === HealthStatus.CRITICAL || blsApiHealth.status === HealthStatus.WARNING) {
      recommendations.push("Check BLS API service status and review error patterns")
    }
    
    // Data sync recommendations
    if (dataSyncHealth.status === HealthStatus.CRITICAL) {
      recommendations.push("Review sync errors and consider restarting sync process")
    } else if (dataSyncHealth.status === HealthStatus.WARNING) {
      recommendations.push("Monitor sync process for increasing error rates")
    }
    
    // General recommendations
    if (recommendations.length === 0) {
      recommendations.push("System is healthy, no actions required")
    }
    
    return recommendations
  }

  /**
   * Create health alert
   */
  private createAlert(level: AlertLevel, component: string, message: string): void {
    // Check if similar alert already exists
    const existingAlert = this.alerts.find(alert => 
      !alert.resolved && 
      alert.component === component && 
      alert.message === message
    )
    
    if (existingAlert) {
      return
    }
    
    const alert: HealthAlert = {
      level,
      component,
      message,
      timestamp: new Date().toISOString(),
      resolved: false
    }
    
    this.alerts.push(alert)
    
    // Keep only the last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100)
    }
    
    // Emit alert event
    this.emit("alert", alert)
    
    console.log(`🚨 Health alert: [${level}] ${component} - ${message}`)
  }

  /**
   * Resolve alert
   */
  private resolveAlert(component: string, message: string): void {
    const alert = this.alerts.find(alert => 
      !alert.resolved && 
      alert.component === component && 
      alert.message === message
    )
    
    if (alert) {
      alert.resolved = true
      alert.resolvedAt = new Date().toISOString()
      
      // Emit alert resolved event
      this.emit("alertResolved", alert)
      
      console.log(`✅ Health alert resolved: ${component} - ${message}`)
    }
  }

  /**
   * Trigger recovery actions if needed
   */
  private triggerRecoveryIfNeeded(health: SystemHealth): void {
    // Database recovery
    if (
      health.components.database.status === HealthStatus.CRITICAL &&
      this.metrics.consecutiveErrors.database >= this.config.errorThreshold
    ) {
      this.attemptDatabaseRecovery()
    }
    
    // API keys recovery
    if (
      health.components.apiKeys.status === HealthStatus.CRITICAL &&
      this.metrics.consecutiveErrors.apiKeys >= this.config.errorThreshold
    ) {
      this.attemptApiKeysRecovery()
    }
    
    // Data sync recovery
    if (
      health.components.dataSync.status === HealthStatus.CRITICAL &&
      health.components.dataSync.details?.isRunning &&
      health.components.dataSync.details?.errorRate > 20
    ) {
      this.attemptSyncRecovery()
    }
  }

  /**
   * Attempt database recovery
   */
  private async attemptDatabaseRecovery(): Promise<void> {
    console.log("🔄 Attempting database recovery")
    
    // Record recovery action
    const recoveryAction: RecoveryAction = {
      component: "database",
      action: "connection_reset",
      timestamp: new Date().toISOString(),
      successful: false
    }
    
    try {
      // Attempt to reconnect to database
      for (let attempt = 1; attempt <= this.config.recoveryAttempts; attempt++) {
        console.log(`Database recovery attempt ${attempt}/${this.config.recoveryAttempts}`)
        
        const result = await testDatabaseConnection()
        
        if (result.success) {
          console.log("✅ Database recovery successful")
          
          // Update recovery action
          recoveryAction.successful = true
          recoveryAction.details = { attempt, responseTime: result.responseTime }
          
          // Reset consecutive errors
          this.metrics.consecutiveErrors.database = 0
          
          // Resolve related alerts
          this.resolveAlert("database", "Multiple consecutive database failures")
          
          break
        }
        
        // Wait before next attempt
        if (attempt < this.config.recoveryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.config.recoveryDelayMs))
        }
      }
    } catch (error) {
      console.error("Database recovery failed:", error)
      recoveryAction.details = { error: error instanceof Error ? error.message : "Unknown error" }
    }
    
    // Record recovery action
    this.recoveryActions.push(recoveryAction)
    
    // Emit recovery event
    this.emit("recovery", recoveryAction)
  }

  /**
   * Attempt API keys recovery
   */
  private attemptApiKeysRecovery(): void {
    if (!this.blsService) {
      console.error("Cannot attempt API keys recovery: BLS Service not registered")
      return
    }
    
    console.log("🔄 Attempting API keys recovery")
    
    // Record recovery action
    const recoveryAction: RecoveryAction = {
      component: "apiKeys",
      action: "key_rotation",
      timestamp: new Date().toISOString(),
      successful: false
    }
    
    try {
      // Get key statuses
      const keyStatuses = this.blsService.getAllKeyStatuses()
      
      // Check if any keys are not blocked
      const activeKeys = keyStatuses.filter(key => !key.isBlocked)
      
      if (activeKeys.length > 0) {
        // If there are active keys, consider recovery successful
        recoveryAction.successful = true
        recoveryAction.details = { 
          activeKeysFound: activeKeys.length,
          totalKeys: keyStatuses.length
        }
        
        // Reset consecutive errors
        this.metrics.consecutiveErrors.apiKeys = 0
        
        // Resolve related alerts
        this.resolveAlert("apiKeys", "All API keys are blocked")
      } else {
        recoveryAction.details = { 
          message: "No active keys available", 
          totalKeys: keyStatuses.length 
        }
      }
    } catch (error) {
      console.error("API keys recovery failed:", error)
      recoveryAction.details = { error: error instanceof Error ? error.message : "Unknown error" }
    }
    
    // Record recovery action
    this.recoveryActions.push(recoveryAction)
    
    // Emit recovery event
    this.emit("recovery", recoveryAction)
  }

  /**
   * Attempt sync recovery
   */
  private async attemptSyncRecovery(): Promise<void> {
    if (!this.syncService) {
      console.error("Cannot attempt sync recovery: Sync Service not registered")
      return
    }
    
    console.log("🔄 Attempting sync recovery")
    
    // Record recovery action
    const recoveryAction: RecoveryAction = {
      component: "dataSync",
      action: "restart_sync",
      timestamp: new Date().toISOString(),
      successful: false
    }
    
    try {
      // Stop current sync
      await this.syncService.stopSync()
      
      // Wait before restarting
      await new Promise(resolve => setTimeout(resolve, this.config.recoveryDelayMs))
      
      // Restart sync
      const result = await this.syncService.startSync(true) // Force restart
      
      recoveryAction.successful = result.success
      recoveryAction.details = { 
        message: result.message,
        stats: result.stats
      }
      
      if (result.success) {
        // Reset consecutive errors
        this.metrics.consecutiveErrors.dataSync = 0
        
        // Resolve related alerts
        this.resolveAlert("dataSync", "High sync error rate")
      }
    } catch (error) {
      console.error("Sync recovery failed:", error)
      recoveryAction.details = { error: error instanceof Error ? error.message : "Unknown error" }
    }
    
    // Record recovery action
    this.recoveryActions.push(recoveryAction)
    
    // Emit recovery event
    this.emit("recovery", recoveryAction)
  }

  /**
   * Update sync metrics based on sync progress
   */
  private updateSyncMetrics(progress: SyncProgress): void {
    // Reset consecutive errors if sync is running successfully
    if (progress.isRunning && progress.processedJobs > 0 && progress.failedJobs === 0) {
      this.metrics.consecutiveErrors.dataSync = 0
    }
  }
}

// ========== SINGLETON INSTANCE ==========

let healthMonitorInstance: HealthMonitor | null = null

/**
 * Get or create health monitor instance
 */
export function getHealthMonitor(config?: Partial<HealthConfig>): HealthMonitor {
  if (!healthMonitorInstance) {
    healthMonitorInstance = new HealthMonitor(config)
  }
  return healthMonitorInstance
}

/**
 * Create a new health monitor instance (for testing)
 */
export function createHealthMonitor(config?: Partial<HealthConfig>): HealthMonitor {
  return new HealthMonitor(config)
}
