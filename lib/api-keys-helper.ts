/**
 * BLS API Keys Helper
 * 
 * Utility functions for loading and validating BLS API keys from environment variables.
 * This helper automatically filters out invalid keys based on format validation.
 */

/**
 * Typical BLS API key format is a 32-character alphanumeric string
 * Examples of valid keys: "60239f8eca874ce8be93238a358c4c09"
 */
const VALID_KEY_PATTERN = /^[a-zA-Z0-9]{32}$/;

/**
 * Known invalid key patterns to explicitly filter out
 */
const KNOWN_INVALID_PATTERNS = [
  // These are examples of invalid key formats we've seen
  /^[a-zA-Z0-9]{64}$/, // 64-character keys are invalid for BLS
];

/**
 * Cache of previously validated keys to avoid repeated validation
 */
const validationCache: Record<string, boolean> = {};

/**
 * Validates a BLS API key format
 * @param key The API key to validate
 * @returns boolean indicating if the key format is valid
 */
export function isValidKeyFormat(key: string): boolean {
  // Check cache first
  if (validationCache[key] !== undefined) {
    return validationCache[key];
  }

  // Skip empty keys
  if (!key || key.trim().length === 0) {
    validationCache[key] = false;
    return false;
  }

  // Check against known invalid patterns
  for (const pattern of KNOWN_INVALID_PATTERNS) {
    if (pattern.test(key)) {
      validationCache[key] = false;
      return false;
    }
  }

  // Check against valid pattern
  const isValid = VALID_KEY_PATTERN.test(key);
  validationCache[key] = isValid;
  return isValid;
}

/**
 * Loads all BLS API keys from environment variables
 * @param filterInvalid Whether to filter out keys with invalid format
 * @returns Array of API keys
 */
export function loadBLSApiKeys(filterInvalid = true): string[] {
  const keys: string[] = [];
  
  // Get all environment variables
  const env = process.env;
  
  // Find all BLS API key environment variables
  for (const key in env) {
    if (key === 'BLS_API_KEY' || key.startsWith('BLS_API_KEY_')) {
      const apiKey = env[key];
      
      // Skip empty keys
      if (!apiKey || apiKey.trim().length === 0) {
        continue;
      }
      
      // Add key if it's valid or if we're not filtering
      if (!filterInvalid || isValidKeyFormat(apiKey)) {
        keys.push(apiKey);
      } else {
        console.warn(`⚠️ Skipping invalid BLS API key format in ${key}`);
      }
    }
  }
  
  return keys;
}

/**
 * Gets a count of valid BLS API keys in environment
 * @returns Number of valid API keys
 */
export function getValidKeyCount(): number {
  return loadBLSApiKeys(true).length;
}

/**
 * Logs information about available BLS API keys
 */
export function logApiKeyInfo(): void {
  const allKeys = loadBLSApiKeys(false);
  const validKeys = allKeys.filter(isValidKeyFormat);
  
  console.log(`🔑 BLS API Keys: ${validKeys.length} valid / ${allKeys.length} total`);
  
  validKeys.forEach((key, index) => {
    // Only show first 4 characters for security
    console.log(`  ✅ Key ${index + 1}: ${key.substring(0, 4)}...`);
  });
  
  const invalidKeys = allKeys.filter(key => !isValidKeyFormat(key));
  invalidKeys.forEach((key, index) => {
    // Only show first 4 characters for security
    console.log(`  ❌ Invalid Key ${index + 1}: ${key.substring(0, 4)}...`);
  });
}

/**
 * Initializes the BLS API key system
 * @returns Array of valid API keys
 */
export function initializeBLSApiKeys(): string[] {
  const validKeys = loadBLSApiKeys(true);
  
  if (validKeys.length === 0) {
    console.warn('⚠️ No valid BLS API keys found. Please check your environment variables.');
    console.warn('   Register for BLS API keys at: https://data.bls.gov/registrationEngine/');
  } else {
    console.log(`✅ Successfully loaded ${validKeys.length} valid BLS API key(s)`);
  }
  
  return validKeys;
}
