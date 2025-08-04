/**
 * Reliability Test Suite for JobAIRiskAnalyzer-6g
 * 
 * This script performs comprehensive testing of the sync system, database connectivity,
 * and API endpoints to identify root causes of failures in the sync process.
 * 
 * Usage:
 *   node scripts/reliability-test-suite.js [--verbose] [--section=<section-name>]
 * 
 * Options:
 *   --verbose         Show detailed logs for each test
 *   --section=<name>  Run only a specific test section (database, api, bls, sync, ui)
 */

require('dotenv').config();
const { Pool } = require('pg');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// ========== CONFIGURATION ==========

const config = {
  // Database configuration
  database: {
    connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMs: 5000,
    statementTimeoutMs: 10000,
    idleTimeoutMs: 30000,
    max: 5
  },
  
  // API endpoints
  api: {
    baseUrl: process.env.VERCEL_URL ? 
      `https://${process.env.VERCEL_URL}` : 
      'http://localhost:3000',
    endpoints: {
      databaseStatus: '/api/admin/database-status',
      syncStatus: '/api/admin/sync-status',
      enhancedSync: '/api/admin/enhanced-sync',
      apiKeys: '/api/admin/api-keys',
      systemHealth: '/api/admin/system-health',
      jobDetails: '/api/admin/job-details',
      jobs: '/api/jobs',
      jobSuggestions: '/api/jobs/suggestions'
    },
    timeout: 30000
  },
  
  // BLS API configuration
  bls: {
    // Collect all env vars beginning with BLS_API_KEY (1…N)
    apiKeys: Object.entries(process.env)
      .filter(([k]) => /^BLS_API_KEY(_\d+)?$/.test(k))
      .map(([, v]) => v)
      .filter(Boolean),
    baseUrl: 'https://api.bls.gov/publicAPI/v2/timeseries/data/',
    testSeriesId: 'CEU0000000001', // Total nonfarm employment
    timeout: 30000
  },
  
  // Test data
  testData: {
    occupationCodes: ['11-1011', '15-1252', '29-1141', '35-3031', '43-4051'],
    searchTerms: ['software', 'nurse', 'teacher', 'manager', 'chef']
  },
  
  // Test configuration
  tests: {
    recordInsertionCount: 3,
    syncMonitoringDurationMs: 60000,
    syncPollingIntervalMs: 3000,
    uiPollingIntervalMs: 2000,
    retryAttempts: 3,
    retryDelayMs: 2000
  }
};

// ========== UTILITIES ==========

