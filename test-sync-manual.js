/**
 * test-sync-manual.js
 * 
 * This script tests the manual sync process for the JobAIRiskAnalyzer-6g application.
 * It simulates what happens when clicking the "Start Sync" button in the admin dashboard,
 * and then monitors the progress to help debug why sync numbers aren't updating.
 * 
 * Usage:
 * 1. Save this file in your project directory
 * 2. Run with Node.js: node test-sync-manual.js
 * 3. Watch the console for real-time sync progress and debugging information
 */

// Import required modules
const fetch = require('node-fetch');
const chalk = require('chalk'); // For colored console output (optional)

// Configuration
const BASE_URL = 'https://job-ai-risk-analyzer-6g.vercel.app';
const SYNC_START_ENDPOINT = '/api/admin/enhanced-sync';
const SYNC_STATUS_ENDPOINT = '/api/admin/sync-status';
const POLL_INTERVAL_MS = 3000; // 3 seconds, same as dashboard
const MAX_POLL_ATTEMPTS = 100; // Stop after ~5 minutes if no progress

// Utility functions for console output
const log = {
  info: (msg) => console.log(chalk.blue(`ℹ️ ${msg}`)),
  success: (msg) => console.log(chalk.green(`✅ ${msg}`)),
  error: (msg) => console.log(chalk.red(`❌ ${msg}`)),
  warning: (msg) => console.log(chalk.yellow(`⚠️ ${msg}`)),
  debug: (msg) => console.log(chalk.gray(`🔍 ${msg}`)),
  progress: (current, total) => {
    const percent = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    console.log(`${bar} ${percent}% | ${current}/${total}`);
  }
};

/**
 * Start the enhanced sync process
 * This simulates clicking the "Start Sync" button in the admin dashboard
 */
