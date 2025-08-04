/**
 * types/admin.ts
 * Type definitions for the admin dashboard components
 */

/**
 * Database connection status and information
 */
export interface DatabaseStatus {
  connected: boolean;
  responseTime?: number;
  circuitBreakerOpen?: boolean;
  consecutiveFailures?: number;
  database?: {
    url: string;
    tables: {
      existing: string[];
      missing: string[];
      ready: boolean;
    };
    data: {
      totalJobs: number;
      jobsWithAI: number;
      completionRate: number;
    };
  };
  error?: string;
  timestamp: string;
}

/**
 * BLS API key status information
 */
export interface APIKeyStatus {
  success: boolean;
  totalKeys: number;
  workingKeys?: number;
  totalDailyLimit: number;
  totalRemainingRequests: number;
  keyStatuses: Array<{
    keyPreview: string;
    requestsUsed: number;
    requestsRemaining: number;
    isBlocked: boolean;
    blockUntil?: string;
  }>;
  error?: string;
}

/**
 * Data synchronization status and progress
 */
export interface SyncStatus {
  isRunning: boolean;
  totalJobs: number;
  processedJobs: number;
  successfulJobs: number;
  failedJobs: number;
  skippedJobs?: number;
  currentJob?: string;
  lastUpdated: string;
  lastError?: string;
  lastErrorTime?: string;
  startTime?: string;
  endTime?: string;
  apiKeysStatus: {
    totalKeys: number;
    totalDailyLimit: number;
    totalRemainingRequests: number;
    keyStatuses: Array<{
      keyPreview: string;
      requestsUsed: number;
      requestsRemaining: number;
      isBlocked: boolean;
    }>;
  };
  enhancedDetails?: {
    currentBatch?: number;
    totalBatches?: number;
    estimatedTimeRemaining?: number;
    checkpoints?: any[];
  };
}

/**
 * Job analysis details and statistics
 */
export interface JobDetails {
  totalJobs: number;
  jobsWithAIAnalysis: number;
  averageAIImpact: number;
  highRiskJobs: number;
  mediumHighRiskJobs: number;
  mediumRiskJobs: number;
  lowRiskJobs: number;
  lastUpdated: string;
  recentJobs: Array<{
    code: string;
    title: string;
    aiImpactScore: number;
    automationRisk: string;
    updatedAt: string;
  }>;
  error?: string;
}

/**
 * Job data structure for database operations
 */
export interface JobData {
  occ_code: string;
  occ_title: string;
  employment_2023?: number;
  projected_employment_2033?: number;
  median_wage?: number;
  ai_impact_score?: number;
  automation_risk?: string;
  skills_at_risk?: string[];
  skills_needed?: string[];
  future_outlook?: string;
}

/**
 * Sync configuration options
 */
export interface SyncConfig {
  maxConcurrent: number;
  batchSize: number;
  retryAttempts: number;
  validateData: boolean;
  resumeFromLastCheckpoint: boolean;
  maxJobs?: number;
  ignoreApiLimits?: boolean;
  debugMode?: boolean;
}

/**
 * API key validation result
 */
export interface APIKeyValidationResult {
  success: boolean;
  keyPreview: string;
  message: string;
  error?: string;
  response?: any;
}
