import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { rulesConfigSchema } from '@fdr-portal/shared/validators';

const router: Router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/rules
 * Get all rules configurations
 */
router.get('/',
  asyncHandler(async (req: Request, res: Response) => {
    const rules = await prisma.rulesConfig.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    
    res.json({
      success: true,
      data: rules,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/rules/categories
 * Get rules organized by category
 */
router.get('/categories',
  asyncHandler(async (req: Request, res: Response) => {
    const rules = await prisma.rulesConfig.findUnique({ where: { key: 'default' } });
    const config = (rules?.value ?? {}) as Record<string, unknown>;
    
    const categories = {
      bankVerification: {
        bankReminderDays: config.bankReminderDays,
        bankNoReplyEscalationHours: config.bankNoReplyEscalationHours,
        bankAdminEscalationDays: config.bankAdminEscalationDays,
      },
      maturityTracking: {
        maturityReminderDays: config.maturityReminderDays,
        overdueRenewalEscalationDays: config.overdueRenewalEscalationDays,
      },
      releaseWorkflow: {
        releaseSLAHours: config.releaseSLAHours,
        releaseStageSLAHours: config.releaseStageSLAHours,
        releaseConditions: config.releaseConditions,
      },
      otpVerification: {
        otpExpiryMinutes: config.otpExpiryMinutes,
        otpMaxAttempts: config.otpMaxAttempts,
        verificationTokenExpiryHours: config.verificationTokenExpiryHours,
      },
      documents: {
        requiredDocuments: config.requiredDocuments,
        maxFileSizeMB: config.maxFileSizeMB,
        allowedMimeTypes: config.allowedMimeTypes,
      },
      rateLimiting: {
        rateLimitMax: config.rateLimitMax,
        rateLimitWindowMinutes: config.rateLimitWindowMinutes,
      },
      features: {
        featureMFAEnabled: config.featureMFAEnabled,
        featureSSOEnabled: config.featureSSOEnabled,
        featureWebhooksEnabled: config.featureWebhooksEnabled,
        featureAPIConnectorEnabled: config.featureAPIConnectorEnabled,
      },
    };
    
    res.json({
      success: true,
      data: categories,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/rules/:key
 * Get specific rules configuration
 */
router.get('/:key',
  asyncHandler(async (req: Request, res: Response) => {
    const rules = await prisma.rulesConfig.findUnique({
      where: { key: req.params.key },
    });
    
    if (!rules) {
      // Return default config
      const defaultConfig = {
        bankReminderDays: [1, 2],
        bankNoReplyEscalationHours: 72,
        bankAdminEscalationDays: 5,
        maturityReminderDays: [60, 30, 15, 7, 1],
        overdueRenewalEscalationDays: 1,
        releaseSLAHours: 72,
        releaseStageSLAHours: {
          requested_to_recommended: 24,
          recommended_to_approved: 24,
          approved_to_released: 24,
        },
        otpExpiryMinutes: 10,
        otpMaxAttempts: 5,
        verificationTokenExpiryHours: 48,
        requiredDocuments: {
          fdrCertificate: true,
          boardResolution: true,
          lienLetter: true,
        },
        releaseConditions: {
          requireBankVerified: true,
          requireLienConfirmed: true,
          requireNoOpenFlags: true,
          requireAllDocuments: true,
        },
        maxFileSizeMB: 10,
        allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
        rateLimitMax: 100,
        rateLimitWindowMinutes: 1,
        featureMFAEnabled: true,
        featureSSOEnabled: false,
        featureWebhooksEnabled: true,
        featureAPIConnectorEnabled: true,
      };
      
      res.json({
        success: true,
        data: defaultConfig,
        meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
      });
      return;
    }
    
    res.json({
      success: true,
      data: rules.value,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/rules
 * Create or update rules configuration
 */
router.post('/',
  asyncHandler(async (req: Request, res: Response) => {
    const validated = rulesConfigSchema.parse(req.body);
    
    const rules = await prisma.rulesConfig.upsert({
      where: { key: 'default' },
      create: { key: 'default', value: validated, description: 'System rules configuration', updatedBy: req.user!.id },
      update: { value: validated, updatedBy: req.user!.id },
    });
    
    // Audit log
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        actorRole: req.user!.role,
        actorName: req.user!.name,
        action: 'RULES_UPDATED',
        entityType: 'RulesConfig',
        entityId: 'default',
        after: validated,
        hash: 'hash-placeholder',
      },
    });
    
    res.json({
      success: true,
      data: rules,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;