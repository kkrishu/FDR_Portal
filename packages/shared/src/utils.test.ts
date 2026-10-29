import { describe, it, expect } from '@jest/globals';
import { 
  generateRandomString,
  generateSecureToken,
  generateOTP,
  hashSHA256,
  verifySHA256,
  generateAuditHash,
  formatISODate,
  parseDate,
  isPast,
  isFuture,
  addDays,
  addHours,
  addMinutes,
  diffInDays,
  diffInHours,
  sanitizeForLog,
  deepClone,
  omit,
  pick,
  flattenObject,
  generateCorrelationId,
  sleep,
  retry,
  chunkArray,
  uniqueBy,
  groupBy,
  isValidEmail,
  isValidPAN,
  isValidIFSC,
  isValidAadhaar,
  formatINR,
  formatIndianNumber,
  truncate,
  titleCase,
  snakeToCamel,
  camelToSnake,
  keysToCamel,
  keysToSnake,
  calculateRiskScore,
  getRiskLevel,
  formatDuration,
  isEmpty,
  safeJsonParse,
} from './utils';

describe('Utility Functions', () => {
  describe('generateRandomString', () => {
    it('generates string of specified length', () => {
      expect(generateRandomString(32)).toHaveLength(64); // hex = 2 chars per byte
      expect(generateRandomString(16)).toHaveLength(32);
    });

    it('generates unique strings', () => {
      const s1 = generateRandomString(32);
      const s2 = generateRandomString(32);
      expect(s1).not.toBe(s2);
    });
  });

  describe('generateSecureToken', () => {
    it('generates URL-safe base64 token', () => {
      const token = generateSecureToken(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThan(0);
    });
  });

  describe('generateOTP', () => {
    it('generates 6-digit OTP by default', () => {
      const otp = generateOTP();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('generates OTP of specified length', () => {
      const otp = generateOTP(4);
      expect(otp).toMatch(/^\d{4}$/);
    });
  });

  describe('hashSHA256', () => {
    it('produces consistent 64-char hex output', () => {
      const hash = hashSHA256('test');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('produces same hash for same input', () => {
      expect(hashSHA256('test')).toBe(hashSHA256('test'));
    });

    it('produces different hash for different input', () => {
      expect(hashSHA256('test1')).not.toBe(hashSHA256('test2'));
    });
  });

  describe('verifySHA256', () => {
    it('returns true for matching input and hash', () => {
      const hash = hashSHA256('test');
      expect(verifySHA256('test', hash)).toBe(true);
    });

    it('returns false for non-matching input', () => {
      const hash = hashSHA256('test');
      expect(verifySHA256('wrong', hash)).toBe(false);
    });
  });

  describe('generateAuditHash', () => {
    it('generates hash with previous hash', () => {
      const hash1 = generateAuditHash(undefined, { action: 'CREATE' });
      const hash2 = generateAuditHash(hash1, { action: 'UPDATE' });
      expect(hash1).toHaveLength(64);
      expect(hash2).toHaveLength(64);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('date utilities', () => {
    const testDate = new Date('2024-06-15T10:30:00Z');

    it('formatISODate returns ISO string without milliseconds', () => {
      expect(formatISODate(testDate)).toBe('2024-06-15T10:30:00Z');
    });

    it('parseDate handles Date objects', () => {
      expect(parseDate(testDate)).toEqual(testDate);
    });

    it('parseDate handles ISO strings', () => {
      expect(parseDate('2024-06-15T10:30:00Z')).toEqual(testDate);
    });

    it('isPast returns true for past dates', () => {
      expect(isPast(new Date('2020-01-01'))).toBe(true);
    });

    it('isFuture returns true for future dates', () => {
      expect(isFuture(new Date('2030-01-01'))).toBe(true);
    });

    it('addDays adds days correctly', () => {
      const result = addDays(testDate, 5);
      expect(result.getDate()).toBe(20);
    });

    it('addHours adds hours correctly', () => {
      const result = addHours(testDate, 3);
      expect(result.getUTCHours()).toBe(13);
    });

    it('addMinutes adds minutes correctly', () => {
      const result = addMinutes(testDate, 30);
      expect(result.getUTCMinutes()).toBe(0);
    });

    it('diffInDays calculates difference correctly', () => {
      expect(diffInDays(new Date('2024-01-01'), new Date('2024-01-10'))).toBe(9);
    });

    it('diffInHours calculates difference correctly', () => {
      expect(diffInHours(new Date('2024-01-01T10:00:00Z'), new Date('2024-01-01T13:00:00Z'))).toBe(3);
    });
  });

  describe('sanitizeForLog', () => {
    it('redacts credit card numbers', () => {
      expect(sanitizeForLog('Card: 1234 5678 9012 3456')).toContain('[CARD_REDACTED]');
    });

    it('redacts emails', () => {
      expect(sanitizeForLog('Email: test@example.com')).toContain('[EMAIL_REDACTED]');
    });

    it('redacts phone numbers', () => {
      expect(sanitizeForLog('Phone: 9876543210')).toContain('[PHONE_REDACTED]');
    });

    it('redacts PAN numbers', () => {
      expect(sanitizeForLog('PAN: ABCDE1234F')).toContain('[PAN_REDACTED]');
    });

    it('redacts passwords', () => {
      expect(sanitizeForLog('password=secret123')).toContain('password="[REDACTED]"');
    });

    it('redacts tokens', () => {
      expect(sanitizeForLog('token=abc123')).toContain('token="[REDACTED]"');
    });
  });

  describe('deepClone', () => {
    it('creates deep copy of object', () => {
      const original = { a: 1, b: { c: 2 } };
      const cloned = deepClone(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.b).not.toBe(original.b);
    });
  });

  describe('omit', () => {
    it('removes specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('pick', () => {
    it('keeps only specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('flattenObject', () => {
    it('flattens nested object with dot notation', () => {
      const obj = { a: { b: { c: 1 } }, d: 2 };
      expect(flattenObject(obj)).toEqual({ 'a.b.c': 1, d: 2 });
    });
  });

  describe('generateCorrelationId', () => {
    it('generates unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe('sleep', () => {
    it('resolves after specified time', async () => {
      const start = Date.now();
      await sleep(50);
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });

  describe('retry', () => {
    it('retries on failure', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'success';
      };
      const result = await retry(fn, { maxAttempts: 3, baseDelay: 10 });
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('throws after max attempts', async () => {
      const fn = async () => { throw new Error('fail'); };
      await expect(retry(fn, { maxAttempts: 2, baseDelay: 10 })).rejects.toThrow('fail');
    });
  });

  describe('chunkArray', () => {
    it('chunks array into specified size', () => {
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });
  });

  describe('uniqueBy', () => {
    it('removes duplicates by key', () => {
      const arr = [{ id: 1 }, { id: 2 }, { id: 1 }, { id: 3 }];
      expect(uniqueBy(arr, 'id')).toHaveLength(3);
    });
  });

  describe('groupBy', () => {
    it('groups array by key', () => {
      const arr = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }];
      const grouped = groupBy(arr, 'type');
      expect(grouped.a).toHaveLength(2);
      expect(grouped.b).toHaveLength(1);
    });
  });

  describe('validation utilities', () => {
    it('isValidEmail validates email format', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('test@')).toBe(false);
    });

    it('isValidPAN validates PAN format', () => {
      expect(isValidPAN('ABCDE1234F')).toBe(true);
      expect(isValidPAN('abcde1234f')).toBe(false);
      expect(isValidPAN('ABCDE1234')).toBe(false);
    });

    it('isValidIFSC validates IFSC format', () => {
      expect(isValidIFSC('SBIN0001234')).toBe(true);
      expect(isValidIFSC('SBIN000123')).toBe(false);
      expect(isValidIFSC('sbin0001234')).toBe(false);
    });

    it('isValidAadhaar validates Aadhaar format', () => {
      expect(isValidAadhaar('123456789012')).toBe(true);
      expect(isValidAadhaar('12345678901')).toBe(false);
      expect(isValidAadhaar('abcdefghijkl')).toBe(false);
    });
  });

  describe('formatINR', () => {
    it('formats currency in INR', () => {
      expect(formatINR(1000)).toBe('₹1,000');
      expect(formatINR(100000)).toBe('₹1,00,000');
      expect(formatINR(1234567.89)).toBe('₹12,34,567.89');
    });
  });

  describe('formatIndianNumber', () => {
    it('formats with Indian notation', () => {
      expect(formatIndianNumber(1000)).toBe('1 K');
      expect(formatIndianNumber(100000)).toBe('1 L');
      expect(formatIndianNumber(10000000)).toBe('1 Cr');
    });
  });

  describe('truncate', () => {
    it('truncates long strings', () => {
      expect(truncate('Hello World', 8)).toBe('Hello...');
      expect(truncate('Hi', 10)).toBe('Hi');
    });
  });

  describe('titleCase', () => {
    it('capitalizes each word', () => {
      expect(titleCase('hello world')).toBe('Hello World');
      expect(titleCase('HELLO WORLD')).toBe('Hello World');
    });
  });

  describe('snakeToCamel / camelToSnake', () => {
    it('converts snake_case to camelCase', () => {
      expect(snakeToCamel('hello_world')).toBe('helloWorld');
      expect(snakeToCamel('api_key')).toBe('apiKey');
    });

    it('converts camelCase to snake_case', () => {
      expect(camelToSnake('helloWorld')).toBe('hello_world');
      expect(camelToSnake('apiKey')).toBe('api_key');
    });
  });

  describe('keysToCamel / keysToSnake', () => {
    it('converts object keys to camelCase', () => {
      const obj = { first_name: 'John', last_name: 'Doe' };
      expect(keysToCamel(obj)).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('converts object keys to snake_case', () => {
      const obj = { firstName: 'John', lastName: 'Doe' };
      expect(keysToSnake(obj)).toEqual({ first_name: 'John', last_name: 'Doe' });
    });

    it('handles nested objects', () => {
      const obj = { user_info: { first_name: 'John' } };
      expect(keysToCamel(obj)).toEqual({ userInfo: { firstName: 'John' } });
    });
  });

  describe('calculateRiskScore', () => {
    it('calculates score based on flag severity', () => {
      const flags = [
        { severity: 'BLOCK' },
        { severity: 'WARNING' },
        { severity: 'INFO' },
      ];
      expect(calculateRiskScore(flags)).toBe(50); // 30 + 15 + 5
    });

    it('caps score at 100', () => {
      const flags = Array(10).fill({ severity: 'BLOCK' });
      expect(calculateRiskScore(flags)).toBe(100);
    });
  });

  describe('getRiskLevel', () => {
    it('returns correct risk level', () => {
      expect(getRiskLevel(80)).toBe('HIGH');
      expect(getRiskLevel(50)).toBe('MEDIUM');
      expect(getRiskLevel(20)).toBe('LOW');
    });
  });

  describe('formatDuration', () => {
    it('formats milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('formats seconds', () => {
      expect(formatDuration(5000)).toBe('5s');
    });

    it('formats minutes', () => {
      expect(formatDuration(120000)).toBe('2m');
    });

    it('formats hours', () => {
      expect(formatDuration(7200000)).toBe('2h');
    });

    it('formats days', () => {
      expect(formatDuration(172800000)).toBe('2d');
    });
  });

  describe('isEmpty', () => {
    it('returns true for null/undefined', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
    });

    it('returns true for empty arrays/objects/strings', () => {
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('   ')).toBe(true);
    });

    it('returns false for non-empty values', () => {
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty('hello')).toBe(false);
    });
  });

  describe('safeJsonParse', () => {
    it('parses valid JSON', () => {
      expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    });

    it('returns fallback for invalid JSON', () => {
      expect(safeJsonParse('invalid', { fallback: true })).toEqual({ fallback: true });
    });
  });
});