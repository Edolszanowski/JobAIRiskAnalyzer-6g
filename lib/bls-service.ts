interface BLSApiResponse {
  status: string
  responseTime: number
  message: string[]
  Results: {
    series: Array<{
      seriesID: string
      data: Array<{
        year: string
        period: string
        periodName: string
        value: string
        footnotes: Array<{ code: string; text: string }>
      }>
    }>
  }
}

interface JobData {
  code: string
  title: string
  employment: number
  projectedEmployment: number
  medianWage: number
}

interface APIKeyStatus {
  key: string
  requestsUsed: number
  lastResetDate: string
  isBlocked: boolean
  blockUntil?: Date
}

// Network error tracking for circuit breaker pattern
interface NetworkErrorTracker {
  consecutiveErrors: number
  lastErrorTime: Date | null
  isCircuitOpen: boolean
  resetTime: Date | null
}

export class BLSService {
  private apiKeys: string[]
  private baseUrl = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
  private dailyLimit = 500
  private keyStatuses: Map<string, APIKeyStatus>
  private currentKeyIndex = 0
  private validationInProgress = false
  private validationQueue: string[] = []
  
  // When running inside serverless/edge runtimes we may not have reliable
  // outbound connectivity during cold-starts which can cause the initial
  // API-key validation to fail.  Instead of blocking the entire sync we
  // allow a “best effort” mode that skips upfront validation and lets the
  // normal request-time error handling manage invalid keys.
  private validationDisabled = false

  // Circuit breaker settings
  private networkErrorTracker: NetworkErrorTracker = {
    consecutiveErrors: 0,
    lastErrorTime: null,
    isCircuitOpen: false,
    resetTime: null
  }
  private circuitBreakerThreshold = 5 // Number of consecutive errors before opening circuit
  private circuitResetTimeMs = 60000 // 1 minute timeout before trying again
  
  // Fetch configuration
  private defaultTimeout = 30000 // 30 seconds
  private maxRetries = 5
  private initialBackoffMs = 1000
  private maxBackoffMs = 30000

  /**
   * Detect common serverless / edge runtime environment variables.
   * This mirrors the helper used in bls-sync-enhanced.ts so that both
   * layers share the exact same behaviour.
   */
  private isServerlessRuntime(): boolean {
    if (process.env.VERCEL === "1") return true
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true
    if (process.env.NEXT_RUNTIME === "edge") return true
    return false
  }

  constructor(apiKeys: string | string[]) {
    // Support both single key and array of keys
    const initialKeys = Array.isArray(apiKeys) ? apiKeys : [apiKeys]
    
    // Filter out empty keys
    this.apiKeys = initialKeys.filter(key => key && key.trim().length > 0)
    this.keyStatuses = new Map()

    // Initialize status for each API key
    this.apiKeys.forEach((key) => {
      this.keyStatuses.set(key, {
        key,
        requestsUsed: 0,
        lastResetDate: new Date().toDateString(),
        isBlocked: false,
      })
    })

    console.log(`🔑 BLS Service initialized with ${this.apiKeys.length} API key(s)`)
    
    // Decide if upfront validation should be disabled
    this.validationDisabled = this.isServerlessRuntime()
    if (this.validationDisabled) {
      console.log("⚠️  API key validation skipped (serverless runtime detected)")
    } else {
      // Start async validation of keys
      this.validateAllApiKeys()
    }
  }

  /**
   * Validates all API keys and removes invalid ones
   * This runs asynchronously to avoid blocking initialization
   */
  private async validateAllApiKeys(): Promise<void> {
    // Skip validation entirely if disabled or network circuit is open
    if (this.validationDisabled || this.networkErrorTracker.isCircuitOpen) {
      console.log("⚠️  Skipping API key validation due to disabled mode or open circuit breaker")
      return
    }

    if (this.validationInProgress) return
    
    this.validationInProgress = true
    console.log(`🔍 Starting validation of ${this.apiKeys.length} BLS API keys...`)
    
    const validKeys: string[] = []
    const invalidKeys: string[] = []
    
    // Test each key
    for (const key of this.apiKeys) {
      try {
        const isValid = await this.validateApiKey(key)
        if (isValid) {
          validKeys.push(key)
          console.log(`✅ API key validated: ${key.substring(0, 4)}...`)
        } else {
          invalidKeys.push(key)
          console.log(`❌ Invalid API key detected: ${key.substring(0, 4)}...`)
        }
      } catch (error) {
        invalidKeys.push(key)
        console.error(`❌ Error validating API key ${key.substring(0, 4)}...`, error)
      }
    }
    
    // Remove invalid keys
    for (const key of invalidKeys) {
      this.removeApiKey(key)
    }
    
    this.validationInProgress = false
    console.log(`🔑 API key validation complete. ${validKeys.length} valid, ${invalidKeys.length} invalid.`)
    
    // Process any keys that were queued during validation
    while (this.validationQueue.length > 0) {
      const key = this.validationQueue.shift()
      if (key) this.addApiKey(key)
    }
  }
  
