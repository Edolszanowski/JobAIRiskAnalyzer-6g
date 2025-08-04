/**
 * Sync Process Debugger for JobAIRiskAnalyzer-6g
 * 
 * This script specifically monitors the sync process and identifies why records
 * aren't being saved to the Neon database. It provides real-time diagnostics and
 * generates a detailed report of findings.
 * 
 * Usage:
 *   node scripts/sync-debugger.js [--no-start] [--duration=<seconds>] [--interval=<seconds>]
 * 
 * Options:
 *   --no-start        Don't start a new sync process, just monitor existing one
 *   --duration=<sec>  How long to monitor (default: 300 seconds)
 *   --interval=<sec>  Check interval in seconds (default: 3 seconds)
 *   --verbose         Show detailed logs
 */

require('dotenv').config();
const { Pool } = require('pg');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const readline = require('readline');

// ========== CONFIGURATION ==========

const config = {
  // Database configuration
  database: {
    connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMs: 5000,
    statementTimeoutMs: 10000,
    idleTimeoutMs: 30000,
    max: 3
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
      jobs: '/api/jobs'
    },
    timeout: 30000
  },
  
  // Monitoring settings
  monitoring: {
    duration: 300, // 5 minutes by default
    interval: 3,   // 3 seconds by default
    checkDatabase: true,
    checkApi: true,
    verbose: false
  },
  
  // Dashboard settings
  dashboard: {
    enabled: true,
    refreshRate: 1000, // 1 second refresh rate
    width: 80,
    height: 20
  }
};

// ========== UTILITIES ==========

// Logger with different levels and timestamps
const logger = {
  _getTimestamp: () => new Date().toISOString(),
  _log: (level, color, message) => {
    const timestamp = logger._getTimestamp();
    console.log(`${color}[${timestamp}] [${level}]\x1b[0m ${message}`);
    
    // Also append to log file
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(path.join(__dirname, '..', 'logs', 'sync-debugger.log'), logEntry);
  },
  info: (message) => logger._log('INFO', '\x1b[36m', message),
  success: (message) => logger._log('SUCCESS', '\x1b[32m', message),
  warning: (message) => logger._log('WARNING', '\x1b[33m', message),
  error: (message) => logger._log('ERROR', '\x1b[31m', message),
  debug: (message) => config.monitoring.verbose && logger._log('DEBUG', '\x1b[90m', message),
  section: (title) => {
    const line = '='.repeat(title.length + 8);
    logger._log('SECTION', '\x1b[1m\x1b[34m', line);
    logger._log('SECTION', '\x1b[1m\x1b[34m', `=== ${title} ===`);
    logger._log('SECTION', '\x1b[1m\x1b[34m', line);
  }
};

// Event timeline for tracking what happens when
const timeline = {
  events: [],
  
  // Add an event to the timeline
  addEvent: (category, message, details = {}) => {
    const event = {
      timestamp: new Date(),
      category,
      message,
      details
    };
    
    timeline.events.push(event);
    return event;
  },
  
  // Get events in a specific category
  getEvents: (category) => {
    return timeline.events.filter(event => event.category === category);
  },
  
  // Get all events
  getAllEvents: () => {
    return [...timeline.events];
  },
  
  // Get the latest event
  getLatestEvent: () => {
    if (timeline.events.length === 0) return null;
    return timeline.events[timeline.events.length - 1];
  },
  
  // Generate a timeline report
  generateReport: () => {
    const report = ['# Sync Process Timeline\n'];
    
    let lastTimestamp = null;
    
    timeline.events.forEach((event, index) => {
      const timestamp = event.timestamp.toISOString();
      
      // Calculate time difference from previous event
      let diffStr = '';
      if (lastTimestamp) {
        const diffMs = event.timestamp.getTime() - lastTimestamp.getTime();
        diffStr = diffMs > 1000 ? 
          ` (+${(diffMs / 1000).toFixed(1)}s)` : 
          ` (+${diffMs}ms)`;
      }
      
      lastTimestamp = event.timestamp;
      
      report.push(`## Event ${index + 1}: ${event.category}`);
      report.push(`**Time**: ${timestamp}${diffStr}`);
      report.push(`**Message**: ${event.message}`);
      
      if (Object.keys(event.details).length > 0) {
        report.push('\n**Details**:');
        
        Object.entries(event.details).forEach(([key, value]) => {
          // Format the value based on its type
          let formattedValue;
          
          if (typeof value === 'object' && value !== null) {
            try {
              formattedValue = JSON.stringify(value, null, 2);
            } catch (e) {
              formattedValue = '[Complex Object]';
            }
          } else {
            formattedValue = String(value);
          }
          
          // Truncate very long values
          if (formattedValue.length > 500) {
            formattedValue = formattedValue.substring(0, 500) + '... [truncated]';
          }
          
          report.push(`- **${key}**: ${formattedValue}`);
        });
      }
      
      report.push('\n---\n');
    });
    
    return report.join('\n');
  }
};

