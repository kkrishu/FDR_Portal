import { z } from 'zod';

/**
 * Mirrors `passwordSchema` in `packages/shared/src/validators/index.ts`.
 * Keep the two in sync — the server is the authority and will reject anything
 * that fails these rules.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { id: 'upper', label: 'One uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { id: 'lower', label: 'One lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { id: 'number', label: 'One number', test: (v: string) => /[0-9]/.test(v) },
  {
    id: 'special',
    label: 'One special character',
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
  },
] as const;

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export function passwordScore(value: string): number {
  return PASSWORD_RULES.filter((rule) => rule.test(value)).length;
}
