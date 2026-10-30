import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { auditService } from '@/services/auditService';

const router: Router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN', 'AUDITOR'));
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/audit
 * Get audit logs
 */
router.get('/',
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 50, actorId, entityType, entityId, dateFrom, dateTo, action, search } = req.query;
    
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
    // Full-text search on before/after JSON fields
    if (search) {
      where.OR = [
        { before: { contains: search as string } },
        { after: { contains: search as string } },
        { actorName: { contains: search as string, mode: 'insensitive' } },
        { entityType: { contains: search as string, mode: 'insensitive' } },
        { action: { contains: search as string, mode: 'insensitive' } },
      ];
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
 * GET /api/v1/audit/export
 * Export audit logs as CSV or JSON
 */
router.get('/export',
  asyncHandler(async (req: Request, res: Response) => {
    const { format = 'csv', actorId, entityType, entityId, dateFrom, dateTo, action, search } = req.query;
    
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
    if (search) {
      where.OR = [
        { before: { contains: search as string } },
        { after: { contains: search as string } },
        { actorName: { contains: search as string, mode: 'insensitive' } },
        { entityType: { contains: search as string, mode: 'insensitive' } },
        { action: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000, // Limit export to 10k records
    });
    
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.json"`);
      return res.json({
        success: true,
        data: logs,
        meta: { timestamp: new Date().toISOString(), requestId: req.correlationId!, total: logs.length },
      });
    }
    
    // CSV Export
    const headers = [
      'ID', 'Timestamp', 'Actor ID', 'Actor Name', 'Actor Role', 'Action',
      'Entity Type', 'Entity ID', 'IP Address', 'Country', 'City', 'Region',
      'User Agent', 'Before', 'After', 'Hash', 'Previous Hash'
    ];
    
    const rows = logs.map(log => [
      log.id,
      log.createdAt.toISOString(),
      log.actorId,
      log.actorName,
      log.actorRole,
      log.action,
      log.entityType,
      log.entityId,
      log.ipAddress ?? '',
      log.country ?? '',
      log.city ?? '',
      log.region ?? '',
      log.userAgent ?? '',
      JSON.stringify(log.before ?? {}),
      JSON.stringify(log.after ?? {}),
      log.hash,
      log.previousHash ?? '',
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);
  })
);

/**
 * GET /api/v1/audit/search
 * Full-text search on audit logs
 */
router.get('/search',
  asyncHandler(async (req: Request, res: Response) => {
    const { q, page = 1, limit = 20, entityType, dateFrom, dateTo } = req.query;
    
    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.json({
        success: true,
        data: [],
        meta: { timestamp: new Date().toISOString(), requestId: req.correlationId!, total: 0 },
      });
    }
    
    const where: any = {
      OR: [
        { before: { contains: q } },
        { after: { contains: q } },
        { actorName: { contains: q, mode: 'insensitive' } },
        { entityType: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
        { ipAddress: { contains: q } },
      ],
    };
    
    if (entityType) where.entityType = entityType;
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
 * GET /api/v1/audit/stats
 * Get audit log statistics
 */
router.get('/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const { dateFrom, dateTo } = req.query;
    const from = dateFrom ? new Date(dateFrom as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = dateTo ? new Date(dateTo as string) : new Date();
    
    const [totalLogs, logsByAction, logsByActor, logsByEntity, logsByCountry] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: from, lte: to } } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        orderBy: { _count: { action: 'desc' } },
        take: 20,
      }),
      prisma.auditLog.groupBy({
        by: ['actorId', 'actorRole'],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        orderBy: { _count: { actorId: 'desc' } },
        take: 20,
      }),
      prisma.auditLog.groupBy({
        by: ['entityType'],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        orderBy: { _count: { entityType: 'desc' } },
      }),
      prisma.auditLog.groupBy({
        by: ['country'],
        where: { createdAt: { gte: from, lte: to }, country: { not: null } },
        _count: true,
        orderBy: { _count: { country: 'desc' } },
        take: 10,
      }),
    ]);
    
    res.json({
      success: true,
      data: {
        totalLogs,
        byAction: logsByAction.map(l => ({ action: l.action, count: l._count })),
        byActor: logsByActor.map(l => ({ actorId: l.actorId, actorRole: l.actorRole, count: l._count })),
        byEntity: logsByEntity.map(l => ({ entityType: l.entityType, count: l._count })),
        byCountry: logsByCountry.map(l => ({ country: l.country, count: l._count })),
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/audit/:id
 * Get audit log by ID
 */
router.get('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const log = await prisma.auditLog.findUnique({
      where: { id: req.params.id },
    });
    
    if (!log) {
      throw new NotFoundError('Audit log');
    }
    
    res.json({
      success: true,
      data: log,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/audit/verify
 * Verify audit log integrity
 */
router.post('/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await auditService.verifyChain();

    res.json({
      success: true,
      data: {
        isValid: result.isValid,
        totalLogs: result.totalLogs,
        errors: result.errors.map((e) => ({ id: e.id, error: e.error, createdAt: e.createdAt })),
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;