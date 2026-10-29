/**
 * Dashboard Routes
 *
 * One role-scoped summary call so every dashboard can render real counts
 * instead of inventing them. Each role only sees numbers it is entitled to:
 * an institution sees its own deposits, a bank sees its own branch queue, an
 * officer sees the national review queue.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { authMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { FDR_STATUS } from '@fdr-portal/shared/constants';

const router: Router = Router();

router.use(authMiddleware);

const DAY = 24 * 60 * 60 * 1000;

/** Statuses that represent money actively held by AICTE. */
const ACTIVE_STATUSES = [
  FDR_STATUS.SUBMITTED,
  FDR_STATUS.AWAITING_BANK_VERIFICATION,
  FDR_STATUS.BANK_VERIFIED,
  FDR_STATUS.UNDER_REVIEW,
  FDR_STATUS.VERIFIED,
  FDR_STATUS.MANUAL_VERIFIED,
];

/** Statuses still moving through a workflow and awaiting a human. */
const PENDING_STATUSES = [
  FDR_STATUS.SUBMITTED,
  FDR_STATUS.AWAITING_BANK_VERIFICATION,
  FDR_STATUS.BANK_VERIFIED,
  FDR_STATUS.UNDER_REVIEW,
  FDR_STATUS.BANK_FLAGGED,
  FDR_STATUS.FLAGGED,
];

/**
 * GET /api/v1/dashboard/summary
 * Role-scoped KPI payload for the overview page.
 */
router.get(
  '/summary',
  asyncHandler(async (req: Request, res: Response) => {
    const user = req.user!;
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * DAY);
    const in90Days = new Date(now.getTime() + 90 * DAY);

    // Every role except ADMIN, OFFICER and AUDITOR is scoped to a tenant. A
    // tenant user with no institution or bank binding yet sees an empty book —
    // never everyone else's records.
    const tenantUser = !['ADMIN', 'OFFICER', 'AUDITOR'].includes(user.role as string);
    const tenantScope: Record<string, unknown> = {};
    if (user.institutionId) tenantScope.institutionId = user.institutionId;
    if (user.bankId) tenantScope.bankId = user.bankId;

    if (tenantUser && Object.keys(tenantScope).length === 0) {
      tenantScope.id = { in: [] };
    }

    const scope = tenantUser ? tenantScope : {};
    const isGlobalRole = !tenantUser;

    const [
      active,
      drafts,
      pendingVerification,
      flagged,
      expiring30,
      expiring90,
      verified,
      released,
      totalAmount,
      recentFdrs,
      statusGroups,
      institutionCount,
      userCount,
      recentAudit,
    ] = await Promise.all([
      prisma.fDR.count({ where: { ...scope, status: { in: ACTIVE_STATUSES } } }),
      prisma.fDR.count({ where: { ...scope, status: FDR_STATUS.DRAFT } }),
      prisma.fDR.count({ where: { ...scope, status: { in: PENDING_STATUSES } } }),
      prisma.fDR.count({
        where: { ...scope, status: { in: [FDR_STATUS.FLAGGED, FDR_STATUS.BANK_FLAGGED] } },
      }),
      prisma.fDR.count({
        where: {
          ...scope,
          status: { in: ACTIVE_STATUSES },
          maturityDate: { gte: now, lte: in30Days },
        },
      }),
      prisma.fDR.count({
        where: {
          ...scope,
          status: { in: ACTIVE_STATUSES },
          maturityDate: { gte: now, lte: in90Days },
        },
      }),
      prisma.fDR.count({
        where: { ...scope, status: { in: [FDR_STATUS.VERIFIED, FDR_STATUS.MANUAL_VERIFIED] } },
      }),
      prisma.fDR.count({ where: { ...scope, status: FDR_STATUS.RELEASED } }),
      prisma.fDR.aggregate({
        where: { ...scope, status: { not: FDR_STATUS.RELEASED } },
        _sum: { amount: true },
      }),
      prisma.fDR.findMany({
        where: scope,
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          fdrNumber: true,
          bankName: true,
          branchName: true,
          amount: true,
          status: true,
          maturityDate: true,
          createdAt: true,
          riskScore: true,
        },
      }),
      prisma.fDR.groupBy({
        by: ['status'],
        where: scope,
        _count: { _all: true },
      }),
      isGlobalRole ? prisma.institution.count({ where: { isActive: true } }) : Promise.resolve(0),
      prisma.user.count({ where: { status: 'ACTIVE', ...(isGlobalRole ? {} : tenantScope) } }),
      isGlobalRole
        ? prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
              id: true,
              action: true,
              entityType: true,
              actorName: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const assignedToMe = ['OFFICER'].includes(user.role as string)
      ? await prisma.fDR.count({
          where: { assignedTo: user.id, status: { in: PENDING_STATUSES } },
        })
      : 0;

    // Maturity buckets give the dashboard a real chart without a second call.
    const [maturity0to30, maturity31to90, maturity91to180, maturityOver180] = await Promise.all([
      prisma.fDR.count({
        where: { ...scope, status: { in: ACTIVE_STATUSES }, maturityDate: { gte: now, lte: in30Days } },
      }),
      prisma.fDR.count({
        where: {
          ...scope,
          status: { in: ACTIVE_STATUSES },
          maturityDate: { gt: in30Days, lte: in90Days },
        },
      }),
      prisma.fDR.count({
        where: {
          ...scope,
          status: { in: ACTIVE_STATUSES },
          maturityDate: { gt: in90Days, lte: new Date(now.getTime() + 180 * DAY) },
        },
      }),
      prisma.fDR.count({
        where: {
          ...scope,
          status: { in: ACTIVE_STATUSES },
          maturityDate: { gt: new Date(now.getTime() + 180 * DAY) },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        role: user.role,
        scope: isGlobalRole ? 'all' : 'tenant',
        counts: {
          active,
          drafts,
          pendingVerification,
          flagged,
          expiring30,
          expiring90,
          verified,
          released,
          assignedToMe,
          institutions: institutionCount,
          users: userCount,
        },
        amounts: {
          totalHeld: totalAmount._sum.amount ?? 0,
        },
        maturityBuckets: [
          { label: '0–30 days', count: maturity0to30 },
          { label: '31–90 days', count: maturity31to90 },
          { label: '91–180 days', count: maturity91to180 },
          { label: '180+ days', count: maturityOver180 },
        ],
        statusBreakdown: statusGroups.map((group) => ({
          status: group.status,
          count: group._count._all,
        })),
        recentFdrs,
        recentActivity: recentAudit,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;
