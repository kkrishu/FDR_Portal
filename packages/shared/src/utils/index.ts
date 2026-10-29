/**
 * Shared Utility Functions for FDR Portal
 */

import { createHash, randomBytes, randomInt } from 'crypto';

/**
 * Generate a cryptographically secure random string
 */
export function generateRandomString(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generate a secure random token (URL-safe)
 */
export function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Generate a 6-digit OTP
 */
export function generateOTP(length: number = 6): string {
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += randomInt(0, 10).toString();
  }
  return otp;
}

/**
 * Hash a string using SHA-256
 */
export function hashSHA256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Hash a buffer using SHA-256
 */
export function hashBufferSHA256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Verify a SHA-256 hash
 */
export function verifySHA256(input: string, hash: string): boolean {
  return hashSHA256(input) === hash;
}

/**
 * Generate a hash chain for audit logs
 */
export function generateAuditHash(previousHash: string | undefined, data: unknown): string {
  const input = previousHash ? `${previousHash}${JSON.stringify(data)}` : JSON.stringify(data);
  return hashSHA256(input);
}

/**
 * Format date as ISO string without milliseconds
 */
export function formatISODate(date: Date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Parse date from various formats
 */
export function parseDate(date: string | Date): Date {
  if (date instanceof Date) return date;
  return new Date(date);
}

/**
 * Check if a date is in the past
 */
export function isPast(date: Date): boolean {
  return date < new Date();
}

/**
 * Check if a date is in the future
 */
export function isFuture(date: Date): boolean {
  return date > new Date();
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Add hours to a date
 */
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Add minutes to a date
 */
export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/**
 * Calculate difference in days between two dates
 */
export function diffInDays(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate difference in hours between two dates
 */
export function diffInHours(date1: Date, date2: Date): number {
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60));
}

/**
 * Sanitize string for safe logging (remove sensitive data)
 */
export function sanitizeForLog(input: string): string {
  return input
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD_REDACTED]') // Credit cards
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL_REDACTED]') // Emails
    .replace(/\b\d{10}\b/g, '[PHONE_REDACTED]') // Phone numbers
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g, '[PAN_REDACTED]') // PAN
    .replace(/password["\s:=]+["']?[^"'\s,}]+/gi, 'password="[REDACTED]"')
    .replace(/token["\s:=]+["']?[^"'\s,}]+/gi, 'token="[REDACTED]"')
    .replace(/secret["\s:=]+["']?[^"'\s,}]+/gi, 'secret="[REDACTED]"')
    .replace(/api[_-]?key["\s:=]+["']?[^"'\s,}]+/gi, 'api_key="[REDACTED]"');
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Omit keys from an object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
}

/**
 * Pick keys from an object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) result[key] = obj[key];
  });
  return result;
}

/**
 * Flatten nested object keys with dot notation
 */
export function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else {
      result[newKey] = value;
    }
  }
  
  return result;
}

/**
 * Generate a correlation ID for request tracing
 */
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`;
}

/**
 * Sleep utility for async operations
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
  } = options;
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Chunk array into smaller arrays
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Unique array by key
 */
export function uniqueBy<T>(array: T[], key: keyof T | ((item: T) => string)): T[] {
  const seen = new Set<string>();
  return array.filter(item => {
    const value = typeof key === 'function' ? key(item) : String(item[key]);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T | ((item: T) => string)): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const value = typeof key === 'function' ? key(item) : String(item[key]);
    if (!groups[value]) groups[value] = [];
    groups[value].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Validate PAN format (Indian)
 */
export function isValidPAN(pan: string): boolean {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan);
}

/**
 * Validate IFSC format
 */
export function isValidIFSC(ifsc: string): boolean {
  const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
  return ifscRegex.test(ifsc);
}

/**
 * Validate Aadhaar format (Indian) - basic check
 */
export function isValidAadhaar(aadhaar: string): boolean {
  const aadhaarRegex = /^\d{12}$/;
  return aadhaarRegex.test(aadhaar);
}

/**
 * Format currency in INR
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format number with Indian numbering system (lakhs, crores)
 */
export function formatIndianNumber(num: number): string {
  const trim = (value: number, decimals: number) =>
    value.toFixed(decimals).replace(/\.?0+$/, '');

  if (num >= 10000000) {
    return `${trim(num / 10000000, 2)} Cr`;
  }
  if (num >= 100000) {
    return `${trim(num / 100000, 2)} L`;
  }
  if (num >= 1000) {
    return `${trim(num / 1000, 1)} K`;
  }
  return num.toString();
}

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length - 3)}...`;
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Convert snake_case to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert object keys from snake_case to camelCase
 */
export function keysToCamel<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = snakeToCamel(key);
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[newKey] = keysToCamel(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[newKey] = value.map(item => 
        typeof item === 'object' && item !== null ? keysToCamel(item as Record<string, unknown>) : item
      );
    } else {
      result[newKey] = value;
    }
  }
  return result as T;
}

/**
 * Convert object keys from camelCase to snake_case
 */
export function keysToSnake<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = camelToSnake(key);
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      result[newKey] = keysToSnake(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[newKey] = value.map(item => 
        typeof item === 'object' && item !== null ? keysToSnake(item as Record<string, unknown>) : item
      );
    } else {
      result[newKey] = value;
    }
  }
  return result as T;
}

/**
 * Calculate risk score based on flags
 */
export function calculateRiskScore(flags: Array<{ severity: string }>): number {
  const severityWeights = {
    BLOCK: 30,
    WARNING: 15,
    INFO: 5,
  };
  
  const score = flags.reduce((sum, flag) => {
    return sum + (severityWeights[flag.severity as keyof typeof severityWeights] || 0);
  }, 0);
  
  return Math.min(score, 100);
}

/**
 * Get risk level from score
 */
export function getRiskLevel(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

/**
 * Format duration in human readable format
 */
export function formatDuration(ms: number): string {
  const trim = (value: number) => value.toFixed(1).replace(/\.0$/, '');
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${trim(ms / 1000)}s`;
  if (ms < 3600000) return `${trim(ms / 60000)}m`;
  if (ms < 86400000) return `${trim(ms / 3600000)}h`;
  return `${trim(ms / 86400000)}d`;
}

/**
 * Check if object is empty
 */
export function isEmpty(obj: unknown): boolean {
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(obj)) return obj.length === 0;
  if (typeof obj === 'object') return Object.keys(obj).length === 0;
  if (typeof obj === 'string') return obj.trim() === '';
  return false;
}

/**
 * Safe JSON parse
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}