  /**
   * Validates a single API key by making a test request
   * @param key API key to validate
   * @returns Promise resolving to true if valid, false otherwise
   */
  private async validateApiKey(key: string): Promise<boolean> {
    try {
      // Use a simple test series that should always exist
      const testSeriesId = 'CEU0000000001' // Total nonfarm employment
      
      const response = await this.fetchWithTimeout(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connection": "keep-alive",
          "Keep-Alive": "timeout=10, max=5"
        },
        body: JSON.stringify({
          seriesid: [testSeriesId],
          startyear: "2023",
          endyear: "2023",
          registrationkey: key,
        }),
        // Even shorter timeout for validation to avoid blocking cold-starts
        timeout: 2000
      })
      
      if (!response.ok) {
        return false
      }
      
      const data: BLSApiResponse = await response.json()
      
      // Check if the request was successful
      if (data.status !== "REQUEST_SUCCEEDED") {
        // Check for specific error messages indicating invalid key
        if (data.message.some(msg => 
          msg.includes("invalid") || 
          msg.includes("Invalid key") || 
          msg.includes("provided by the User is invalid")
        )) {
          return false
        }
      }
      
      return data.status === "REQUEST_SUCCEEDED"
    } catch (error) {
      console.error(`Error validating API key: ${error instanceof Error ? error.message : String(error)}`)
      // Don't mark as invalid on network errors - could be temporary
      return true // Treat as potentially valid, will be tested at request time
    }
  }

  /**
   * Utility method to fetch with timeout and proper error handling
   * @param url The URL to fetch from
   * @param options Fetch options
   * @param timeout Timeout in milliseconds
   * @returns Promise resolving to Response
   */
  private async fetchWithTimeout(
    url: string, 
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    const { timeout = this.defaultTimeout, ...fetchOptions } = options
    
    // Add connection pooling headers if not present
    if (!fetchOptions.headers) {
      fetchOptions.headers = {}
    }
    
    const headers = fetchOptions.headers as Record<string, string>
    if (!headers["Connection"]) {
      headers["Connection"] = "keep-alive"
    }
    if (!headers["Keep-Alive"]) {
      headers["Keep-Alive"] = "timeout=10, max=5"
    }
    
    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      })
      return response
    } catch (error) {
      // Check if it's a timeout error
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`)
      }
      
      // Check if it's a network error
      if (error instanceof Error && 
         (error.message.includes('ECONNRESET') || 
          error.message.includes('network') ||
          error.message.includes('fetch failed'))) {
        throw new Error(`Network error: ${error.message}`)
      }
      
      // Rethrow other errors
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private resetDailyCountsIfNeeded(): void {
    const currentDate = new Date().toDateString()

    this.keyStatuses.forEach((status, key) => {
      if (status.lastResetDate !== currentDate) {
        status.requestsUsed = 0
        status.lastResetDate = currentDate
        status.isBlocked = false
        status.blockUntil = undefined
        console.log(`🔄 Reset daily count for API key: ${key.substring(0, 8)}...`)
      }
    })
  }

  private getNextAvailableKey(): string | null {
    this.resetDailyCountsIfNeeded()

    // First, try to find a key that's not at the limit
    for (let i = 0; i < this.apiKeys.length; i++) {
      const keyIndex = (this.currentKeyIndex + i) % this.apiKeys.length
      const key = this.apiKeys[keyIndex]
      const status = this.keyStatuses.get(key)!

      if (!status.isBlocked && status.requestsUsed < this.dailyLimit) {
        this.currentKeyIndex = keyIndex
        return key
      }
    }

    // If all keys are at limit, check if any blocks have expired
    const now = new Date()
    for (let i = 0; i < this.apiKeys.length; i++) {
      const key = this.apiKeys[i]
      const status = this.keyStatuses.get(key)!

      if (status.isBlocked && status.blockUntil && now > status.blockUntil) {
        status.isBlocked = false
        status.blockUntil = undefined
        console.log(`🔓 Unblocked API key: ${key.substring(0, 8)}...`)
        return key
      }
    }

    return null
  }

  private markKeyAsBlocked(key: string, blockDurationMinutes = 60): void {
    const status = this.keyStatuses.get(key)
    if (status) {
      status.isBlocked = true
      status.blockUntil = new Date(Date.now() + blockDurationMinutes * 60 * 1000)
      console.log(`🚫 Blocked API key ${key.substring(0, 8)}... for ${blockDurationMinutes} minutes`)
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Check circuit breaker status and handle accordingly
   * @returns True if circuit is closed (requests allowed), false if open
   */
  private checkCircuitBreaker(): boolean {
    const now = new Date()
    
    // If circuit is open, check if it's time to try again
    if (this.networkErrorTracker.isCircuitOpen) {
      if (this.networkErrorTracker.resetTime && now > this.networkErrorTracker.resetTime) {
        // Reset circuit breaker for a test request
        console.log('🔌 Circuit half-open, allowing test request...')
        return true
      }
      console.log('🚫 Circuit breaker open, blocking request')
      return false
    }
    
    return true
  }
  
  /**
   * Record a network error for circuit breaker tracking
   */
  private recordNetworkError(): void {
    const now = new Date()
    this.networkErrorTracker.consecutiveErrors++
    this.networkErrorTracker.lastErrorTime = now
    
    // Check if we need to open the circuit
    if (this.networkErrorTracker.consecutiveErrors >= this.circuitBreakerThreshold) {
      this.networkErrorTracker.isCircuitOpen = true
      this.networkErrorTracker.resetTime = new Date(now.getTime() + this.circuitResetTimeMs)
      console.log(`🔌 Circuit breaker opened after ${this.networkErrorTracker.consecutiveErrors} consecutive errors. Will reset at ${this.networkErrorTracker.resetTime}`)
    }
  }
  
  /**
   * Record a successful request to reset circuit breaker
   */
  private recordSuccess(): void {
    // Reset error counter on success
    if (this.networkErrorTracker.consecutiveErrors > 0) {
      this.networkErrorTracker.consecutiveErrors = 0
      console.log('✅ Network success, reset error counter')
    }
    
    // If circuit was half-open, close it fully
    if (this.networkErrorTracker.isCircuitOpen) {
      this.networkErrorTracker.isCircuitOpen = false
      this.networkErrorTracker.resetTime = null
      console.log('🔌 Circuit breaker closed after successful request')
    }
  }

  /**
   * Calculate backoff time with exponential strategy
   * @param retryCount Current retry attempt
   * @returns Time to wait in milliseconds
   */
  private getBackoffTime(retryCount: number): number {
    // Exponential backoff with jitter: 2^retry * base * (0.5-1.5 random factor)
    const exponentialTime = Math.min(
      this.maxBackoffMs,
      this.initialBackoffMs * Math.pow(2, retryCount) * (0.5 + Math.random())
    )
    return exponentialTime
  }

  /**
   * Fetch employment data from BLS API with enhanced error handling and retries
   * @param seriesId BLS series ID to fetch
   * @param retryCount Current retry attempt
   * @returns Promise resolving to series data
   */
  async fetchEmploymentData(seriesId: string, retryCount = 0): Promise<any> {
    // Check circuit breaker first
    if (!this.checkCircuitBreaker() && retryCount > 0) {
      throw new Error('Network requests temporarily disabled due to persistent connection failures')
    }
    
    const availableKey = this.getNextAvailableKey()

    if (!availableKey) {
      const nextResetTime = this.getTimeUntilNextReset()
      throw new Error(
        `All API keys have reached their daily limit. Next reset in ${Math.round(nextResetTime / 1000 / 60 / 60)} hours.`,
      )
    }

    const status = this.keyStatuses.get(availableKey)!

    try {
      console.log(
        `📡 Making request with key ${availableKey.substring(0, 8)}... (${status.requestsUsed}/${this.dailyLimit} used)`,
      )

      // Use enhanced fetch with timeout
      const response = await this.fetchWithTimeout(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connection": "keep-alive",
          "Keep-Alive": "timeout=10, max=5",
          "User-Agent": "JobAIRiskAnalyzer/1.0"
        },
        body: JSON.stringify({
          seriesid: [seriesId],
          startyear: "2020",
          endyear: "2024",
          registrationkey: availableKey,
        }),
        timeout: this.defaultTimeout
      })

      status.requestsUsed++

      if (!response.ok) {
        if (response.status === 429 || response.status === 403) {
          // Rate limited or forbidden - mark key as blocked
          this.markKeyAsBlocked(availableKey, 60)

          if (retryCount < this.maxRetries) {
            console.log(`⏳ Rate limited, retrying with different key...`)
            await this.delay(2000) // Wait 2 seconds before retry
            return this.fetchEmploymentData(seriesId, retryCount + 1)
          }
        }
        throw new Error(`BLS API error: ${response.status} ${response.statusText}`)
      }

      const data: BLSApiResponse = await response.json()

      if (data.status !== "REQUEST_SUCCEEDED") {
        if (data.message.some((msg) => msg.includes("exceeded") || msg.includes("limit"))) {
          // This key has hit its limit
          this.markKeyAsBlocked(availableKey, 60)

          if (retryCount < this.maxRetries) {
            console.log(`⏳ Key limit exceeded, retrying with different key...`)
            await this.delay(2000)
            return this.fetchEmploymentData(seriesId, retryCount + 1)
          }
        } else if (data.message.some((msg) => msg.includes("invalid") || msg.includes("Invalid key"))) {
          // Invalid key detected during normal operation
          console.log(`❌ Invalid API key detected during request: ${availableKey.substring(0, 8)}...`)
          this.removeApiKey(availableKey)
          
          if (retryCount < this.maxRetries) {
            console.log(`⏳ Invalid key removed, retrying with different key...`)
            await this.delay(1000)
            return this.fetchEmploymentData(seriesId, retryCount + 1)
          }
        }
        throw new Error(`BLS API request failed: ${data.message.join(", ")}`)
      }

      // Record successful network request
      this.recordSuccess()
      
      // Add delay between successful requests to be respectful
      await this.delay(200)

      return data.Results.series[0]?.data || []
    } catch (error) {
      // Handle different types of errors
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // Check for network errors specifically
      const isNetworkError = errorMessage.includes('ECONNRESET') || 
                             errorMessage.includes('network') ||
                             errorMessage.includes('fetch failed') ||
                             errorMessage.includes('socket hang up') ||
                             errorMessage.includes('timed out');
      
      if (isNetworkError) {
        console.error(`🌐 Network error: ${errorMessage}`)
        // Record network error for circuit breaker
        this.recordNetworkError()
        
        // Retry with exponential backoff for network errors
        if (retryCount < this.maxRetries) {
          const backoffTime = this.getBackoffTime(retryCount)
          console.log(`🔄 Network error, retrying in ${Math.round(backoffTime/1000)}s... (${retryCount + 1}/${this.maxRetries})`)
          await this.delay(backoffTime)
          return this.fetchEmploymentData(seriesId, retryCount + 1)
        }
      } else if (retryCount < this.maxRetries && !errorMessage.includes("All API keys")) {
        // Standard retry for other errors
        console.log(`🔄 Request failed, retrying... (${retryCount + 1}/${this.maxRetries})`)
        await this.delay(1000 * (retryCount + 1)) // Simple backoff
        return this.fetchEmploymentData(seriesId, retryCount + 1)
      }

      console.error("BLS API fetch error:", error)
      throw error
    }
  }

  async fetchOccupationalData(occupationCode: string): Promise<JobData | null> {
    try {
      // BLS uses different series IDs for different data types
      const employmentSeriesId = `OEUS000000000000${occupationCode}01`
      const wageSeriesId = `OEUS000000000000${occupationCode}04`

      // Sequential fetches instead of parallel to reduce connection load
      // This is more reliable in serverless environments
      let employmentData, wageData;
      
      try {
        employmentData = await this.fetchEmploymentData(employmentSeriesId);
        // Add a small delay between requests
        await this.delay(500);
        wageData = await this.fetchEmploymentData(wageSeriesId);
      } catch (error) {
        console.error(`Error in sequential fetch for occupation ${occupationCode}:`, error);
        // Fallback to parallel fetch if sequential fails
        [employmentData, wageData] = await Promise.all([
          this.fetchEmploymentData(employmentSeriesId),
          this.fetchEmploymentData(wageSeriesId),
        ]);
      }

      const latestEmployment = employmentData[0]?.value || 0
      const latestWage = wageData[0]?.value || 0

      return {
        code: occupationCode,
        title: "", // This would need to be fetched from occupation titles API
        employment: Number.parseInt(latestEmployment),
        projectedEmployment: 0, // This would need projection calculations
        medianWage: Number.parseFloat(latestWage),
      }
    } catch (error) {
      console.error(`Error fetching data for occupation ${occupationCode}:`, error)
      return null
    }
  }

  // Get total remaining requests across all keys
  getTotalRemainingRequests(): number {
    this.resetDailyCountsIfNeeded()
    let total = 0

    this.keyStatuses.forEach((status) => {
      if (!status.isBlocked) {
        total += Math.max(0, this.dailyLimit - status.requestsUsed)
      }
    })

    return total
  }

  // Get status of all API keys
  getAllKeyStatuses(): Array<{
    keyPreview: string
    requestsUsed: number
    requestsRemaining: number
    isBlocked: boolean
    blockUntil?: Date
  }> {
    this.resetDailyCountsIfNeeded()

    return Array.from(this.keyStatuses.values()).map((status) => ({
      keyPreview: `${status.key.substring(0, 8)}...`,
      requestsUsed: status.requestsUsed,
      requestsRemaining: Math.max(0, this.dailyLimit - status.requestsUsed),
      isBlocked: status.isBlocked,
      blockUntil: status.blockUntil,
    }))
  }

  // Get the next available key info
  getCurrentKeyInfo(): {
    keyPreview: string
    requestsUsed: number
    requestsRemaining: number
  } | null {
    const availableKey = this.getNextAvailableKey()
    if (!availableKey) return null

    const status = this.keyStatuses.get(availableKey)!
    return {
      keyPreview: `${availableKey.substring(0, 8)}...`,
      requestsUsed: status.requestsUsed,
      requestsRemaining: Math.max(0, this.dailyLimit - status.requestsUsed),
    }
  }

  getTimeUntilNextReset(): number {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return tomorrow.getTime() - now.getTime()
  }

  // Add a new API key dynamically
  addApiKey(newKey: string): void {
    if (!newKey || newKey.trim().length === 0) {
      console.log(`⚠️ Attempted to add empty API key, ignoring`)
      return
    }
    
    if (this.validationInProgress) {
      // Queue the key for validation later
      this.validationQueue.push(newKey)
      console.log(`⏳ API key queued for validation: ${newKey.substring(0, 4)}...`)
      return
    }
    
    if (!this.apiKeys.includes(newKey)) {
      // Start async validation
      this.validateApiKey(newKey).then(isValid => {
        if (isValid) {
          this.apiKeys.push(newKey)
          this.keyStatuses.set(newKey, {
            key: newKey,
            requestsUsed: 0,
            lastResetDate: new Date().toDateString(),
            isBlocked: false,
          })
          console.log(`➕ Added new API key: ${newKey.substring(0, 4)}...`)
        } else {
          console.log(`❌ Rejected invalid API key: ${newKey.substring(0, 4)}...`)
        }
      }).catch(error => {
        console.error(`Error validating new API key: ${error instanceof Error ? error.message : String(error)}`)
      })
    }
  }

  // Remove an API key
  removeApiKey(keyToRemove: string): void {
    const index = this.apiKeys.indexOf(keyToRemove)
    if (index > -1) {
      this.apiKeys.splice(index, 1)
      this.keyStatuses.delete(keyToRemove)
      console.log(`➖ Removed API key: ${keyToRemove.substring(0, 4)}...`)
    }
  }
  
  // Get the count of valid API keys
  getValidKeyCount(): number {
    return this.apiKeys.length
  }
  
  // Get network health status
  getNetworkHealthStatus(): {
    isHealthy: boolean
    consecutiveErrors: number
    circuitBreakerOpen: boolean
    resetTime: Date | null
  } {
    return {
      isHealthy: !this.networkErrorTracker.isCircuitOpen,
      consecutiveErrors: this.networkErrorTracker.consecutiveErrors,
      circuitBreakerOpen: this.networkErrorTracker.isCircuitOpen,
      resetTime: this.networkErrorTracker.resetTime
    }
  }
  
  // Reset circuit breaker manually if needed
  resetCircuitBreaker(): void {
    this.networkErrorTracker.isCircuitOpen = false
    this.networkErrorTracker.consecutiveErrors = 0
    this.networkErrorTracker.resetTime = null
    console.log('🔌 Circuit breaker manually reset')
  }
}
