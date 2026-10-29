import { describe, it, expect } from '@jest/globals';
import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatDateTime,
  truncate,
  generateId,
  sleep,
  debounce,
  getInitials,
  getStatusColor,
  getRoleColor,
  cn,
} from '../utils';

describe('Utility Functions', () => {
  describe('formatCurrency', () => {
    it('formats currency in INR format', () => {
      expect(formatCurrency(1000)).toBe('₹1,000');
      expect(formatCurrency(100000)).toBe('₹1,00,000');
      expect(formatCurrency(10000000)).toBe('₹1,00,00,000');
      expect(formatCurrency(1234567.89)).toBe('₹12,34,567.89');
    });
  });

  describe('formatNumber', () => {
    it('formats numbers with Indian notation', () => {
      expect(formatNumber(1000)).toBe('1 K');
      expect(formatNumber(100000)).toBe('1 L');
      expect(formatNumber(10000000)).toBe('1 Cr');
      expect(formatNumber(12345678)).toBe('1.23 Cr');
    });
  });

  describe('formatDate', () => {
    it('formats date in Indian locale', () => {
      const date = new Date('2024-03-15');
      expect(formatDate(date)).toBe('15 Mar 2024');
    });
  });

  describe('formatDateTime', () => {
    it('formats date and time in Indian locale', () => {
      const date = new Date('2024-03-15T14:30:00');
      expect(formatDateTime(date)).toContain('15 Mar 2024');
      expect(formatDateTime(date)).toContain('2:30');
    });
  });

  describe('truncate', () => {
    it('truncates long strings', () => {
      expect(truncate('Hello World', 8)).toBe('Hello...');
      expect(truncate('Hi', 10)).toBe('Hi');
    });
  });

  describe('generateId', () => {
    it('generates unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe('sleep', () => {
    it('resolves after specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });
  });

  describe('debounce', () => {
    it('delays function execution', async () => {
      let callCount = 0;
      const debouncedFn = debounce(() => {
        callCount++;
      }, 50);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      expect(callCount).toBe(0);

      await sleep(60);
      expect(callCount).toBe(1);
    });
  });

  describe('getInitials', () => {
    it('extracts initials from name', () => {
      expect(getInitials('John Doe')).toBe('JD');
      expect(getInitials('Alice')).toBe('A');
      expect(getInitials('A B C')).toBe('AB');
    });
  });

  describe('getStatusColor', () => {
    it('returns correct color for status', () => {
      expect(getStatusColor('VERIFIED')).toBe('success');
      expect(getStatusColor('FLAGGED')).toBe('destructive');
      expect(getStatusColor('AWAITING_BANK_VERIFICATION')).toBe('warning');
      expect(getStatusColor('DRAFT')).toBe('secondary');
      expect(getStatusColor('UNKNOWN')).toBe('secondary');
    });
  });

  describe('getRoleColor', () => {
    it('returns correct color for role', () => {
      expect(getRoleColor('INSTITUTION')).toBe('blue');
      expect(getRoleColor('OFFICER')).toBe('purple');
      expect(getRoleColor('ADMIN')).toBe('red');
      expect(getRoleColor('BANK_MANAGER')).toBe('green');
      expect(getRoleColor('NODAL_OFFICER')).toBe('teal');
      expect(getRoleColor('AUDITOR')).toBe('orange');
      expect(getRoleColor('UNKNOWN')).toBe('gray');
    });
  });

  describe('cn (classnames)', () => {
    it('combines class names correctly', () => {
      expect(cn('a', 'b', 'c')).toBe('a b c');
      expect(cn('a', false && 'b', 'c')).toBe('a c');
      expect(cn('a', null, undefined, 'b')).toBe('a b');
    });
  });
});