// Logger with different levels
const logger = {
  info: (message) => console.log(`\x1b[36m[INFO]\x1b[0m ${message}`),
  success: (message) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`),
  warning: (message) => console.log(`\x1b[33m[WARNING]\x1b[0m ${message}`),
  error: (message) => console.log(`\x1b[31m[ERROR]\x1b[0m ${message}`),
  debug: (message) => verbose && console.log(`\x1b[90m[DEBUG]\x1b[0m ${message}`),
  section: (title) => console.log(`\n\x1b[1m\x1b[34m=== ${title} ===\x1b[0m`)
};

// Test result tracking
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  warnings: 0,
  details: []
};

// Report test result
function reportTest(name, passed, details = {}) {
  if (passed) {
    logger.success(`✓ ${name}`);
    testResults.passed++;
  } else {
    logger.error(`✗ ${name}`);
    testResults.failed++;
  }
  
  testResults.details.push({
    name,
    passed,
    details,
    timestamp: new Date().toISOString()
  });
  
  return passed;
}

// Retry a function with exponential backoff
async function withRetry(fn, retries = config.tests.retryAttempts, delay = config.tests.retryDelayMs) {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    
    logger.debug(`Retrying after ${delay}ms (${retries} attempts left): ${error.message}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 1.5);
  }
}

// Fetch with timeout
async function fetchWithTimeout(url, options = {}) {
  const { timeout = config.api.timeout } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Save test results to a file
function saveTestResults() {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = `reliability-test-results-${timestamp}.json`;
  const filePath = path.join(__dirname, '..', 'logs', filename);
  
  // Ensure logs directory exists
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  const results = {
    summary: {
      passed: testResults.passed,
      failed: testResults.failed,
      skipped: testResults.skipped,
      warnings: testResults.warnings,
      total: testResults.passed + testResults.failed + testResults.skipped,
      timestamp: new Date().toISOString()
    },
    details: testResults.details,
    config: {
      ...config,
      // Redact sensitive information
      database: {
        ...config.database,
        connectionString: config.database.connectionString ? '***REDACTED***' : null
      },
      bls: {
        ...config.bls,
        apiKeys: config.bls.apiKeys.map(key => key ? '***REDACTED***' : null)
      }
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      env: process.env.NODE_ENV || 'development'
    }
  };
  
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  logger.info(`Test results saved to ${filePath}`);
  
  return filePath;
}

// ========== DATABASE TESTS ==========

// Create a database connection pool
function createDbPool() {
  if (!config.database.connectionString) {
    throw new Error('Database connection string not provided');
  }
  
  return new Pool({
    connectionString: config.database.connectionString,
    ssl: config.database.ssl,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    statement_timeout: config.database.statementTimeoutMs,
    idle_in_transaction_session_timeout: config.database.idleTimeoutMs,
    max: config.database.max
  });
}

// Test database connectivity
async function testDatabaseConnectivity() {
  logger.section('Database Connectivity Test');
  
  let pool;
  try {
    pool = createDbPool();
    
    const startTime = performance.now();
    const result = await pool.query('SELECT NOW() as time');
    const endTime = performance.now();
    
    const responseTime = endTime - startTime;
    logger.debug(`Database response time: ${responseTime.toFixed(2)}ms`);
    
    return reportTest('Database connection', true, {
      responseTime,
      serverTime: result.rows[0].time
    });
  } catch (error) {
    logger.error(`Database connection error: ${error.message}`);
    return reportTest('Database connection', false, {
      error: error.message,
      stack: error.stack
    });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Test database tables
async function testDatabaseTables() {
  let pool;
  try {
    pool = createDbPool();
    
    // Check if jobs table exists
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    const hasJobsTable = tables.includes('jobs');
    
    logger.debug(`Database tables: ${tables.join(', ')}`);
    
    if (!hasJobsTable) {
      logger.error('Jobs table not found in database');
      return reportTest('Database tables', false, { tables });
    }
    
    // Check jobs table structure
    const columnsResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'jobs'
    `);
    
    const columns = columnsResult.rows.map(row => ({
      name: row.column_name,
      type: row.data_type
    }));
    
    const requiredColumns = [
      'occ_code',
      'occ_title',
      'employment_2023',
      'median_wage',
      'ai_impact_score'
    ];
    
    const missingColumns = requiredColumns.filter(col => 
      !columns.some(c => c.name === col)
    );
    
    if (missingColumns.length > 0) {
      logger.error(`Missing required columns: ${missingColumns.join(', ')}`);
      return reportTest('Database tables', false, { tables, columns, missingColumns });
    }
    
    return reportTest('Database tables', true, { tables, columns });
  } catch (error) {
    logger.error(`Database tables error: ${error.message}`);
    return reportTest('Database tables', false, {
      error: error.message,
      stack: error.stack
    });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Test record insertion
async function testRecordInsertion() {
  let pool;
  try {
    pool = createDbPool();
    
    // Generate test records
    const testRecords = Array.from({ length: config.tests.recordInsertionCount }, (_, i) => ({
      occ_code: `TEST-${Date.now()}-${i}`,
      occ_title: `Test Occupation ${i}`,
      employment_2023: Math.floor(Math.random() * 100000),
      projected_employment_2033: Math.floor(Math.random() * 120000),
      median_wage: Math.floor(Math.random() * 100000),
      ai_impact_score: Math.floor(Math.random() * 100),
      automation_risk: ['Low', 'Medium', 'High'][Math.floor(Math.random() * 3)],
      skills_at_risk: 'Test skills at risk',
      skills_needed: 'Test skills needed',
      created_at: new Date(),
      updated_at: new Date()
    }));
    
    // Insert test records
    for (const record of testRecords) {
      await pool.query(`
        INSERT INTO jobs (
          occ_code, occ_title, employment_2023, projected_employment_2033, 
          median_wage, ai_impact_score, automation_risk, 
          skills_at_risk, skills_needed, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        ON CONFLICT (occ_code) 
        DO UPDATE SET 
          occ_title = EXCLUDED.occ_title,
          employment_2023 = EXCLUDED.employment_2023,
          projected_employment_2033 = EXCLUDED.projected_employment_2033,
          median_wage = EXCLUDED.median_wage,
          ai_impact_score = EXCLUDED.ai_impact_score,
          automation_risk = EXCLUDED.automation_risk,
          skills_at_risk = EXCLUDED.skills_at_risk,
          skills_needed = EXCLUDED.skills_needed,
          updated_at = EXCLUDED.updated_at
      `, [
        record.occ_code,
        record.occ_title,
        record.employment_2023,
        record.projected_employment_2033,
        record.median_wage,
        record.ai_impact_score,
        record.automation_risk,
        record.skills_at_risk,
        record.skills_needed,
        record.created_at,
        record.updated_at
      ]);
    }
    
    // Verify inserted records
    const insertedRecords = [];
    for (const record of testRecords) {
      const result = await pool.query(
        'SELECT * FROM jobs WHERE occ_code = $1',
        [record.occ_code]
      );
      
      if (result.rows.length > 0) {
        insertedRecords.push(result.rows[0]);
      }
    }
    
    const allInserted = insertedRecords.length === testRecords.length;
    
    if (!allInserted) {
      logger.error(`Only ${insertedRecords.length}/${testRecords.length} records were inserted`);
    }
    
    // Clean up test records
    for (const record of testRecords) {
      await pool.query('DELETE FROM jobs WHERE occ_code = $1', [record.occ_code]);
    }
    
    return reportTest('Record insertion', allInserted, {
      inserted: insertedRecords.length,
      expected: testRecords.length,
      testRecords: testRecords.map(r => r.occ_code)
    });
  } catch (error) {
    logger.error(`Record insertion error: ${error.message}`);
    return reportTest('Record insertion', false, {
      error: error.message,
      stack: error.stack
    });
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Count records in database
async function countDatabaseRecords() {
  let pool;
  try {
    pool = createDbPool();
    
    const result = await pool.query('SELECT COUNT(*) as count FROM jobs');
    const count = parseInt(result.rows[0].count, 10);
    
    logger.info(`Current record count in jobs table: ${count}`);
    
    return {
      success: true,
      count,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`Record count error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// ========== API TESTS ==========

// Test API endpoint
async function testApiEndpoint(endpoint, options = {}) {
  const { method = 'GET', body = null, expectedStatus = 200 } = options;
  
  try {
    const url = `${config.api.baseUrl}${endpoint}`;
    logger.debug(`Testing API endpoint: ${method} ${url}`);
    
    const fetchOptions = {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: config.api.timeout
    };
    
    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }
    
    const response = await fetchWithTimeout(url, fetchOptions);
    const responseData = await response.json().catch(() => null);
    
    const success = response.status === expectedStatus;
    
    if (!success) {
      logger.error(`API endpoint ${endpoint} returned status ${response.status}, expected ${expectedStatus}`);
    }
    
    return {
      success,
      status: response.status,
      data: responseData,
      headers: Object.fromEntries(response.headers.entries()),
      url
    };
  } catch (error) {
    logger.error(`API endpoint ${endpoint} error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      url: `${config.api.baseUrl}${endpoint}`
    };
  }
}

// Test all API endpoints
async function testApiEndpoints() {
  logger.section('API Endpoints Test');
  
  const results = {};
  
  // Test database status endpoint
  results.databaseStatus = await testApiEndpoint(config.api.endpoints.databaseStatus);
  reportTest('Database status API', results.databaseStatus.success, results.databaseStatus);
  
  // Test sync status endpoint
  results.syncStatus = await testApiEndpoint(config.api.endpoints.syncStatus);
  reportTest('Sync status API', results.syncStatus.success, results.syncStatus);
  
  // Test system health endpoint
  results.systemHealth = await testApiEndpoint(config.api.endpoints.systemHealth);
  reportTest('System health API', results.systemHealth.success, results.systemHealth);
  
  // Test jobs endpoint
  results.jobs = await testApiEndpoint(config.api.endpoints.jobs);
  reportTest('Jobs API', results.jobs.success, results.jobs);
  
  // Test job suggestions endpoint with a search term
  const searchTerm = config.testData.searchTerms[0];
  results.jobSuggestions = await testApiEndpoint(
    `${config.api.endpoints.jobSuggestions}?q=${encodeURIComponent(searchTerm)}`
  );
  reportTest('Job suggestions API', results.jobSuggestions.success, results.jobSuggestions);
  
  return results;
}

// Test enhanced sync API
async function testEnhancedSyncApi() {
  try {
    const startResult = await testApiEndpoint(
      config.api.endpoints.enhancedSync,
      { method: 'POST', body: { action: 'start' }, expectedStatus: 200 }
    );
    
    reportTest('Enhanced sync start API', startResult.success, startResult);
    
    if (!startResult.success) {
      return startResult;
    }
    
    // Wait a moment for sync to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check sync status
    const statusResult = await testApiEndpoint(config.api.endpoints.syncStatus);
    
    const isSyncRunning = statusResult.success && 
                          statusResult.data && 
                          statusResult.data.isRunning === true;
    
    reportTest('Sync is running after start', isSyncRunning, {
      syncStatus: statusResult.data,
      startResult: startResult.data
    });
    
    return {
      success: startResult.success && isSyncRunning,
      startResult: startResult.data,
      statusResult: statusResult.data
    };
  } catch (error) {
    logger.error(`Enhanced sync API test error: ${error.message}`);
    reportTest('Enhanced sync API', false, {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

// ========== BLS API TESTS ==========

// Test BLS API key validation
async function testBlsApiKeys() {
  logger.section('BLS API Keys Test');
  
  if (!config.bls.apiKeys.length) {
    logger.warning('No BLS API keys configured');
    testResults.warnings++;
    reportTest('BLS API keys configured', false, { error: 'No BLS API keys found in environment' });
    return false;
  }
  
  const validKeys = [];
  const invalidKeys = [];
  
  for (const [index, key] of config.bls.apiKeys.entries()) {
    if (!key) {
      logger.warning(`BLS API key at index ${index} is empty`);
      continue;
    }
    
    try {
      logger.debug(`Testing BLS API key: ${key.substring(0, 4)}...`);
      
      const response = await fetchWithTimeout(config.bls.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          seriesid: [config.bls.testSeriesId],
          startyear: '2023',
          endyear: '2023',
          registrationkey: key
        }),
        timeout: config.bls.timeout
      });
      
      const data = await response.json();
      
      if (data.status === 'REQUEST_SUCCEEDED') {
        validKeys.push(index);
        logger.debug(`BLS API key ${index} (${key.substring(0, 4)}...) is valid`);
      } else {
        invalidKeys.push({ index, message: data.message });
        logger.warning(`BLS API key ${index} (${key.substring(0, 4)}...) is invalid: ${data.message}`);
      }
    } catch (error) {
      logger.error(`Error testing BLS API key ${index}: ${error.message}`);
      invalidKeys.push({ index, error: error.message });
    }
  }
  
  const allKeysValid = validKeys.length === config.bls.apiKeys.filter(Boolean).length;
  const someKeysValid = validKeys.length > 0;
  
  reportTest('All BLS API keys valid', allKeysValid, {
    validKeys,
    invalidKeys,
    totalKeys: config.bls.apiKeys.filter(Boolean).length
  });
  
  if (!allKeysValid && someKeysValid) {
    logger.warning(`Only ${validKeys.length}/${config.bls.apiKeys.filter(Boolean).length} BLS API keys are valid`);
    testResults.warnings++;
  }
  
  return someKeysValid;
}

// Test BLS data fetching
async function testBlsDataFetching() {
  if (!config.bls.apiKeys.length) {
    logger.warning('Skipping BLS data fetching test: No API keys configured');
    testResults.skipped++;
    return false;
  }
  
  try {
    const key = config.bls.apiKeys[0];
    const occupationCode = config.testData.occupationCodes[0];
    const seriesId = `OEUS000000000000${occupationCode}01`; // Employment series
    
    logger.debug(`Testing BLS data fetching for occupation ${occupationCode} (series ${seriesId})`);
    
    const response = await fetchWithTimeout(config.bls.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        seriesid: [seriesId],
        startyear: '2020',
        endyear: '2023',
        registrationkey: key
      }),
      timeout: config.bls.timeout
    });
    
    const data = await response.json();
    
    const success = data.status === 'REQUEST_SUCCEEDED' && 
                   data.Results && 
                   data.Results.series && 
                   data.Results.series.length > 0;
    
    if (success) {
      const seriesData = data.Results.series[0].data;
      logger.debug(`Received ${seriesData.length} data points for occupation ${occupationCode}`);
    } else {
      logger.error(`Failed to fetch BLS data: ${data.message}`);
    }
    
    return reportTest('BLS data fetching', success, {
      occupationCode,
      seriesId,
      response: data,
      dataPoints: success ? data.Results.series[0].data.length : 0
    });
  } catch (error) {
    logger.error(`BLS data fetching error: ${error.message}`);
    return reportTest('BLS data fetching', false, {
      error: error.message,
      stack: error.stack
    });
  }
}

// ========== SYNC PROCESS TESTS ==========

// Monitor sync process
async function monitorSyncProcess() {
  logger.section('Sync Process Monitoring');
  
  const startTime = Date.now();
  const endTime = startTime + config.tests.syncMonitoringDurationMs;
  
  const initialDbCount = await countDatabaseRecords();
  logger.info(`Initial database record count: ${initialDbCount.success ? initialDbCount.count : 'unknown'}`);
  
  // Start the sync process
  const syncStartResult = await testApiEndpoint(
    config.api.endpoints.enhancedSync,
    { method: 'POST', body: { action: 'start' }, expectedStatus: 200 }
  );
  
  if (!syncStartResult.success) {
    logger.error('Failed to start sync process');
    reportTest('Sync process start', false, syncStartResult);
    return {
      success: false,
      error: 'Failed to start sync process',
      details: syncStartResult
    };
  }
  
  reportTest('Sync process start', true, syncStartResult);
  
  // Monitor sync status and database record count
  const statusChecks = [];
  const recordCounts = [];
  
  if (initialDbCount.success) {
    recordCounts.push(initialDbCount);
  }
  
  let isRunning = true;
  while (Date.now() < endTime && isRunning) {
    // Check sync status
    const statusResult = await testApiEndpoint(config.api.endpoints.syncStatus);
    statusChecks.push({
      timestamp: new Date().toISOString(),
      data: statusResult.data,
      success: statusResult.success
    });
    
    if (statusResult.success && statusResult.data) {
      isRunning = statusResult.data.isRunning;
      
      logger.info(
        `Sync status: ${isRunning ? 'Running' : 'Stopped'}, ` +
        `Processed: ${statusResult.data.processedJobs}/${statusResult.data.totalJobs}, ` +
        `Success: ${statusResult.data.successfulJobs}, ` +
        `Failed: ${statusResult.data.failedJobs}`
      );
    }
    
    // Check database record count
    const currentCount = await countDatabaseRecords();
    if (currentCount.success) {
      recordCounts.push(currentCount);
      
      if (recordCounts.length > 1) {
        const previousCount = recordCounts[recordCounts.length - 2].count;
        const diff = currentCount.count - previousCount;
        
        if (diff > 0) {
          logger.success(`Database records increased by ${diff} (${previousCount} → ${currentCount.count})`);
        } else if (diff < 0) {
          logger.warning(`Database records decreased by ${Math.abs(diff)} (${previousCount} → ${currentCount.count})`);
        } else {
          logger.debug(`Database record count unchanged (${currentCount.count})`);
        }
      }
    }
    
    // Wait for next check
    await new Promise(resolve => setTimeout(resolve, config.tests.syncPollingIntervalMs));
  }
  
  // Final record count
  const finalDbCount = await countDatabaseRecords();
  if (finalDbCount.success) {
    recordCounts.push(finalDbCount);
  }
  
  // Calculate record changes
  let recordsAdded = 0;
  if (initialDbCount.success && finalDbCount.success) {
    recordsAdded = finalDbCount.count - initialDbCount.count;
    logger.info(`Total records added during monitoring: ${recordsAdded}`);
  }
  
  // Check if sync made progress
  const syncMadeProgress = statusChecks.length >= 2 && 
    statusChecks[statusChecks.length - 1].data.processedJobs > 
    statusChecks[0].data.processedJobs;
  
  reportTest('Sync process made progress', syncMadeProgress, {
    initialProcessed: statusChecks[0]?.data?.processedJobs,
    finalProcessed: statusChecks[statusChecks.length - 1]?.data?.processedJobs
  });
  
  // Check if records were added to database
  const recordsWereAdded = recordsAdded > 0;
  reportTest('Records added to database', recordsWereAdded, {
    initialCount: initialDbCount.success ? initialDbCount.count : 'unknown',
    finalCount: finalDbCount.success ? finalDbCount.count : 'unknown',
    recordsAdded
  });
  
  return {
    success: syncMadeProgress && recordsWereAdded,
    recordsAdded,
    initialCount: initialDbCount.success ? initialDbCount.count : null,
    finalCount: finalDbCount.success ? finalDbCount.count : null,
    statusChecks,
    recordCounts
  };
}

// Test sync-database consistency
async function testSyncDatabaseConsistency() {
  try {
    // Get sync status
    const syncStatusResult = await testApiEndpoint(config.api.endpoints.syncStatus);
    
    if (!syncStatusResult.success) {
      logger.error('Failed to get sync status');
      return reportTest('Sync-database consistency', false, {
        error: 'Failed to get sync status',
        details: syncStatusResult
      });
    }
    
    // Get database record count
    const dbCount = await countDatabaseRecords();
    
    if (!dbCount.success) {
      logger.error('Failed to get database record count');
      return reportTest('Sync-database consistency', false, {
        error: 'Failed to get database record count',
        details: dbCount
      });
    }
    
    // Compare processed jobs with database records
    const processedJobs = syncStatusResult.data.processedJobs;
    const successfulJobs = syncStatusResult.data.successfulJobs;
    const databaseRecords = dbCount.count;
    
    // Calculate consistency metrics
    const consistencyRatio = databaseRecords / Math.max(successfulJobs, 1);
    const isConsistent = consistencyRatio >= 0.9; // Allow for some records to be missing
    
    if (!isConsistent) {
      logger.warning(
        `Sync-database inconsistency detected: ` +
        `${databaseRecords} records in database, ` +
        `${successfulJobs} successful jobs reported by sync`
      );
    }
    
    return reportTest('Sync-database consistency', isConsistent, {
      databaseRecords,
      processedJobs,
      successfulJobs,
      consistencyRatio
    });
  } catch (error) {
    logger.error(`Sync-database consistency test error: ${error.message}`);
    return reportTest('Sync-database consistency', false, {
      error: error.message,
      stack: error.stack
    });
  }
}

// ========== UI POLLING TESTS ==========

// Simulate UI polling behavior
async function testUiPolling() {
  logger.section('UI Polling Test');
  
  try {
    // Simulate UI polling for 10 seconds
    const startTime = Date.now();
    const endTime = startTime + 10000; // 10 seconds
    
    const pollResults = [];
    
    while (Date.now() < endTime) {
      const syncStatusResult = await testApiEndpoint(config.api.endpoints.syncStatus);
      
      pollResults.push({
        timestamp: new Date().toISOString(),
        success: syncStatusResult.success,
        data: syncStatusResult.data,
        responseTime: syncStatusResult.responseTime
      });
      
      // Wait for polling interval
      await new Promise(resolve => setTimeout(resolve, config.tests.uiPollingIntervalMs));
    }
    
    // Check if polling was successful
    const successfulPolls = pollResults.filter(result => result.success).length;
    const totalPolls = pollResults.length;
    const successRate = successfulPolls / totalPolls;
    
    const isReliable = successRate >= 0.9; // At least 90% success rate
    
    if (!isReliable) {
      logger.warning(`UI polling reliability issues: ${successfulPolls}/${totalPolls} successful polls (${(successRate * 100).toFixed(1)}%)`);
    }
    
    return reportTest('UI polling reliability', isReliable, {
      successfulPolls,
      totalPolls,
      successRate,
      pollResults
    });
  } catch (error) {
    logger.error(`UI polling test error: ${error.message}`);
    return reportTest('UI polling reliability', false, {
      error: error.message,
      stack: error.stack
    });
  }
}

// ========== MAIN TEST RUNNER ==========

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const sectionArg = args.find(arg => arg.startsWith('--section='));
const section = sectionArg ? sectionArg.split('=')[1] : null;

// Run all tests
async function runTests() {
  logger.info('Starting reliability test suite');
  logger.info(`Verbose mode: ${verbose ? 'enabled' : 'disabled'}`);
  
  if (section) {
    logger.info(`Running only section: ${section}`);
  }
  
  try {
    // Database tests
    if (!section || section === 'database') {
      await testDatabaseConnectivity();
      await testDatabaseTables();
      await testRecordInsertion();
    }
    
    // API tests
    if (!section || section === 'api') {
      await testApiEndpoints();
    }
    
    // BLS API tests
    if (!section || section === 'bls') {
      await testBlsApiKeys();
      await testBlsDataFetching();
    }
    
    // Sync tests
    if (!section || section === 'sync') {
      await testEnhancedSyncApi();
      await testSyncDatabaseConsistency();
    }
    
    // UI tests
    if (!section || section === 'ui') {
      await testUiPolling();
    }
    
    // Comprehensive sync monitoring
    if (!section || section === 'monitor') {
      await monitorSyncProcess();
    }
    
    // Print summary
    logger.section('Test Results Summary');
    logger.info(`Passed: ${testResults.passed}`);
    logger.info(`Failed: ${testResults.failed}`);
    logger.info(`Skipped: ${testResults.skipped}`);
    logger.info(`Warnings: ${testResults.warnings}`);
    logger.info(`Total: ${testResults.passed + testResults.failed + testResults.skipped}`);
    
    // Save results
    const resultsFile = saveTestResults();
    logger.info(`Detailed results saved to: ${resultsFile}`);
    
    return {
      passed: testResults.passed,
      failed: testResults.failed,
      skipped: testResults.skipped,
      warnings: testResults.warnings,
      total: testResults.passed + testResults.failed + testResults.skipped
    };
  } catch (error) {
    logger.error(`Test suite error: ${error.message}`);
    logger.error(error.stack);
    return {
      passed: testResults.passed,
      failed: testResults.failed + 1, // Count the suite error
      skipped: testResults.skipped,
      warnings: testResults.warnings,
      total: testResults.passed + testResults.failed + testResults.skipped + 1,
      error: error.message
    };
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  runTests()
    .then(results => {
      if (results.failed > 0) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  runTests,
  testDatabaseConnectivity,
  testDatabaseTables,
  testRecordInsertion,
  testApiEndpoints,
  testEnhancedSyncApi,
  testBlsApiKeys,
  testBlsDataFetching,
  monitorSyncProcess,
  testSyncDatabaseConsistency,
  testUiPolling,
  countDatabaseRecords
};
