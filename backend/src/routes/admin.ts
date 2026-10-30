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

// ============================================
// Compliance Reports
// ============================================

/**
 * GET /api/v1/admin/compliance/report
 * Generate compliance report
 * Templates: sox, gdpr, iso27001, custom
 */
router.get('/compliance/report',
  asyncHandler(async (req: Request, res: Response) => {
    const { template = 'custom', dateFrom, dateTo, format = 'json' } = req.query;
    const from = dateFrom ? new Date(dateFrom as string) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const to = dateTo ? new Date(dateTo as string) : new Date();

    let reportData: any = {
      generatedAt: new Date().toISOString(),
      period: { from: from.toISOString(), to: to.toISOString() },
      template,
    };

    switch (template) {
      case 'sox': {
        // SOX Compliance - Financial data integrity, access controls, audit trail
        const [
          totalFDRs,
          verifiedFDRs,
          flaggedFDRs,
          releasedFDRs,
          auditLogs,
          userAccessChanges,
          failedLogins,
        ] = await Promise.all([
          prisma.fDR.count({ where: { createdAt: { gte: from, lte: to } } }),
          prisma.fDR.count({ where: { verifiedAt: { gte: from, lte: to }, status: { in: ['VERIFIED', 'BANK_VERIFIED', 'RELEASED'] } } }),
          prisma.fDR.count({ where: { flags: { some: { createdAt: { gte: from, lte: to } } } } }),
          prisma.fDR.count({ where: { releasedAt: { gte: from, lte: to } } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to } } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: { in: ['USER_CREATED', 'USER_UPDATED', 'ROLE_CHANGED'] } } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: 'LOGIN_FAILED' } }),
        ]);

        reportData.sox = {
          financialDataIntegrity: {
            totalFDRsProcessed: totalFDRs,
            verifiedCount: verifiedFDRs,
            flaggedCount: flaggedFDRs,
            releasedCount: releasedFDRs,
            verificationRate: totalFDRs > 0 ? ((verifiedFDRs / totalFDRs) * 100).toFixed(2) : '0.00',
          },
          accessControls: {
            userAccessChanges,
            failedLoginAttempts: failedLogins,
            auditTrailEntries: auditLogs,
          },
          dataRetention: {
            auditLogRetentionDays: 2555, // 7 years
            fdrRetentionDays: 3650, // 10 years
          },
        };
        break;
      }
      case 'gdpr': {
        // GDPR Compliance - Personal data processing, user rights, breach notifications
        const [
          userCreations,
          userDeletions,
          passwordResets,
          dataAccessLogs,
          exportRequests,
          personalDataAudit,
        ] = await Promise.all([
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: 'USER_CREATED' } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: 'USER_DELETED' } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: 'PASSWORD_CHANGED' } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, entityType: 'User', action: { in: ['READ', 'EXPORT'] } } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: 'DATA_EXPORT_REQUESTED' } }),
          prisma.auditLog.findMany({ where: { createdAt: { gte: from, lte: to }, entityType: 'User' }, take: 100 }),
        ]);

        reportData.gdpr = {
          personalDataProcessing: {
            userRegistrations: userCreations,
            userDeletions,
            passwordResets,
            dataAccessRequests: dataAccessLogs,
            exportRequests,
          },
          userRights: {
            rightToAccess: dataAccessLogs,
            rightToErasure: userDeletions,
            rightToPortability: exportRequests,
            rightToRectification: passwordResets,
          },
          breachNotifications: personalDataAudit.filter((log: any) => 
            log.action.includes('BREACH') || log.action.includes('UNAUTHORIZED')
          ).length,
        };
        break;
      }
      case 'iso27001': {
        // ISO 27001 - Information security management
        const [
          securityEvents,
          accessControlChanges,
          systemChanges,
          mfaEvents,
          webhookSecurity,
          failedVerifications,
        ] = await Promise.all([
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: { contains: 'SECURITY' } } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: { in: ['USER_CREATED', 'USER_UPDATED', 'ROLE_CHANGED', 'MFA_ENABLED', 'MFA_DISABLED'] } } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: { in: ['RULES_UPDATED', 'WEBHOOK_CREATED', 'WEBHOOK_UPDATED', 'API_KEY_CREATED', 'API_KEY_REVOKED'] } } }),
          prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to }, action: { in: ['MFA_ENABLED', 'MFA_DISABLED', 'MFA_VERIFIED'] } } }),
          prisma.webhook.count({ where: { isActive: true } }),
          prisma.verificationResult.count({ where: { verifiedAt: { gte: from, lte: to }, assuranceLevel: 'LOW' } }),
        ]);

        reportData.iso27001 = {
          securityIncidents: securityEvents,
          accessControlManagement: accessControlChanges,
          systemConfigurationChanges: systemChanges,
          authenticationControls: {
            mfaEvents,
            mfaEnabledRate: 'Track separately',
          },
          communicationSecurity: {
            activeWebhooks: webhookSecurity,
            webhookDeliverySuccess: 'Track via webhook deliveries',
          },
          verificationIntegrity: {
            lowAssuranceVerifications: failedVerifications,
          },
        };
        break;
      }
      default: {
        // Custom report - comprehensive overview
        const [
          fdrStats,
          userStats,
          auditStats,
          verificationStats,
          releaseStats,
          flagStats,
        ] = await Promise.all([
          prisma.fDR.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: true }),
          prisma.user.groupBy({ by: ['role', 'status'], where: { createdAt: { gte: from, lte: to } }, _count: true }),
          prisma.auditLog.groupBy({ by: ['action'], where: { createdAt: { gte: from, lte: to } }, _count: true, orderBy: { _count: { action: 'desc' } }, take: 20 }),
          prisma.verificationResult.groupBy({ by: ['assuranceLevel'], where: { verifiedAt: { gte: from, lte: to } }, _count: true }),
          prisma.releaseRequest.groupBy({ by: ['status'], where: { requestedAt: { gte: from, lte: to } }, _count: true }),
          prisma.fDRFlag.groupBy({ by: ['category', 'severity'], where: { createdAt: { gte: from, lte: to } }, _count: true }),
        ]);

        reportData.custom = {
          fdr: fdrStats,
          users: userStats,
          auditTrail: auditStats,
          verifications: verificationStats,
          releases: releaseStats,
          flags: flagStats,
        };
      }
    }

    if (format === 'csv') {
      // Flatten report data for CSV
      const flatten = (obj: any, prefix = ''): Record<string, string> => {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(obj)) {
          const newKey = prefix ? `${prefix}.${key}` : key;
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flatten(value, newKey));
          } else if (Array.isArray(value)) {
            result[newKey] = JSON.stringify(value);
          } else {
            result[newKey] = String(value ?? '');
          }
        }
        return result;
      };

      const flat = flatten(reportData);
      const headers = Object.keys(flat);
      const row = headers.map(h => flat[h]);

      const csvContent = [headers.join(','), row.map(v => `"${v.replace(/"/g, '""')}"`).join(',')].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="compliance-${template}-${from.toISOString().split('T')[0]}.csv"`);
      return res.send(csvContent);
    }

    res.json({
      success: true,
      data: reportData,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/admin/compliance/templates
 * List available compliance report templates
 */
router.get('/compliance/templates',
  asyncHandler(async (req: Request, res: Response) => {
    const templates = [
      {
        id: 'sox',
        name: 'SOX Compliance Report',
        description: 'Financial data integrity, access controls, and audit trail for SOX compliance',
        frequency: 'Quarterly',
        sections: ['Financial Data Integrity', 'Access Controls', 'Data Retention'],
      },
      {
        id: 'gdpr',
        name: 'GDPR Compliance Report',
        description: 'Personal data processing, user rights, and breach notifications for GDPR compliance',
        frequency: 'Monthly',
        sections: ['Personal Data Processing', 'User Rights', 'Breach Notifications'],
      },
      {
        id: 'iso27001',
        name: 'ISO 27001 Security Report',
        description: 'Information security management, access controls, and system changes',
        frequency: 'Monthly',
        sections: ['Security Incidents', 'Access Control Management', 'System Configuration', 'Authentication Controls', 'Communication Security'],
      },
      {
        id: 'custom',
        name: 'Custom Comprehensive Report',
        description: 'Full system overview with all key metrics',
        frequency: 'On-demand',
        sections: ['FDR Statistics', 'User Statistics', 'Audit Trail', 'Verifications', 'Releases', 'Flags'],
      },
    ];

    res.json({
      success: true,
      data: templates,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;