interface ApiError {
  message: string
  status: number
  code?: string
  details?: any
}

interface ErrorResponse {
  success: false
  error: string
  details?: string
  timestamp: string
}

interface SuccessResponse<T = any> {
  success: true
  data: T
  timestamp: string
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse

export function createErrorResponse(error: string, details?: string): ErrorResponse {
  return {
    success: false,
    error,
    details,
    timestamp: new Date().toISOString(),
  }
}

export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

export function handleDatabaseError(error: unknown): ErrorResponse {
  console.error("Database error:", error)

  if (error instanceof Error) {
    // Handle specific database errors
    if (error.message.includes("connection")) {
      return createErrorResponse("Database connection failed", "Please check your database configuration")
    }

    if (error.message.includes("timeout")) {
      return createErrorResponse("Database timeout", "The request took too long to process")
    }

    if (error.message.includes("permission")) {
      return createErrorResponse("Database permission denied", "Check database credentials")
    }

    return createErrorResponse("Database error", error.message)
  }

  return createErrorResponse("Unknown database error", "An unexpected error occurred")
}

export function handleApiError(error: unknown): ErrorResponse {
  console.error("API error:", error)

  if (error instanceof Error) {
    if (error.message.includes("fetch")) {
      return createErrorResponse("Network error", "Failed to connect to external API")
    }

    if (error.message.includes("timeout")) {
      return createErrorResponse("Request timeout", "The API request timed out")
    }

    if (error.message.includes("rate limit")) {
      return createErrorResponse("Rate limit exceeded", "Too many requests, please try again later")
    }

    return createErrorResponse("API error", error.message)
  }

  return createErrorResponse("Unknown API error", "An unexpected error occurred")
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public retryAfter?: number,
  ) {
    super(message)
    this.name = "RetryableError"
  }
}

export class ApiErrorHandler {
  static async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    try {
      // Check if response is ok
      if (!response.ok) {
        console.error(`HTTP Error: ${response.status} ${response.statusText}`)

        // Try to get error details from response
        let errorDetails = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorText = await response.text()
          if (errorText) {
            errorDetails = errorText
          }
        } catch (textError) {
          console.error("Could not read error response:", textError)
        }

        return createErrorResponse(
          `Server error (${response.status})`,
          "The server encountered an error. Please try again later.",
        )
      }

      // Check content type
      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        console.error("Response is not JSON:", contentType)
        const textResponse = await response.text()
        console.error("Response body:", textResponse)

        return createErrorResponse(
          "Invalid response format",
          "Server returned an invalid response. Please try again later.",
        )
      }

      // Parse JSON
      const data = await response.json()

      // Validate response structure
      if (typeof data !== "object" || data === null) {
        return createErrorResponse(
          "Invalid response structure",
          "Server returned invalid data. Please try again later.",
        )
      }

      return createSuccessResponse(data)
    } catch (error) {
      console.error("Response handling error:", error)
      return createErrorResponse(
        "Response processing failed",
        "Failed to process server response. Please try again later.",
      )
    }
  }

  static async fetchWithRetry<T>(
    url: string,
    options: RequestInit = {},
    maxRetries = 3,
    retryDelay = 1000,
  ): Promise<ApiResponse<T>> {
    let lastError: ApiResponse<T> | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries} for ${url}`)

        const response = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...options.headers,
          },
        })

        const result = await this.handleResponse<T>(response)

        if (result.success) {
          return result
        }

        lastError = result

        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          break
        }

        // Wait before retry
        if (attempt < maxRetries) {
          console.log(`Retrying in ${retryDelay}ms...`)
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
          retryDelay *= 2 // Exponential backoff
        }
      } catch (error) {
        console.error(`Fetch attempt ${attempt} failed:`, error)
        lastError = handleApiError(error)

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay))
          retryDelay *= 2
        }
      }
    }

    return (
      lastError ||
      createErrorResponse(
        "All retry attempts failed",
        "Unable to complete request after multiple attempts. Please try again later.",
      )
    )
  }
}

export async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, baseDelay = 1000): Promise<T> {
  let lastError: Error

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt === maxRetries) {
        break
      }

      // Calculate delay with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt)

      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay
      const totalDelay = delay + jitter

      console.log(`Attempt ${attempt + 1} failed, retrying in ${Math.round(totalDelay)}ms...`)

      await new Promise((resolve) => setTimeout(resolve, totalDelay))
    }
  }

  throw lastError!
}