async function startSync() {
  log.info('Starting enhanced sync process...');
  
  try {
    const response = await fetch(`${BASE_URL}${SYNC_START_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        forceRestart: true,
        maxConcurrent: 5,
        batchSize: 50,
      }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      log.success('Sync started successfully!');
      log.debug(`Response: ${JSON.stringify(data, null, 2)}`);
      
      // Check initial status
      if (data.initialStatus) {
        log.info('Initial sync status:');
        log.info(`- Total Jobs: ${data.initialStatus.totalJobs}`);
        log.info(`- Running: ${data.initialStatus.isRunning ? 'Yes' : 'No'}`);
        
        // Return initial status for monitoring
        return {
          success: true,
          initialStatus: data.initialStatus,
        };
      } else {
        log.warning('No initial status returned from sync start');
        return { success: true };
      }
    } else {
      log.error(`Failed to start sync: ${data.message || 'Unknown error'}`);
      log.debug(`Error details: ${JSON.stringify(data, null, 2)}`);
      return {
        success: false,
        error: data.message || 'Unknown error',
      };
    }
  } catch (error) {
    log.error(`Exception when starting sync: ${error.message}`);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Get the current sync status
 * This simulates the dashboard polling for updates
 */
async function getSyncStatus() {
  try {
    const response = await fetch(`${BASE_URL}${SYNC_STATUS_ENDPOINT}`);
    const data = await response.json();
    
    // Check if we got a valid response
    if (!data || (data.success === false)) {
      log.error(`Failed to get sync status: ${data?.message || 'Unknown error'}`);
      return null;
    }
    
    // Handle different response formats
    // Some endpoints return data directly, others nested in syncState
    const status = data.syncState || data;
    
    return status;
  } catch (error) {
    log.error(`Exception when getting sync status: ${error.message}`);
    return null;
  }
}

/**
 * Monitor sync progress at regular intervals
 * This simulates the dashboard's real-time updates
 */
async function monitorSyncProgress() {
  let attempts = 0;
  let lastProcessed = -1;
  let noProgressCount = 0;
  
  log.info('Starting sync monitoring...');
  
  const interval = setInterval(async () => {
    attempts++;
    const status = await getSyncStatus();
    
    if (!status) {
      log.error('Failed to get sync status');
      noProgressCount++;
    } else {
      // Display current status
      console.log('\n' + '-'.repeat(50));
      log.info(`SYNC STATUS UPDATE (#${attempts}):`);
      log.info(`Running: ${status.isRunning ? 'Yes' : 'No'}`);
      log.info(`Total Jobs: ${status.totalJobs}`);
      log.info(`Processed: ${status.processedJobs}`);
      log.info(`Successful: ${status.successfulJobs}`);
      log.info(`Failed: ${status.failedJobs}`);
      
      if (status.skippedJobs) {
        log.warning(`Skipped: ${status.skippedJobs} (already had AI analysis)`);
      }
      
      if (status.currentJob) {
        log.info(`Current Job: ${status.currentJob}`);
      }
      
      // Show progress bar
      if (status.totalJobs > 0) {
        log.progress(status.processedJobs, status.totalJobs);
      }
      
      // Check for errors
      if (status.lastError) {
        log.error(`Last Error: ${status.lastError}`);
        log.error(`Error Time: ${status.lastErrorTime}`);
      }
      
      // Check API key status
      if (status.apiKeysStatus) {
        log.info(`API Keys: ${status.apiKeysStatus.totalKeys} (${status.apiKeysStatus.totalRemainingRequests} requests remaining)`);
      }
      
      // Enhanced details
      if (status.enhancedDetails) {
        const details = status.enhancedDetails;
        if (details.currentBatch && details.totalBatches) {
          log.info(`Batch Progress: ${details.currentBatch}/${details.totalBatches}`);
        }
        if (details.estimatedTimeRemaining) {
          const minutes = Math.round(details.estimatedTimeRemaining / 60000);
          log.info(`Estimated Time Remaining: ${minutes} minutes`);
        }
      }
      
      // Check if there's been progress
      if (status.processedJobs === lastProcessed) {
        noProgressCount++;
        if (noProgressCount >= 5) {
          log.warning(`No progress for ${noProgressCount} consecutive checks!`);
          
          // After 10 checks with no progress, provide debugging help
          if (noProgressCount === 10) {
            log.error('\nDEBUGGING HELP:');
            log.error('1. Check if jobs are being skipped (already have AI analysis)');
            log.error('2. Check server logs for errors in the sync process');
            log.error('3. Verify BLS API keys are valid and not rate limited');
            log.error('4. Check database connection and permissions');
          }
        }
      } else {
        noProgressCount = 0;
      }
      
      lastProcessed = status.processedJobs;
      
      // Stop monitoring if sync is complete or we've reached max attempts
      if (!status.isRunning || attempts >= MAX_POLL_ATTEMPTS) {
        clearInterval(interval);
        
        if (!status.isRunning) {
          log.success('\nSync process completed!');
          log.success(`Final Stats: ${status.successfulJobs} successful, ${status.failedJobs} failed, ${status.skippedJobs || 0} skipped`);
        } else {
          log.warning('\nReached maximum monitoring time, sync may still be running');
        }
        
        // Check for potential issues
        if (status.processedJobs === 0) {
          log.error('\nPOTENTIAL ISSUE: No jobs were processed!');
          log.error('This could be due to:');
          log.error('1. All jobs already have AI analysis (check skipped count)');
          log.error('2. BLS API keys are invalid or rate limited');
          log.error('3. Sync process is encountering errors before processing jobs');
        }
        
        if (status.skippedJobs > 0 && status.skippedJobs === status.totalJobs) {
          log.warning('\nAll jobs were skipped! This means every job already has AI analysis.');
          log.warning('To force reprocessing, you may need to:');
          log.warning('1. Modify the checkExistingJob function to not skip jobs with AI analysis');
          log.warning('2. Or temporarily clear AI impact scores in the database');
        }
      }
    }
    
    // If we can't get status for several attempts, stop monitoring
    if (noProgressCount >= 15) {
      clearInterval(interval);
      log.error('\nStopping monitoring due to repeated failures to get sync status');
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Main function to run the test
 */
async function runTest() {
  console.log(chalk.bold.blue('\n=== JobAIRiskAnalyzer-6g Sync Test ===\n'));
  
  // Step 1: Start the sync process
  const startResult = await startSync();
  
  if (!startResult.success) {
    log.error('Failed to start sync process. Test aborted.');
    return;
  }
  
  // Step 2: Monitor progress
  await monitorSyncProgress();
}

// Run the test
runTest().catch(error => {
  log.error(`Unhandled exception: ${error.message}`);
  log.error(error.stack);
});