// Diagnostic findings
const diagnostics = {
  findings: [],
  
  // Add a finding
  addFinding: (severity, message, evidence = {}, recommendation = '') => {
    const finding = {
      timestamp: new Date(),
      severity, // 'critical', 'high', 'medium', 'low', 'info'
      message,
      evidence,
      recommendation
    };
    
    diagnostics.findings.push(finding);
    
    // Log the finding
    switch (severity) {
      case 'critical':
        logger.error(`FINDING: ${message}`);
        break;
      case 'high':
        logger.error(`FINDING: ${message}`);
        break;
      case 'medium':
        logger.warning(`FINDING: ${message}`);
        break;
      case 'low':
        logger.info(`FINDING: ${message}`);
        break;
      case 'info':
        logger.debug(`FINDING: ${message}`);
        break;
    }
    
    return finding;
  },
  
  // Generate a diagnostics report
  generateReport: () => {
    const report = ['# Sync Process Diagnostic Findings\n'];
    
    // Group findings by severity
    const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
    const groupedFindings = {};
    
    severityOrder.forEach(severity => {
      groupedFindings[severity] = diagnostics.findings.filter(f => f.severity === severity);
    });
    
    // Generate report sections by severity
    severityOrder.forEach(severity => {
      const findings = groupedFindings[severity];
      
      if (findings.length > 0) {
        report.push(`## ${severity.toUpperCase()} Severity Findings (${findings.length})\n`);
        
        findings.forEach((finding, index) => {
          report.push(`### ${index + 1}. ${finding.message}`);
          report.push(`**Time**: ${finding.timestamp.toISOString()}`);
          
          if (finding.evidence && Object.keys(finding.evidence).length > 0) {
            report.push('\n**Evidence**:');
            
            Object.entries(finding.evidence).forEach(([key, value]) => {
              // Format the value based on its type
              let formattedValue;
              
              if (typeof value === 'object' && value !== null) {
                try {
                  formattedValue = JSON.stringify(value, null, 2);
                } catch (e) {
                  formattedValue = '[Complex Object]';
                }
              } else {
                formattedValue = String(value);
              }
              
              // Truncate very long values
              if (formattedValue.length > 500) {
                formattedValue = formattedValue.substring(0, 500) + '... [truncated]';
              }
              
              report.push(`- **${key}**: ${formattedValue}`);
            });
          }
          
          if (finding.recommendation) {
            report.push(`\n**Recommendation**: ${finding.recommendation}`);
          }
          
          report.push('\n---\n');
        });
      }
    });
    
    return report.join('\n');
  }
};

