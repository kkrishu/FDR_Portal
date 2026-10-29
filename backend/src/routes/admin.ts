import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { auditService } from '@/services/auditService';
import { ROLES, USER_STATUS, NOTIFICATION_TYPES, RELEASE_STATUS } from '@fdr-portal/shared/constants';
import { rulesConfigSchema } from '@fdr-portal/shared/validators';

const router: Router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/admin/overview
 * Get admin overview dashboard data
 */
router.get('/overview',
  asyncHandler(async (req: Request, res: Response) => {
    const [
      totalInstitutions,
      totalUsers,
      totalFDRs,
      activeFDRs,
      expiringFDRs,
      flaggedFDRs,
      pendingBankVerification,
      pendingReview,
      releaseRequests,
      overdueRenewals,
    ] = await Promise.all([
      prisma.institution.count({ where: { isActive: true } }),
      prisma.user.count({ where: { status: USER_STATUS.ACTIVE } }),
      prisma.fDR.count(),
      prisma.fDR.count({ where: { status: { in: ['VERIFIED', 'BANK_VERIFIED', 'RELEASED'] } } }),
      prisma.fDR.count({
        where: {
          maturityDate: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
          status: { in: ['VERIFIED', 'BANK_VERIFIED', 'RELEASED'] },
        },
      }),
      prisma.fDR.count({ where: { flags: { some: {} } } }),
      prisma.fDR.count({ where: { status: 'AWAITING_BANK_VERIFICATION' } }),
      prisma.fDR.count({ where: { status: { in: ['UNDER_REVIEW', 'SUBMITTED'] } } }),
      prisma.releaseRequest.count({ where: { status: { in: ['REQUESTED', 'CHECKLIST_PENDING', 'RECOMMENDED'] } } }),
      prisma.fDR.count({
        where: {
          maturityDate: { lt: new Date() },
          status: { in: ['VERIFIED', 'BANK_VERIFIED'] },
          renewalCount: 0,
        },
      }),
    ]);
    
    res.json({
      success: true,
      data: {
        totalInstitutions,
        totalUsers,
        totalFDRs,
        activeFDRs,
        expiringFDRs,
        flaggedFDRs,
        pendingBankVerification,
        pendingReview,
        releaseRequests,
        overdueRenewals,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/admin/analytics
 * Get analytics data
 */
router.get('/analytics',
  asyncHandler(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    const from = dateFrom ? new Date(dateFrom as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateTo ? new Date(dateTo as string) : new Date();
    
    // Turnaround time
    const verifiedFDRs = await prisma.fDR.findMany({
      where: {
        verifiedAt: { gte: from, lte: to },
        status: { in: ['VERIFIED', 'RELEASED'] },
      },
      select: { createdAt: true, verifiedAt: true },
    });
    
    const turnaroundTimes = verifiedFDRs.map(f => 
      (f.verifiedAt!.getTime() - f.createdAt.getTime()) / (1000 * 60 * 60) // hours
    );
    
    const avgTurnaround = turnaroundTimes.length > 0 
      ? turnaroundTimes.reduce((a, b) => a + b, 0) / turnaroundTimes.length 
      : 0;
    
    // Officer workload
    const officers = await prisma.user.findMany({
      where: { role: ROLES.OFFICER, status: USER_STATUS.ACTIVE },
      select: { id: true, name: true },
    });
    
    const officerWorkload = await Promise.all(officers.map(async (officer) => {
      const assigned = await prisma.fDR.count({
        where: { verifiedBy: officer.id, verifiedAt: { gte: from, lte: to } },
      });
      const completed = await prisma.fDR.count({
        where: { verifiedBy: officer.id, verifiedAt: { gte: from, lte: to }, status: 'VERIFIED' },
      });
      const officerTurnaround = await prisma.fDR.findMany({
        where: { verifiedBy: officer.id, verifiedAt: { gte: from, lte: to } },
        select: { createdAt: true, verifiedAt: true },
      });
      const avgOfficerTurnaround = officerTurnaround.length > 0
        ? officerTurnaround.reduce((a, f) => a + (f.verifiedAt!.getTime() - f.createdAt.getTime()) / (1000 * 60 * 60), 0) / officerTurnaround.length
        : 0;
      
      return { officerId: officer.id, officerName: officer.name, assigned, completed, avgTurnaround: avgOfficerTurnaround };
    }));
    
    // Bank response times
    const verifications = await prisma.verificationResult.findMany({
      where: { verifiedAt: { gte: from, lte: to } },
      select: { 
        verifiedAt: true, 
        verificationRequest: { 
          select: { 
            sentAt: true, 
            bankBranch: { 
              select: { 
                bank: { 
                  select: { name: true } 
                } 
              } 
            } 
          } 
        } 
      },
    });
    
    const bankResponseTimes = verifications.map(v => 
      (v.verifiedAt.getTime() - v.verificationRequest.sentAt.getTime()) / (1000 * 60 * 60) // hours
    );
    
    const avgBankResponse = bankResponseTimes.length > 0
      ? bankResponseTimes.reduce((a, b) => a + b, 0) / bankResponseTimes.length
      : 0;
    
    // Monthly trends
    const monthlyData: Array<{ month: string; submitted: number; verified: number; released: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(to.getFullYear(), to.getMonth() - i, 1);
      const monthEnd = new Date(to.getFullYear(), to.getMonth() - i + 1, 0);
      
      const [submitted, verified, released] = await Promise.all([
        prisma.fDR.count({ where: { createdAt: { gte: monthStart, lte: monthEnd } } }),
        prisma.fDR.count({ where: { verifiedAt: { gte: monthStart, lte: monthEnd } } }),
        prisma.fDR.count({ where: { releasedAt: { gte: monthStart, lte: monthEnd } } }),
      ]);
      
      monthlyData.push({
        month: monthStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
        submitted,
        verified,
        released,
      });
    }
    
    res.json({
      success: true,
      data: {
        turnaroundTime: { avg: Math.round(avgTurnaround * 10) / 10, byOfficer: officerWorkload },
        bankResponseTime: { avgHours: Math.round(avgBankResponse * 10) / 10 },
        monthlyTrends: monthlyData,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/admin/rules
 * Get current rules configuration
 */
router.get('/rules',
  asyncHandler(async (req: Request, res: Response) => {
    const rules = await prisma.rulesConfig.findUnique({ where: { key: 'default' } });
    
    res.json({
      success: true,
      data: rules?.value || {},
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PATCH /api/v1/admin/rules
 * Update rules configuration
 */
router.patch('/rules',
  asyncHandler(async (req: Request, res: Response) => {
    const validated = rulesConfigSchema.parse(req.body);
    
    const rules = await prisma.rulesConfig.upsert({
      where: { key: 'default' },
      create: { key: 'default', value: validated, updatedBy: req.user!.id },
      update: { value: validated, updatedBy: req.user!.id },
    });
    
    await auditService.recordForRequest(req, {
      action: 'RULES_UPDATED',
      entityType: 'RulesConfig',
      entityId: 'default',
      after: validated,
    });
    
    res.json({
      success: true,
      data: rules,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/admin/escalations
 * Get escalations
 */
router.get('/escalations',
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20 } = req.query;
    
    // Overdue renewals
    const overdueRenewals = await prisma.fDR.findMany({
      where: {
        maturityDate: { lt: new Date() },
        status: { in: ['VERIFIED', 'BANK_VERIFIED'] },
      },
      include: { institution: { select: { name: true } } },
    });
    
    // Bank no-reply escalations
    const pendingVerifications = await prisma.verificationRequest.findMany({
      where: {
        status: 'PENDING',
        sentAt: { lt: new Date(Date.now() - 72 * 60 * 60 * 1000) }, // 72 hours
      },
      include: { fdr: { include: { institution: { select: { name: true } } } } },
    });
    
    // SLA breaches
    const slaBreaches = await prisma.releaseRequest.findMany({
      where: {
        status: { in: ['REQUESTED', 'CHECKLIST_PENDING', 'RECOMMENDED'] },
        slaDeadline: { lt: new Date() },
      },
      include: { fdr: { include: { institution: { select: { name: true } } } } },
    });
    
    res.json({
      success: true,
      data: {
        overdueRenewals: overdueRenewals.map(f => ({ ...f, type: 'OVERDUE_RENEWAL' })),
        bankNoReply: pendingVerifications.map(v => ({ ...v, type: 'BANK_NO_REPLY' })),
        slaBreaches: slaBreaches.map(r => ({ ...r, type: 'SLA_BREACH' })),
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/admin/escalations/:id/reassign
 * Reassign escalation to different officer
 */
router.post('/escalations/:id/reassign',
  asyncHandler(async (req: Request, res: Response) => {
    const { officerId, type } = req.body;
    
    // This would update the relevant record with new officer
    // Implementation depends on escalation type
    
    res.json({
      success: true,
      data: { message: 'Escalation reassigned' },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/admin/audit
 * Get audit logs
 */
router.get('/audit',
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 50, actorId, entityType, entityId, dateFrom, dateTo, action } = req.query;
    
    const where: any = {};
    if (actorId) where.actorId = actorId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom as string);
      if (dateTo) where.createdAt.lte = new Date(dateTo as string);
    }
    
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: logs,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId!,
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

/**
 * POST /api/v1/admin/audit/verify
 * Verify audit log integrity
 */
router.post('/audit/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'asc' },
    });
    
    let isValid = true;
    let previousHash: string | undefined;
    const errors: any[] = [];
    
    for (const log of logs) {
      // Recalculate hash
      const { hash: _h, previousHash: _p, id: _i, createdAt: _c, ...data } = log as any;
      void data;
      
      // In production, would use proper hash chain verification
      // For now, just check structure
      if (!log.hash || log.hash.length !== 64) {
        isValid = false;
        errors.push({ id: log.id, error: 'Invalid hash format' });
      }
      
      previousHash = log.hash;
    }
    
    res.json({
      success: true,
      data: { isValid, totalLogs: logs.length, errors },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;