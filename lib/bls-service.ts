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

export class BLSService {
  private apiKeys: string[]
  private baseUrl = "https://api.bls.gov/publicAPI/v2/timeseries/data/"
  private dailyLimit = 500
  private keyStatuses: Map<string, APIKeyStatus>
  private currentKeyIndex = 0
  private validationInProgress = false
  private validationQueue: string[] = []

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
    
    // Start async validation of keys
    this.validateAllApiKeys()
  }

  /**
   * Validates all API keys and removes invalid ones
   * This runs asynchronously to avoid blocking initialization
   */
  private async validateAllApiKeys(): Promise<void> {
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
      
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seriesid: [testSeriesId],
          startyear: "2023",
          endyear: "2023",
          registrationkey: key,
        }),
        // Short timeout for validation
        signal: AbortSignal.timeout(5000)
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
      return true
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

  async fetchEmploymentData(seriesId: string, retryCount = 0): Promise<any> {
    const maxRetries = 3
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

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seriesid: [seriesId],
          startyear: "2020",
          endyear: "2024",
          registrationkey: availableKey,
        }),
      })

      status.requestsUsed++

      if (!response.ok) {
        if (response.status === 429 || response.status === 403) {
          // Rate limited or forbidden - mark key as blocked
          this.markKeyAsBlocked(availableKey, 60)

          if (retryCount < maxRetries) {
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

          if (retryCount < maxRetries) {
            console.log(`⏳ Key limit exceeded, retrying with different key...`)
            await this.delay(2000)
            return this.fetchEmploymentData(seriesId, retryCount + 1)
          }
        } else if (data.message.some((msg) => msg.includes("invalid") || msg.includes("Invalid key"))) {
          // Invalid key detected during normal operation
          console.log(`❌ Invalid API key detected during request: ${availableKey.substring(0, 8)}...`)
          this.removeApiKey(availableKey)
          
          if (retryCount < maxRetries) {
            console.log(`⏳ Invalid key removed, retrying with different key...`)
            await this.delay(1000)
            return this.fetchEmploymentData(seriesId, retryCount + 1)
          }
        }
        throw new Error(`BLS API request failed: ${data.message.join(", ")}`)
      }

      // Add delay between successful requests to be respectful
      await this.delay(200)

      return data.Results.series[0]?.data || []
    } catch (error) {
      if (retryCount < maxRetries && error instanceof Error && !error.message.includes("All API keys")) {
        console.log(`🔄 Request failed, retrying... (${retryCount + 1}/${maxRetries})`)
        await this.delay(1000 * (retryCount + 1)) // Exponential backoff
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

      const [employmentData, wageData] = await Promise.all([
        this.fetchEmploymentData(employmentSeriesId),
        this.fetchEmploymentData(wageSeriesId),
      ])

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
}