// Fetch with timeout
async function fetchWithTimeout(url, options = {}) {
  const { timeout = config.api.timeout } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const startTime = performance.now();
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    const endTime = performance.now();
    
    return {
      response,
      responseTime: endTime - startTime
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

// Save report to a file
function saveReport(content, filename) {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const reportFilename = `${filename}-${timestamp}.md`;
  const reportPath = path.join(__dirname, '..', 'logs', reportFilename);
  
  // Ensure logs directory exists
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  fs.writeFileSync(reportPath, content);
  logger.info(`Report saved to ${reportPath}`);
  
  return reportPath;
}

// ========== DATABASE OPERATIONS ==========

// Test database connectivity
async function testDatabaseConnectivity() {
  let pool;
  try {
    pool = createDbPool();
    
    const startTime = performance.now();
    const result = await pool.query('SELECT NOW() as time');
    const endTime = performance.now();
    
    const responseTime = endTime - startTime;
    logger.debug(`Database response time: ${responseTime.toFixed(2)}ms`);
    
    timeline.addEvent('database', 'Database connection test successful', {
      responseTime,
      serverTime: result.rows[0].time
    });
    
    return {
      success: true,
      responseTime,
      serverTime: result.rows[0].time
    };
  } catch (error) {
    const errorMessage = `Database connection error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('database', 'Database connection test failed', {
      error: error.message,
      stack: error.stack
    });
    
    diagnostics.addFinding(
      'critical',
      'Cannot connect to Neon database',
      { error: error.message, stack: error.stack },
      'Check database credentials and network connectivity. Ensure the DATABASE_URL or NEON_DATABASE_URL environment variable is correctly set.'
    );
    
    return {
      success: false,
      error: error.message
    };
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
    
    const startTime = performance.now();
    const result = await pool.query('SELECT COUNT(*) as count FROM jobs');
    const endTime = performance.now();
    
    const count = parseInt(result.rows[0].count, 10);
    const responseTime = endTime - startTime;
    
    timeline.addEvent('database', `Database record count: ${count}`, {
      count,
      responseTime
    });
    
    return {
      success: true,
      count,
      responseTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const errorMessage = `Record count error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('database', 'Database record count failed', {
      error: error.message,
      stack: error.stack
    });
    
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

// Check for recent database inserts
async function checkRecentInserts(timeWindowSeconds = 60) {
  let pool;
  try {
    pool = createDbPool();
    
    const result = await pool.query(`
      SELECT COUNT(*) as count 
      FROM jobs 
      WHERE created_at > NOW() - INTERVAL '${timeWindowSeconds} seconds'
    `);
    
    const count = parseInt(result.rows[0].count, 10);
    
    timeline.addEvent('database', `Recent inserts (last ${timeWindowSeconds}s): ${count}`, {
      count,
      timeWindowSeconds
    });
    
    return {
      success: true,
      count,
      timeWindowSeconds
    };
  } catch (error) {
    const errorMessage = `Recent inserts check error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('database', 'Recent inserts check failed', {
      error: error.message,
      timeWindowSeconds
    });
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Check database write permissions
async function testDatabaseWritePermissions() {
  let pool;
  try {
    pool = createDbPool();
    
    // Create a test record
    const testId = `test-${Date.now()}`;
    const testTitle = `Test Occupation ${Date.now()}`;
    
    // Try to insert a test record
    await pool.query(`
      INSERT INTO jobs (
        occ_code, occ_title, created_at, updated_at
      ) VALUES (
        $1, $2, NOW(), NOW()
      )
      ON CONFLICT (occ_code) 
      DO UPDATE SET 
        occ_title = $2,
        updated_at = NOW()
    `, [testId, testTitle]);
    
    // Verify the record was inserted
    const result = await pool.query(
      'SELECT * FROM jobs WHERE occ_code = $1',
      [testId]
    );
    
    const recordFound = result.rows.length > 0;
    
    // Clean up test record
    await pool.query('DELETE FROM jobs WHERE occ_code = $1', [testId]);
    
    timeline.addEvent('database', 'Database write permissions test', {
      success: recordFound,
      testId
    });
    
    if (recordFound) {
      logger.success('Database write permissions test: SUCCESS');
    } else {
      logger.error('Database write permissions test: FAILED - Record not found after insert');
      
      diagnostics.addFinding(
        'critical',
        'Database write operation failed - Record not found after insert',
        { testId, testTitle },
        'Check database permissions and constraints. The application may have INSERT privileges but the operation might be failing silently.'
      );
    }
    
    return {
      success: recordFound,
      testId
    };
  } catch (error) {
    const errorMessage = `Database write permissions test error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('database', 'Database write permissions test failed', {
      error: error.message,
      stack: error.stack
    });
    
    diagnostics.addFinding(
      'critical',
      'Cannot write to Neon database',
      { error: error.message, stack: error.stack },
      'Check database user permissions. Ensure the database user has INSERT privileges on the jobs table.'
    );
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// Examine database schema
async function examineDatabaseSchema() {
  let pool;
  try {
    pool = createDbPool();
    
    // Check jobs table structure
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'jobs'
    `);
    
    const columns = columnsResult.rows;
    
    // Check primary key
    const pkResult = await pool.query(`
      SELECT a.attname
      FROM   pg_index i
      JOIN   pg_attribute a ON a.attrelid = i.indrelid
                           AND a.attnum = ANY(i.indkey)
      WHERE  i.indrelid = 'jobs'::regclass
      AND    i.indisprimary
    `);
    
    const primaryKey = pkResult.rows.map(row => row.attname);
    
    // Check constraints
    const constraintsResult = await pool.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as def
      FROM pg_constraint
      WHERE conrelid = 'jobs'::regclass
    `);
    
    const constraints = constraintsResult.rows;
    
    timeline.addEvent('database', 'Database schema examination', {
      columns: columns.map(c => `${c.column_name} (${c.data_type})`),
      primaryKey,
      constraints: constraints.map(c => `${c.conname} (${c.def})`)
    });
    
    // Check for required columns
    const requiredColumns = [
      'occ_code',
      'occ_title',
      'employment_2023',
      'median_wage',
      'ai_impact_score'
    ];
    
    const missingColumns = requiredColumns.filter(col => 
      !columns.some(c => c.column_name === col)
    );
    
    if (missingColumns.length > 0) {
      logger.error(`Missing required columns: ${missingColumns.join(', ')}`);
      
      diagnostics.addFinding(
        'critical',
        `Missing required columns in jobs table: ${missingColumns.join(', ')}`,
        { missingColumns, existingColumns: columns.map(c => c.column_name) },
        'The jobs table schema is incorrect. Ensure all required columns exist.'
      );
    }
    
    return {
      success: missingColumns.length === 0,
      columns,
      primaryKey,
      constraints,
      missingColumns
    };
  } catch (error) {
    const errorMessage = `Database schema examination error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('database', 'Database schema examination failed', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

// ========== API OPERATIONS ==========

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
      }
    };
    
    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }
    
    const { response, responseTime } = await fetchWithTimeout(url, fetchOptions);
    const responseData = await response.json().catch(() => null);
    
    const success = response.status === expectedStatus;
    
    timeline.addEvent('api', `API endpoint ${endpoint} test`, {
      method,
      url,
      status: response.status,
      responseTime,
      success
    });
    
    if (!success) {
      logger.error(`API endpoint ${endpoint} returned status ${response.status}, expected ${expectedStatus}`);
    }
    
    return {
      success,
      status: response.status,
      data: responseData,
      responseTime,
      headers: Object.fromEntries(response.headers.entries()),
      url
    };
  } catch (error) {
    const errorMessage = `API endpoint ${endpoint} error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('api', `API endpoint ${endpoint} test failed`, {
      method,
      url: `${config.api.baseUrl}${endpoint}`,
      error: error.message
    });
    
    return {
      success: false,
      error: error.message,
      url: `${config.api.baseUrl}${endpoint}`
    };
  }
}

// Start sync process
async function startSyncProcess() {
  try {
    logger.section('Starting Sync Process');
    
    const result = await testApiEndpoint(
      config.api.endpoints.enhancedSync,
      { method: 'POST', body: { action: 'start' }, expectedStatus: 200 }
    );
    
    if (result.success) {
      logger.success('Sync process started successfully');
      
      timeline.addEvent('sync', 'Sync process started', {
        response: result.data
      });
      
      return {
        success: true,
        data: result.data
      };
    } else {
      logger.error(`Failed to start sync process: ${result.error || `Status ${result.status}`}`);
      
      diagnostics.addFinding(
        'critical',
        'Failed to start sync process',
        { result },
        'Check the enhanced-sync API endpoint and ensure it is functioning correctly.'
      );
      
      return {
        success: false,
        error: result.error || `Status ${result.status}`,
        data: result.data
      };
    }
  } catch (error) {
    const errorMessage = `Start sync process error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('sync', 'Start sync process failed', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Get sync status
async function getSyncStatus() {
  try {
    const result = await testApiEndpoint(config.api.endpoints.syncStatus);
    
    if (result.success) {
      const status = result.data;
      
      // Only add to timeline if there's a change in status
      const lastEvent = timeline.getLatestEvent();
      let shouldAddEvent = true;
      
      if (lastEvent && lastEvent.category === 'sync-status') {
        const lastStatus = lastEvent.details.status;
        
        // Check if there's a meaningful change
        if (lastStatus && 
            status.processedJobs === lastStatus.processedJobs &&
            status.successfulJobs === lastStatus.successfulJobs &&
            status.failedJobs === lastStatus.failedJobs &&
            status.isRunning === lastStatus.isRunning) {
          shouldAddEvent = false;
        }
      }
      
      if (shouldAddEvent) {
        timeline.addEvent('sync-status', `Sync status update`, {
          status,
          responseTime: result.responseTime
        });
      }
      
      return {
        success: true,
        status,
        responseTime: result.responseTime
      };
    } else {
      logger.error(`Failed to get sync status: ${result.error || `Status ${result.status}`}`);
      
      timeline.addEvent('sync-status', 'Get sync status failed', {
        error: result.error || `Status ${result.status}`,
        data: result.data
      });
      
      return {
        success: false,
        error: result.error || `Status ${result.status}`,
        data: result.data
      };
    }
  } catch (error) {
    const errorMessage = `Get sync status error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('sync-status', 'Get sync status failed', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Get database status
async function getDatabaseStatus() {
  try {
    const result = await testApiEndpoint(config.api.endpoints.databaseStatus);
    
    if (result.success) {
      const status = result.data;
      
      timeline.addEvent('database-status', 'Database status update', {
        status,
        responseTime: result.responseTime
      });
      
      return {
        success: true,
        status,
        responseTime: result.responseTime
      };
    } else {
      logger.error(`Failed to get database status: ${result.error || `Status ${result.status}`}`);
      
      timeline.addEvent('database-status', 'Get database status failed', {
        error: result.error || `Status ${result.status}`,
        data: result.data
      });
      
      return {
        success: false,
        error: result.error || `Status ${result.status}`,
        data: result.data
      };
    }
  } catch (error) {
    const errorMessage = `Get database status error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('database-status', 'Get database status failed', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Get system health
async function getSystemHealth() {
  try {
    const result = await testApiEndpoint(config.api.endpoints.systemHealth);
    
    if (result.success) {
      const health = result.data;
      
      timeline.addEvent('system-health', 'System health update', {
        health,
        responseTime: result.responseTime
      });
      
      return {
        success: true,
        health,
        responseTime: result.responseTime
      };
    } else {
      logger.error(`Failed to get system health: ${result.error || `Status ${result.status}`}`);
      
      timeline.addEvent('system-health', 'Get system health failed', {
        error: result.error || `Status ${result.status}`,
        data: result.data
      });
      
      return {
        success: false,
        error: result.error || `Status ${result.status}`,
        data: result.data
      };
    }
  } catch (error) {
    const errorMessage = `Get system health error: ${error.message}`;
    logger.error(errorMessage);
    
    timeline.addEvent('system-health', 'Get system health failed', {
      error: error.message,
      stack: error.stack
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

// ========== MONITORING ==========

// Create a simple dashboard
function createDashboard() {
  if (!config.dashboard.enabled) return null;
  
  // Clear the console
  process.stdout.write('\x1Bc');
  
  // Set up dashboard state
  const dashboardState = {
    syncStatus: null,
    databaseStatus: null,
    databaseRecords: null,
    systemHealth: null,
    recentInserts: null,
    startTime: new Date(),
    lastUpdate: new Date(),
    findings: []
  };
  
  // Update dashboard
  function updateDashboard() {
    // Clear the console
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);
    
    // Calculate elapsed time
    const elapsedMs = new Date() - dashboardState.startTime;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const elapsedMin = Math.floor(elapsedSec / 60);
    const elapsedHrs = Math.floor(elapsedMin / 60);
    
    const elapsedStr = `${elapsedHrs.toString().padStart(2, '0')}:${(elapsedMin % 60).toString().padStart(2, '0')}:${(elapsedSec % 60).toString().padStart(2, '0')}`;
    
    // Header
    console.log('\x1b[1m\x1b[36m=== SYNC PROCESS DEBUGGER DASHBOARD ===\x1b[0m');
    console.log(`Elapsed time: ${elapsedStr} | Last updated: ${dashboardState.lastUpdate.toISOString()}`);
    console.log('');
    
    // Sync Status
    console.log('\x1b[1m\x1b[33mSYNC STATUS:\x1b[0m');
    if (dashboardState.syncStatus && dashboardState.syncStatus.success) {
      const status = dashboardState.syncStatus.status;
      const isRunning = status.isRunning ? '\x1b[32mRUNNING\x1b[0m' : '\x1b[31mSTOPPED\x1b[0m';
      
      console.log(`Status: ${isRunning}`);
      console.log(`Progress: ${status.processedJobs}/${status.totalJobs} jobs (${Math.round((status.processedJobs / Math.max(status.totalJobs, 1)) * 100)}%)`);
      console.log(`Successful: ${status.successfulJobs} | Failed: ${status.failedJobs} | Skipped: ${status.skippedJobs}`);
      
      // Progress bar
      const progressWidth = 50;
      const progressFill = Math.round((status.processedJobs / Math.max(status.totalJobs, 1)) * progressWidth);
      const progressBar = '[' + '='.repeat(progressFill) + ' '.repeat(progressWidth - progressFill) + ']';
      console.log(progressBar);
    } else {
      console.log('\x1b[31mUnable to retrieve sync status\x1b[0m');
    }
    console.log('');
    
    // Database Status
    console.log('\x1b[1m\x1b[33mDATABASE STATUS:\x1b[0m');
    if (dashboardState.databaseStatus && dashboardState.databaseStatus.success) {
      const status = dashboardState.databaseStatus.status;
      const connected = status.connected ? '\x1b[32mCONNECTED\x1b[0m' : '\x1b[31mDISCONNECTED\x1b[0m';
      
      console.log(`Connection: ${connected}`);
      console.log(`Tables: ${status.tables || 'N/A'}`);
      console.log(`Records: ${status.records || 'N/A'}`);
    } else {
      console.log('\x1b[31mUnable to retrieve database status\x1b[0m');
    }
    
    // Database Records
    if (dashboardState.databaseRecords && dashboardState.databaseRecords.success) {
      console.log(`Direct DB Count: ${dashboardState.databaseRecords.count} records`);
    }
    
    // Recent Inserts
    if (dashboardState.recentInserts && dashboardState.recentInserts.success) {
      console.log(`Recent Inserts (last ${dashboardState.recentInserts.timeWindowSeconds}s): ${dashboardState.recentInserts.count}`);
    }
    console.log('');
    
    // System Health
    console.log('\x1b[1m\x1b[33mSYSTEM HEALTH:\x1b[0m');
    if (dashboardState.systemHealth && dashboardState.systemHealth.success) {
      const health = dashboardState.systemHealth.health;
      
      // Display key health metrics
      if (health.database) {
        const dbHealth = health.database.status === 'healthy' ? '\x1b[32mHEALTHY\x1b[0m' : '\x1b[31mUNHEALTHY\x1b[0m';
        console.log(`Database: ${dbHealth}`);
      }
      
      if (health.api) {
        const apiHealth = health.api.status === 'healthy' ? '\x1b[32mHEALTHY\x1b[0m' : '\x1b[31mUNHEALTHY\x1b[0m';
        console.log(`API: ${apiHealth}`);
      }
      
      if (health.sync) {
        const syncHealth = health.sync.status === 'healthy' ? '\x1b[32mHEALTHY\x1b[0m' : '\x1b[31mUNHEALTHY\x1b[0m';
        console.log(`Sync: ${syncHealth}`);
      }
    } else {
      console.log('\x1b[31mUnable to retrieve system health\x1b[0m');
    }
    console.log('');
    
    // Findings
    console.log('\x1b[1m\x1b[33mLATEST FINDINGS:\x1b[0m');
    if (dashboardState.findings.length > 0) {
      // Show the last 5 findings
      const recentFindings = dashboardState.findings.slice(-5);
      
      recentFindings.forEach(finding => {
        let severityColor;
        switch (finding.severity) {
          case 'critical':
            severityColor = '\x1b[41m\x1b[37m'; // White on red background
            break;
          case 'high':
            severityColor = '\x1b[31m'; // Red
            break;
          case 'medium':
            severityColor = '\x1b[33m'; // Yellow
            break;
          case 'low':
            severityColor = '\x1b[36m'; // Cyan
            break;
          case 'info':
            severityColor = '\x1b[32m'; // Green
            break;
          default:
            severityColor = '\x1b[0m'; // Reset
        }
        
        console.log(`${severityColor}[${finding.severity.toUpperCase()}]\x1b[0m ${finding.message}`);
      });
    } else {
      console.log('No findings yet');
    }
    
    // Footer
    console.log('');
    console.log('\x1b[1m\x1b[36m=== Press Ctrl+C to exit and generate reports ===\x1b[0m');
    
    // Update last update time
    dashboardState.lastUpdate = new Date();
  }
  
  // Start dashboard refresh interval
  const dashboardInterval = setInterval(updateDashboard, config.dashboard.refreshRate);
  
  // Initial update
  updateDashboard();
  
  return {
    state: dashboardState,
    update: updateDashboard,
    stop: () => {
      clearInterval(dashboardInterval);
    }
  };
}

// Monitor sync process
async function monitorSyncProcess(options = {}) {
  const {
    startNewSync = true,
    duration = config.monitoring.duration,
    interval = config.monitoring.interval
  } = options;
  
  logger.section('Starting Sync Process Monitoring');
  logger.info(`Monitoring duration: ${duration} seconds`);
  logger.info(`Check interval: ${interval} seconds`);
  
  // Create dashboard
  const dashboard = createDashboard();
  
  // Set up monitoring state
  const monitoringState = {
    startTime: new Date(),
    endTime: new Date(Date.now() + duration * 1000),
    recordCounts: [],
    syncStatuses: [],
    databaseStatuses: [],
    systemHealths: [],
    recentInserts: []
  };
  
  // Initial database connectivity and schema check
  await testDatabaseConnectivity();
  await examineDatabaseSchema();
  await testDatabaseWritePermissions();
  
  // Initial record count
  const initialDbCount = await countDatabaseRecords();
  if (initialDbCount.success) {
    monitoringState.recordCounts.push(initialDbCount);
    logger.info(`Initial database record count: ${initialDbCount.count}`);
    
    // Update dashboard
    if (dashboard) {
      dashboard.state.databaseRecords = initialDbCount;
    }
  }
  
  // Start a new sync process if requested
  if (startNewSync) {
    const syncStartResult = await startSyncProcess();
    
    if (!syncStartResult.success) {
      logger.error('Failed to start sync process, but will continue monitoring');
      
      diagnostics.addFinding(
        'high',
        'Failed to start sync process',
        { result: syncStartResult },
        'Check the enhanced-sync API endpoint and ensure it is functioning correctly.'
      );
    }
  } else {
    logger.info('Skipping sync process start, monitoring existing process');
  }
  
  // Set up monitoring loop
  let isRunning = true;
  let lastRecordCount = initialDbCount.success ? initialDbCount.count : 0;
  let noProgressCounter = 0;
  
  while (new Date() < monitoringState.endTime && isRunning) {
    try {
      // Check sync status
      const syncStatusResult = await getSyncStatus();
      if (syncStatusResult.success) {
        monitoringState.syncStatuses.push(syncStatusResult);
        
        // Update dashboard
        if (dashboard) {
          dashboard.state.syncStatus = syncStatusResult;
        }
        
        // Check if sync is still running
        if (syncStatusResult.status.isRunning === false && monitoringState.syncStatuses.length > 1) {
          logger.info('Sync process has stopped');
          
          // If sync has completed, we can end monitoring early
          if (syncStatusResult.status.endTime) {
            logger.info('Sync process has completed, ending monitoring early');
            isRunning = false;
          }
        }
      }
      
      // Check database status
      const dbStatusResult = await getDatabaseStatus();
      if (dbStatusResult.success) {
        monitoringState.databaseStatuses.push(dbStatusResult);
        
        // Update dashboard
        if (dashboard) {
          dashboard.state.databaseStatus = dbStatusResult;
        }
      }
      
      // Check system health
      const healthResult = await getSystemHealth();
      if (healthResult.success) {
        monitoringState.systemHealths.push(healthResult);
        
        // Update dashboard
        if (dashboard) {
          dashboard.state.systemHealth = healthResult;
        }
      }
      
      // Check database record count
      const currentCount = await countDatabaseRecords();
      if (currentCount.success) {
        monitoringState.recordCounts.push(currentCount);
        
        // Update dashboard
        if (dashboard) {
          dashboard.state.databaseRecords = currentCount;
        }
        
        // Check for record count changes
        if (currentCount.count !== lastRecordCount) {
          const diff = currentCount.count - lastRecordCount;
          if (diff > 0) {
            logger.success(`Database records increased by ${diff} (${lastRecordCount} → ${currentCount.count})`);
            noProgressCounter = 0; // Reset no progress counter
          } else if (diff < 0) {
            logger.warning(`Database records decreased by ${Math.abs(diff)} (${lastRecordCount} → ${currentCount.count})`);
          }
          lastRecordCount = currentCount.count;
        } else {
          noProgressCounter++;
          
          // If no progress for a while, check recent inserts
          if (noProgressCounter >= 5) {
            const recentInsertsResult = await checkRecentInserts(interval * 10);
            monitoringState.recentInserts.push(recentInsertsResult);
            
            // Update dashboard
            if (dashboard) {
              dashboard.state.recentInserts = recentInsertsResult;
            }
            
            if (recentInsertsResult.success && recentInsertsResult.count === 0) {
              logger.warning(`No database inserts in the last ${interval * 10} seconds`);
              
              // After several checks with no progress, add a finding
              if (noProgressCounter === 5) {
                diagnostics.addFinding(
                  'high',
                  'No database records being added despite active sync',
                  { 
                    noProgressChecks: noProgressCounter,
                    currentRecordCount: currentCount.count,
                    syncStatus: monitoringState.syncStatuses[monitoringState.syncStatuses.length - 1]?.status
                  },
                  'The sync process appears to be running but is not inserting records into the database. Check database permissions, sync process implementation, and database connectivity.'
                );
                
                // Update dashboard findings
                if (dashboard) {
                  dashboard.state.findings = diagnostics.findings;
                }
              }
            }
          }
        }
      }
      
      // If sync is running but no records are being added for a long time
      const latestSyncStatus = monitoringState.syncStatuses[monitoringState.syncStatuses.length - 1];
      if (latestSyncStatus && 
          latestSyncStatus.status.isRunning && 
          noProgressCounter >= 10 && 
          latestSyncStatus.status.processedJobs > 0) {
        
        logger.error('Sync process is running and processing jobs but no records are being added to the database');
        
        if (noProgressCounter === 10) {
          diagnostics.addFinding(
            'critical',
            'Sync process is processing jobs but not saving to database',
            { 
              processedJobs: latestSyncStatus.status.processedJobs,
              successfulJobs: latestSyncStatus.status.successfulJobs,
              failedJobs: latestSyncStatus.status.failedJobs,
              databaseRecords: currentCount.success ? currentCount.count : 'unknown'
            },
            'This indicates a critical issue in the sync process where jobs are being processed but not saved to the database. Check the saveJobData method in the BLSSyncService class.'
          );
          
          // Update dashboard findings
          if (dashboard) {
            dashboard.state.findings = diagnostics.findings;
          }
          
          // Perform additional diagnostics
          await testDatabaseWritePermissions();
        }
      }
      
      // Wait for next check
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    } catch (error) {
      logger.error(`Monitoring error: ${error.message}`);
      
      timeline.addEvent('monitoring', 'Monitoring error', {
        error: error.message,
        stack: error.stack
      });
      
      // Wait a bit before continuing
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }
  }
  
  // Stop dashboard
  if (dashboard) {
    dashboard.stop();
  }
  
  // Final record count
  const finalDbCount = await countDatabaseRecords();
  if (finalDbCount.success) {
    monitoringState.recordCounts.push(finalDbCount);
  }
  
  // Calculate record changes
  let recordsAdded = 0;
  if (initialDbCount.success && finalDbCount.success) {
    recordsAdded = finalDbCount.count - initialDbCount.count;
    logger.info(`Total records added during monitoring: ${recordsAdded}`);
    
    if (recordsAdded <= 0) {
      diagnostics.addFinding(
        'critical',
        'No records were added to the database during monitoring',
        { 
          initialCount: initialDbCount.count,
          finalCount: finalDbCount.count,
          monitoringDuration: duration
        },
        'The sync process did not add any records to the database. This indicates a critical issue with the sync process or database connectivity.'
      );
    }
  }
  
  // Generate monitoring summary
  const summary = {
    duration: duration,
    startTime: monitoringState.startTime.toISOString(),
    endTime: new Date().toISOString(),
    initialRecordCount: initialDbCount.success ? initialDbCount.count : null,
    finalRecordCount: finalDbCount.success ? finalDbCount.count : null,
    recordsAdded: recordsAdded,
    syncStatusChecks: monitoringState.syncStatuses.length,
    databaseStatusChecks: monitoringState.databaseStatuses.length,
    recordCountChecks: monitoringState.recordCounts.length,
    findings: diagnostics.findings.length
  };
  
  logger.section('Monitoring Summary');
  logger.info(`Duration: ${duration} seconds`);
  logger.info(`Start time: ${summary.startTime}`);
  logger.info(`End time: ${summary.endTime}`);
  logger.info(`Initial record count: ${summary.initialRecordCount}`);
  logger.info(`Final record count: ${summary.finalRecordCount}`);
  logger.info(`Records added: ${summary.recordsAdded}`);
  logger.info(`Sync status checks: ${summary.syncStatusChecks}`);
  logger.info(`Database status checks: ${summary.databaseStatusChecks}`);
  logger.info(`Record count checks: ${summary.recordCountChecks}`);
  logger.info(`Findings: ${summary.findings}`);
  
  return {
    summary,
    state: monitoringState
  };
}

// ========== REPORT GENERATION ==========

// Generate comprehensive report
function generateReport(monitoringResult) {
  logger.section('Generating Reports');
  
  // Generate timeline report
  const timelineReport = timeline.generateReport();
  const timelineReportPath = saveReport(timelineReport, 'sync-timeline');
  
  // Generate diagnostics report
  const diagnosticsReport = diagnostics.generateReport();
  const diagnosticsReportPath = saveReport(diagnosticsReport, 'sync-diagnostics');
  
  // Generate comprehensive report
  const report = [
    '# Sync Debugger Comprehensive Report\n',
    `Generated: ${new Date().toISOString()}\n`,
    
    '## Monitoring Summary\n',
    `- **Start Time**: ${monitoringResult.summary.startTime}`,
    `- **End Time**: ${monitoringResult.summary.endTime}`,
    `- **Duration**: ${monitoringResult.summary.duration} seconds`,
    `- **Initial Record Count**: ${monitoringResult.summary.initialRecordCount}`,
    `- **Final Record Count**: ${monitoringResult.summary.finalRecordCount}`,
    `- **Records Added**: ${monitoringResult.summary.recordsAdded}`,
    `- **Sync Status Checks**: ${monitoringResult.summary.syncStatusChecks}`,
    `- **Database Status Checks**: ${monitoringResult.summary.databaseStatusChecks}`,
    `- **Record Count Checks**: ${monitoringResult.summary.recordCountChecks}`,
    `- **Findings**: ${monitoringResult.summary.findings}`,
    
    '\n## Database Record Count History\n',
    monitoringResult.state.recordCounts.map(count => {
      if (!count.success) return `- ${count.timestamp}: Error - ${count.error}`;
      return `- ${count.timestamp}: ${count.count} records`;
    }).join('\n'),
    
    '\n## Sync Status History\n',
    monitoringResult.state.syncStatuses.map((result, index) => {
      if (!result.success) return `- Check ${index + 1}: Error - ${result.error}`;
      const status = result.status;
      return `- Check ${index + 1}: Running: ${status.isRunning}, Processed: ${status.processedJobs}/${status.totalJobs}, Success: ${status.successfulJobs}, Failed: ${status.failedJobs}`;
    }).join('\n'),
    
    '\n## Critical Findings\n',
    diagnostics.findings
      .filter(f => f.severity === 'critical')
      .map((finding, index) => {
        return `### ${index + 1}. ${finding.message}\n${finding.recommendation ? `**Recommendation**: ${finding.recommendation}\n` : ''}`;
      }).join('\n\n') || 'No critical findings',
    
    '\n## High Severity Findings\n',
    diagnostics.findings
      .filter(f => f.severity === 'high')
      .map((finding, index) => {
        return `### ${index + 1}. ${finding.message}\n${finding.recommendation ? `**Recommendation**: ${finding.recommendation}\n` : ''}`;
      }).join('\n\n') || 'No high severity findings',
    
    '\n## Root Cause Analysis\n',
    '### Identified Issues',
    diagnostics.findings.length > 0 
      ? diagnostics.findings
          .filter(f => f.severity === 'critical' || f.severity === 'high')
          .map(f => `- ${f.message}`)
          .join('\n')
      : 'No critical or high severity issues identified',
    
    '\n### Potential Root Causes',
    '1. **Database Connectivity Issues**: Problems connecting to the Neon database',
    '2. **Permission Issues**: Lack of proper write permissions to the database',
    '3. **Sync Process Implementation**: Bugs in the sync process implementation',
    '4. **API Endpoint Issues**: Problems with the API endpoints',
    '5. **Network Connectivity**: Network issues between the application and the database',
    
    '\n### Recommended Actions',
    '1. **Check Database Credentials**: Verify DATABASE_URL or NEON_DATABASE_URL is correct',
    '2. **Verify Database Permissions**: Ensure the database user has proper INSERT privileges',
    '3. **Review Sync Process Code**: Examine the saveJobData method in BLSSyncService',
    '4. **Check Network Connectivity**: Verify network connectivity to the Neon database',
    '5. **Monitor Database Logs**: Check Neon database logs for errors',
    '6. **Add Detailed Logging**: Add more detailed logging to the sync process',
    '7. **Implement Transaction Handling**: Ensure proper transaction handling in the sync process',
    
    '\n## Links to Detailed Reports',
    `- [Timeline Report](${timelineReportPath})`,
    `- [Diagnostics Report](${diagnosticsReportPath})`,
  ];
  
  const comprehensiveReportPath = saveReport(report.join('\n'), 'sync-comprehensive');
  
  logger.success(`Comprehensive report saved to ${comprehensiveReportPath}`);
  
  return {
    timelineReportPath,
    diagnosticsReportPath,
    comprehensiveReportPath
  };
}

// ========== MAIN FUNCTION ==========

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  const options = {
    startNewSync: !args.includes('--no-start'),
    verbose: args.includes('--verbose')
  };
  
  // Parse duration
  const durationArg = args.find(arg => arg.startsWith('--duration='));
  if (durationArg) {
    const durationValue = parseInt(durationArg.split('=')[1], 10);
    if (!isNaN(durationValue) && durationValue > 0) {
      options.duration = durationValue;
    }
  }
  
  // Parse interval
  const intervalArg = args.find(arg => arg.startsWith('--interval='));
  if (intervalArg) {
    const intervalValue = parseInt(intervalArg.split('=')[1], 10);
    if (!isNaN(intervalValue) && intervalValue > 0) {
      options.interval = intervalValue;
    }
  }
  
  return options;
}

// Main function
async function main() {
  try {
    // Parse command line arguments
    const options = parseArgs();
    
    // Update config
    config.monitoring.verbose = options.verbose;
    if (options.duration) config.monitoring.duration = options.duration;
    if (options.interval) config.monitoring.interval = options.interval;
    
    // Ensure logs directory exists
    const logsDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Clear log file
    fs.writeFileSync(path.join(__dirname, '..', 'logs', 'sync-debugger.log'), '');
    
    // Log start
    logger.section('Sync Debugger Started');
    logger.info(`Start time: ${new Date().toISOString()}`);
    logger.info(`Options: ${JSON.stringify(options)}`);
    
    // Monitor sync process
    const monitoringResult = await monitorSyncProcess({
      startNewSync: options.startNewSync,
      duration: config.monitoring.duration,
      interval: config.monitoring.interval
    });
    
    // Generate report
    const reportPaths = generateReport(monitoringResult);
    
    // Log end
    logger.section('Sync Debugger Completed');
    logger.info(`End time: ${new Date().toISOString()}`);
    logger.info(`Comprehensive report: ${reportPaths.comprehensiveReportPath}`);
    
    return {
      success: true,
      monitoringResult,
      reportPaths
    };
  } catch (error) {
    logger.error(`Fatal error: ${error.message}`);
    logger.error(error.stack);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run if this script is executed directly
if (require.main === module) {
  main()
    .then(result => {
      if (!result.success) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = {
  main,
  monitorSyncProcess,
  testDatabaseConnectivity,
  testDatabaseWritePermissions,
  countDatabaseRecords,
  getSyncStatus,
  getDatabaseStatus,
  getSystemHealth,
  startSyncProcess
};
