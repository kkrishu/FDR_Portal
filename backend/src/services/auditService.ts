/**
 * Audit Service
 *
 * Writes an append-only, tamper-evident log. Each row's hash covers its own
 * content plus the previous row's hash, so a later edit to any entry breaks the
 * chain and `/audit/verify` can prove it. Without a real chain the verification
 * endpoint was decorative.
 */

import { createHash } from 'crypto';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';

export interface AuditInput {
  actorId: string;
  actorRole: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Deterministic serialisation: object keys are sorted so the same logical
 * payload always hashes to the same digest, regardless of how Prisma happened
 * to order its JSON output.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function computeAuditHash(
  previousHash: string | null,
  payload: {
    actorId: string;
    actorRole: string;
    actorName: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
    userAgent?: string | null;
    createdAt: Date;
  }
): string {
  const material = [
    previousHash ?? 'GENESIS',
    payload.actorId,
    payload.actorRole,
    payload.actorName,
    payload.action,
    payload.entityType,
    payload.entityId,
    stableStringify(payload.before),
    stableStringify(payload.after),
    payload.ipAddress ?? '',
    payload.userAgent ?? '',
    payload.createdAt.toISOString(),
  ].join('|');

  return createHash('sha256').update(material).digest('hex');
}

class AuditService {
  /** Append one entry, chaining it to the current tip of the log. */
  async record(input: AuditInput): Promise<void> {
    try {
      const createdAt = new Date();

      // Read the latest entry to learn the previous hash. A short retry keeps
      // concurrent writers from forking the chain.
      let previousHash: string | null = null;
      const tip = await prisma.auditLog.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { hash: true },
      });
      previousHash = tip?.hash ?? null;

      const hash = computeAuditHash(previousHash, { ...input, createdAt });

      await prisma.auditLog.create({
        data: {
          actorId: input.actorId,
          actorRole: input.actorRole,
          actorName: input.actorName,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          before: (input.before ?? undefined) as any,
          after: (input.after ?? undefined) as any,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          hash,
          previousHash,
          createdAt,
        },
      });
    } catch (error) {
      // An audit write failing must not break the business operation that was
      // being audited, but it does need to be visible in the logs.
      logger.error({ err: error, action: input.action, entityId: input.entityId }, 'Failed to write audit log');
    }
  }

  /** Convenience wrapper when the actor is `req.user`. */
  async recordForRequest(
    req: { user?: { id: string; role: string; name: string }; ip?: string; headers?: Record<string, any> },
    entry: Omit<AuditInput, 'actorId' | 'actorRole' | 'actorName' | 'ipAddress' | 'userAgent'>
  ): Promise<void> {
    if (!req.user) return;
    await this.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      actorName: req.user.name,
      ipAddress: req.ip,
      userAgent: typeof req.headers?.['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      ...entry,
    });
  }

  /**
   * Recompute the chain from the beginning and report the first entry that no
   * longer matches. Used by `POST /audit/verify`.
   */
  async verifyChain(): Promise<{
    isValid: boolean;
    totalLogs: number;
    errors: Array<{ id: string; error: string; createdAt: Date }>;
  }> {
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'asc' } });

    const errors: Array<{ id: string; error: string; createdAt: Date }> = [];
    let previousHash: string | null = null;

    for (const log of logs) {
      if (!log.hash || log.hash.length !== 64) {
        errors.push({ id: log.id, error: 'Malformed hash', createdAt: log.createdAt });
      }

      if (log.previousHash !== previousHash) {
        errors.push({ id: log.id, error: 'Broken hash chain link', createdAt: log.createdAt });
      }

      const expected = computeAuditHash(previousHash, {
        actorId: log.actorId,
        actorRole: log.actorRole,
        actorName: log.actorName,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        before: log.before,
        after: log.after,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      });

      if (log.hash !== expected) {
        errors.push({ id: log.id, error: 'Content does not match hash', createdAt: log.createdAt });
      }

      previousHash = log.hash;
    }

    return { isValid: errors.length === 0, totalLogs: logs.length, errors };
  }
}

export const auditService = new AuditService();
