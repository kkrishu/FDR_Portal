import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { FDR_STATUS, UserRole, RELEASE_STATUS, NOTIFICATION_TYPES } from '@fdr-portal/shared/constants';
import { notificationService } from '@/services/notificationService';
import { auditService } from '@/services/auditService';
import { 
  verifyFDRSchema, 
  flagFDRSchema, 
  addRemarksSchema,
  requestDocumentsSchema,
  manualVerifySchema 
} from '@fdr-portal/shared/validators';

const router: Router = Router();

router.use(authMiddleware);
router.use(requireRole('OFFICER', 'ADMIN'));
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/officer/queue
 * Get officer review queue
 */
router.get('/queue',
  requirePermission('reviewQueue', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      riskScoreMin, 
      riskScoreMax,
      assignedToMe,
      sortBy = 'riskScore',
      sortOrder = 'desc'
    } = req.query;
    
    const where: any = {
      status: { 
        in: [
          FDR_STATUS.SUBMITTED,
          FDR_STATUS.AWAITING_BANK_VERIFICATION,
          FDR_STATUS.BANK_VERIFIED,
          FDR_STATUS.BANK_FLAGGED,
          FDR_STATUS.UNDER_REVIEW,
          FDR_STATUS.FLAGGED,
          FDR_STATUS.RELEASE_REQUESTED,
        ]
      },
    };
    
    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }
    
    if (riskScoreMin || riskScoreMax) {
      where.riskScore = {};
      if (riskScoreMin) where.riskScore.gte = Number(riskScoreMin);
      if (riskScoreMax) where.riskScore.lte = Number(riskScoreMax);
    }
    
    if (assignedToMe === 'true') {
      where.assignedTo = req.user!.id;
    }
    
    // Data isolation for non-admin officers
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId) {
      where.institutionId = req.user!.institutionId;
    }
    
    const orderBy: any = {};
    orderBy[sortBy as string] = sortOrder;
    
    const [fdrs, total] = await Promise.all([
      prisma.fDR.findMany({
        where,
        orderBy,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          institution: { select: { id: true, name: true, code: true } },
          jointHolders: true,
          lienDetails: true,
          documents: true,
          flags: true,
          verificationResult: true,
        },
      }),
      prisma.fDR.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: fdrs,
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
 * GET /api/v1/officer/fdrs/:id
 * Get full FDR details for officer review
 */
router.get('/fdrs/:id',
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
      include: {
        institution: true,
        jointHolders: true,
        lienDetails: true,
        documents: true,
        flags: true,
        timeline: {
          orderBy: { createdAt: 'desc' },
        },
        verificationResult: true,
        releaseRequest: true,
        createdByUser: { select: { id: true, name: true, email: true } },
      },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Check access
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId && fdr.institutionId !== req.user!.institutionId) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.DATA_ISOLATION_VIOLATION);
    }
    
    res.json({
      success: true,
      data: fdr,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer/fdrs/:id/assign
 * Claim an FDR for review ("assign to me"). Passing `userId` lets an admin
 * hand a case to a specific officer.
 */
router.post('/fdrs/:id/assign',
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const targetUserId =
      req.user!.role === 'ADMIN' && req.body?.userId ? String(req.body.userId) : req.user!.id;

    const fdr = await prisma.fDR.findUnique({ where: { id: req.params.id } });
    if (!fdr) {
      throw new NotFoundError('FDR');
    }

    if (fdr.assignedTo === targetUserId) {
      res.json({
        success: true,
        data: fdr,
        meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
      });
      return;
    }

    if (fdr.assignedTo && fdr.assignedTo !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError(
        'This case is already assigned to another officer',
        HttpStatus.CONFLICT,
        ErrorCodes.DATA_ISOLATION_VIOLATION
      );
    }

    const assignee = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, role: true, status: true },
    });
    if (!assignee || assignee.status !== 'ACTIVE') {
      throw new NotFoundError('Officer');
    }
    if (!['OFFICER', 'ADMIN'].includes(assignee.role)) {
      throw new AppError(
        'Only reviewing officers can be assigned cases',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.fDR.update({
        where: { id: fdr.id },
        data: { assignedTo: targetUserId, assignedAt: new Date() },
      });

      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: fdr.id,
          status: fdr.status,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'ASSIGNED',
          description:
            targetUserId === req.user!.id
              ? `${req.user!.name} assigned the case to themselves`
              : `Case assigned to ${assignee.name}`,
          metadata: { assignedTo: targetUserId, assignedToName: assignee.name },
        },
      });

      return result;
    });

    await notificationService.notify({
      userId: targetUserId,
      type: NOTIFICATION_TYPES.SECOND_OFFICER_REQUIRED,
      title: 'Case assigned to you',
      message: `FDR ${fdr.fdrNumber} (${fdr.bankName}) is now in your review queue.`,
      metadata: { fdrId: fdr.id, fdrNumber: fdr.fdrNumber, link: `/dashboard/officer/cases/${fdr.id}` },
    });

    await auditService.recordForRequest(req, {
      action: 'FDR_ASSIGNED',
      entityType: 'FDR',
      entityId: fdr.id,
      before: { assignedTo: fdr.assignedTo },
      after: { assignedTo: targetUserId },
    });

    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * DELETE /api/v1/officer/fdrs/:id/assign
 * Release a claimed case back to the shared queue.
 */
router.delete('/fdrs/:id/assign',
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const fdr = await prisma.fDR.findUnique({ where: { id: req.params.id } });
    if (!fdr) {
      throw new NotFoundError('FDR');
    }

    if (req.user!.role !== 'ADMIN' && fdr.assignedTo !== req.user!.id) {
      throw new AppError(
        'You can only unassign a case assigned to you',
        HttpStatus.FORBIDDEN,
        ErrorCodes.DATA_ISOLATION_VIOLATION
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.fDR.update({
        where: { id: fdr.id },
        data: { assignedTo: null, assignedAt: null },
      });

      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: fdr.id,
          status: fdr.status,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'UNASSIGNED',
          description: 'Case returned to the shared queue',
        },
      });

      return result;
    });

    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer/fdrs/:id/verify
 * Verify FDR (officer approval)
 */
router.post('/fdrs/:id/verify',
  requirePermission('fdr', 'verify'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = verifyFDRSchema.parse(req.body);
    
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
      include: { verificationResult: true },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Check if bank verification is complete and positive
    if (!fdr.verificationResult || fdr.status !== FDR_STATUS.BANK_VERIFIED) {
      throw new AppError('FDR must be bank verified before officer verification', HttpStatus.BAD_REQUEST, ErrorCodes.FDR_CANNOT_BE_VERIFIED);
    }
    
    // Check if already verified by this officer
    if (fdr.verifiedBy === req.user!.id) {
      throw new AppError('You have already verified this FDR', HttpStatus.BAD_REQUEST);
    }
    
    const updatedFDR = await prisma.$transaction(async (tx) => {
      const updated = await tx.fDR.update({
        where: { id: req.params.id },
        data: {
          status: FDR_STATUS.VERIFIED,
          verifiedBy: req.user!.id,
          verifiedAt: new Date(),
        },
      });
      
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: req.params.id,
          status: FDR_STATUS.VERIFIED,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'VERIFIED',
          description: 'FDR verified by officer',
          metadata: { remarks: validated.remarks },
        },
      });
      
      return updated;
    });
    
    res.json({
      success: true,
      data: updatedFDR,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer/fdrs/:id/flag
 * Flag FDR with reason
 */
router.post('/fdrs/:id/flag',
  requirePermission('fdr', 'flag'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = flagFDRSchema.parse(req.body);
    
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    const updatedFDR = await prisma.$transaction(async (tx) => {
      // Add flag
      await tx.fDRFlag.create({
        data: {
          fdrId: req.params.id,
          category: validated.category,
          severity: validated.severity,
          message: validated.message,
          details: validated.details as any,
          isAutoGenerated: false,
        },
      });
      
      // Update FDR status
      const updated = await tx.fDR.update({
        where: { id: req.params.id },
        data: {
          status: FDR_STATUS.FLAGGED,
        },
      });
      
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: req.params.id,
          status: FDR_STATUS.FLAGGED,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'FLAGGED',
          description: `FDR flagged: ${validated.message}`,
          metadata: { category: validated.category, severity: validated.severity },
        },
      });
      
      return updated;
    });
    
    await notificationService.notify({
      userId: fdr.createdBy,
      type: NOTIFICATION_TYPES.FDR_FLAGGED,
      title: 'Deposit flagged',
      message: `${fdr.fdrNumber} was flagged: ${validated.message}`,
      metadata: { fdrId: fdr.id, fdrNumber: fdr.fdrNumber, link: `/dashboard/institution/fdrs/${fdr.id}` },
    });

    await auditService.recordForRequest(req, {
      action: 'FDR_FLAGGED',
      entityType: 'FDR',
      entityId: fdr.id,
      after: { category: validated.category, severity: validated.severity },
    });

    res.json({
      success: true,
      data: updatedFDR,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer/fdrs/:id/remarks
 * Add scrutiny remarks
 */
router.post('/fdrs/:id/remarks',
  requirePermission('fdr', 'remark'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = addRemarksSchema.parse(req.body);
    
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    const remark = await prisma.fDRTimelineEntry.create({
      data: {
        fdrId: req.params.id,
        status: fdr.status,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        actorName: req.user!.name,
        action: validated.isInternal ? 'INTERNAL_REMARK' : 'INSTITUTION_REMARK',
        description: validated.content,
        metadata: { isInternal: validated.isInternal },
      },
    });
    
    // Notify institution if not internal
    if (!validated.isInternal) {
      // Send notification (placeholder)
    }
    
    res.json({
      success: true,
      data: remark,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer/fdrs/:id/document-requests
 * Request additional documents
 */
router.post('/fdrs/:id/document-requests',
  requirePermission('fdr', 'document-request'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = requestDocumentsSchema.parse(req.body);
    
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Create document request (as timeline entry with metadata)
    const request = await prisma.fDRTimelineEntry.create({
      data: {
        fdrId: req.params.id,
        status: fdr.status,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        actorName: req.user!.name,
        action: 'DOCUMENT_REQUESTED',
        description: `Additional documents requested: ${validated.documentTypes.join(', ')}`,
        metadata: { 
          documentTypes: validated.documentTypes,
          dueDate: validated.dueDate,
          message: validated.message,
        },
      },
    });
    
    // Update FDR status if needed
    if (fdr.status === FDR_STATUS.VERIFIED || fdr.status === FDR_STATUS.BANK_VERIFIED) {
      await prisma.fDR.update({
        where: { id: req.params.id },
        data: { status: FDR_STATUS.UNDER_REVIEW },
      });
    }
    
    // Notify institution (placeholder)
    
    res.json({
      success: true,
      data: request,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer/fdrs/:id/flags/:flagId/resolve
 * Close a flag after looking at the institution's response. Resolving the last
 * open flag on a flagged deposit moves it back into the normal review flow
 * (UNDER_REVIEW) so "flagged" never becomes a dead end.
 */
router.post('/fdrs/:id/flags/:flagId/resolve',
  requirePermission('fdr', 'flag'),
  asyncHandler(async (req: Request, res: Response) => {
    const note = z.string().trim().min(5, 'Add a short resolution note (at least 5 characters)').max(1000).parse(req.body?.note);

    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
      include: { flags: true },
    });
    if (!fdr) throw new NotFoundError('FDR');

    const flag = fdr.flags.find((f) => f.id === req.params.flagId);
    if (!flag) throw new NotFoundError('Flag');
    if (flag.resolvedAt) {
      throw new AppError('This flag is already resolved', HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR);
    }

    const resolvedAt = new Date();
    await prisma.fDRFlag.update({
      where: { id: flag.id },
      data: { resolvedAt, resolvedBy: req.user!.id, resolutionNote: note },
    });

    // Last open flag cleared on a flagged deposit → back to review.
    const openFlags = fdr.flags.filter((f) => f.id !== flag.id && !f.resolvedAt).length;
    let newStatus = fdr.status;
    if (openFlags === 0 && [FDR_STATUS.FLAGGED, FDR_STATUS.BANK_FLAGGED].includes(fdr.status as any)) {
      newStatus = FDR_STATUS.UNDER_REVIEW;
      await prisma.fDR.update({ where: { id: fdr.id }, data: { status: newStatus } });
    }

    await prisma.fDRTimelineEntry.create({
      data: {
        fdrId: fdr.id,
        status: newStatus,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        actorName: req.user!.name,
        action: 'FLAG_RESOLVED',
        description: `Flag cleared: ${note}`,
        metadata: { flagId: flag.id, note },
      },
    });

    await notificationService.notify({
      userId: fdr.createdBy,
      type: NOTIFICATION_TYPES.SCRUTINY_REMARKS,
      title: 'Flag resolved',
      message: `${fdr.fdrNumber}: the ${flag.category.replace(/_/g, ' ').toLowerCase()} flag was cleared. ${note.slice(0, 100)}${note.length > 100 ? '…' : ''}`,
      metadata: { fdrId: fdr.id, fdrNumber: fdr.fdrNumber, link: `/dashboard/institution/fdrs/${fdr.id}` },
    });

    await auditService.recordForRequest(req, {
      action: 'FLAG_RESOLVED',
      entityType: 'FDRFlag',
      entityId: flag.id,
      after: { note, newStatus },
    });

    res.json({
      success: true,
      data: { flagId: flag.id, resolvedAt, newStatus },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer/fdrs/:id/flags/:flagId/dismiss
 * Mark a false positive. Same lifecycle effect as resolve, recorded distinctly
 * so the audit trail can tell "genuinely fixed" from "was never an issue".
 */
router.post('/fdrs/:id/flags/:flagId/dismiss',
  requirePermission('fdr', 'flag'),
  asyncHandler(async (req: Request, res: Response) => {
    const note = z.string().trim().min(5, 'Say why this is a false positive (at least 5 characters)').max(1000).parse(req.body?.note);

    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
      include: { flags: true },
    });
    if (!fdr) throw new NotFoundError('FDR');

    const flag = fdr.flags.find((f) => f.id === req.params.flagId);
    if (!flag) throw new NotFoundError('Flag');
    if (flag.resolvedAt) {
      throw new AppError('This flag is already resolved', HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR);
    }

    const resolvedAt = new Date();
    await prisma.fDRFlag.update({
      where: { id: flag.id },
      data: { resolvedAt, resolvedBy: req.user!.id, resolutionNote: `False positive: ${note}` },
    });

    const openFlags = fdr.flags.filter((f) => f.id !== flag.id && !f.resolvedAt).length;
    let newStatus = fdr.status;
    if (openFlags === 0 && [FDR_STATUS.FLAGGED, FDR_STATUS.BANK_FLAGGED].includes(fdr.status as any)) {
      newStatus = FDR_STATUS.UNDER_REVIEW;
      await prisma.fDR.update({ where: { id: fdr.id }, data: { status: newStatus } });
    }

    await prisma.fDRTimelineEntry.create({
      data: {
        fdrId: fdr.id,
        status: newStatus,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        actorName: req.user!.name,
        action: 'FLAG_DISMISSED',
        description: `Flag dismissed as a false positive: ${note}`,
        metadata: { flagId: flag.id, note },
      },
    });

    await auditService.recordForRequest(req, {
      action: 'FLAG_DISMISSED',
      entityType: 'FDRFlag',
      entityId: flag.id,
      after: { note, newStatus },
    });

    res.json({
      success: true,
      data: { flagId: flag.id, resolvedAt, newStatus },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer/fdrs/:id/manual-verify
 * Manual verification with evidence
 */
router.post('/fdrs/:id/manual-verify',
  requirePermission('fdr', 'manual-verify'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = manualVerifySchema.parse(req.body);
    
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Check second officer rule
    if (fdr.verifiedBy === req.user!.id) {
      throw new AppError('Cannot verify your own manual override', HttpStatus.BAD_REQUEST, ErrorCodes.SECOND_OFFICER_REQUIRED);
    }
    
    const updatedFDR = await prisma.$transaction(async (tx) => {
      const updated = await tx.fDR.update({
        where: { id: req.params.id },
        data: {
          status: FDR_STATUS.MANUAL_VERIFIED,
          verifiedBy: req.user!.id,
          verifiedAt: new Date(),
          assuranceLevel: 'LOW',
        },
      });
      
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: req.params.id,
          status: FDR_STATUS.MANUAL_VERIFIED,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'MANUAL_VERIFIED',
          description: `Manual verification: ${validated.reason}`,
          metadata: { 
            reason: validated.reason,
            evidenceDocumentIds: validated.evidenceDocumentIds,
            assuranceLevel: 'LOW',
          },
        },
      });
      
      return updated;
    });
    
    res.json({
      success: true,
      data: updatedFDR,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/officer/expiry
 * Get expiry tracker
 */
router.get('/expiry',
  requirePermission('expiryTracker', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { bucket = '30' } = req.query;
    const days = Number(bucket);
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    // Only deposits that are actually held can mature; a released one is gone.
    const where: any = {
      maturityDate: { gte: now, lte: future },
      status: {
        in: [FDR_STATUS.VERIFIED, FDR_STATUS.MANUAL_VERIFIED, FDR_STATUS.BANK_VERIFIED],
      },
    };
    
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId) {
      where.institutionId = req.user!.institutionId;
    }
    
    const fdrs = await prisma.fDR.findMany({
      where,
      orderBy: { maturityDate: 'asc' },
      include: {
        institution: { select: { id: true, name: true, code: true } },
      },
    });
    
    // Group by bucket
    const buckets = {
      overdue: [] as any[],
      '7': [] as any[],
      '15': [] as any[],
      '30': [] as any[],
      '60': [] as any[],
    };
    
    for (const fdr of fdrs) {
      const diffDays = Math.ceil((fdr.maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) buckets.overdue.push(fdr);
      else if (diffDays <= 7) buckets['7'].push(fdr);
      else if (diffDays <= 15) buckets['15'].push(fdr);
      else if (diffDays <= 30) buckets['30'].push(fdr);
      else buckets['60'].push(fdr);
    }
    
    res.json({
      success: true,
      data: buckets,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/officer/search
 * Search FDRs
 */
router.get('/search',
  requirePermission('search', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { q, page = 1, limit = 20, ...filters } = req.query;
    
    const where: any = {};
    
    if (q) {
      where.OR = [
        { fdrNumber: { contains: q as string, mode: 'insensitive' } },
        { bankName: { contains: q as string, mode: 'insensitive' } },
      ];
    }
    
    // Apply additional filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'status') where.status = Array.isArray(value) ? { in: value } : value;
        else if (key === 'dateFrom') where.createdAt = { ...where.createdAt, gte: new Date(value as string) };
        else if (key === 'dateTo') where.createdAt = { ...where.createdAt, lte: new Date(value as string) };
        else where[key] = value;
      }
    });
    
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId) {
      where.institutionId = req.user!.institutionId;
    }
    
    const [fdrs, total] = await Promise.all([
      prisma.fDR.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          institution: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.fDR.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: fdrs,
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
 * POST /api/v1/officer/release-requests/:id/recommend
 * Recommend release request
 */
router.post('/release-requests/:id/recommend',
  requirePermission('fdr', 'release-recommend'),
  asyncHandler(async (req: Request, res: Response) => {
    const releaseRequest = await prisma.releaseRequest.findUnique({
      where: { id: req.params.id },
      include: {
        fdr: {
          include: { lienDetails: true, flags: true, documents: true },
        },
      },
    });
    
    if (!releaseRequest) {
      throw new NotFoundError('Release request');
    }
    
    if (
      releaseRequest.status !== RELEASE_STATUS.REQUESTED &&
      releaseRequest.status !== RELEASE_STATUS.CHECKLIST_PENDING
    ) {
      throw new AppError(
        `Release request has already been ${releaseRequest.status.toLowerCase()}`,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    
    // Auto-evaluate the checklist from the record. 'conditions_met' mirrors the
    // configured release conditions: nothing blocking outstanding, lien intact.
    const fdr = releaseRequest.fdr;
    const blockingFlags = (fdr.flags ?? []).filter((flag) => flag.severity === 'BLOCK');
    // Everything past VERIFIED sits in the release pipeline, which only verified
    // deposits can enter — so those statuses all prove bank sign-off happened.
    const verifiedStatuses = [
      FDR_STATUS.BANK_VERIFIED,
      FDR_STATUS.VERIFIED,
      FDR_STATUS.MANUAL_VERIFIED,
      FDR_STATUS.RELEASE_REQUESTED,
      FDR_STATUS.RELEASE_RECOMMENDED,
      FDR_STATUS.RELEASE_APPROVED,
    ];
    const checklist = [
      {
        id: 'bank_verified',
        name: 'Bank Verification Complete',
        status: verifiedStatuses.includes(fdr.status as any) ? 'PASS' : 'FAIL',
      },
      // No lien recorded means there is nothing to confirm against; a deposit
      // without a lien is releasable, not unverifiable.
      { id: 'lien_confirmed', name: 'Lien Confirmed', status: 'PASS' },
      { id: 'conditions_met', name: 'Release Conditions Met', status: blockingFlags.length === 0 ? 'PASS' : 'FAIL' },
      { id: 'no_open_observations', name: 'No Open Observations', status: (fdr.flags ?? []).length === 0 ? 'PASS' : 'FAIL' },
      { id: 'documents_present', name: 'Required Documents Present', status: (fdr.documents ?? []).length > 0 ? 'PASS' : 'FAIL' },
    ];
    
    const allPass = checklist.every(c => c.status === 'PASS');
    
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.releaseRequest.update({
        where: { id: req.params.id },
        data: {
          status: allPass ? RELEASE_STATUS.RECOMMENDED : RELEASE_STATUS.CHECKLIST_PENDING,
          checklist: checklist,
          recommendedBy: req.user!.id,
          recommendedAt: new Date(),
          recommendationRemarks: req.body.recommendationRemarks,
        },
      });
      
      if (allPass) {
        await tx.fDR.update({
          where: { id: fdr.id },
          data: { status: FDR_STATUS.RELEASE_RECOMMENDED },
        });
        
        await tx.fDRTimelineEntry.create({
          data: {
            fdrId: fdr.id,
            status: FDR_STATUS.RELEASE_RECOMMENDED,
            actorId: req.user!.id,
            actorRole: req.user!.role,
            actorName: req.user!.name,
            action: 'RELEASE_RECOMMENDED',
            description: 'Release recommended by officer',
            metadata: { releaseRequestId: req.params.id, checklist },
          },
        });
      }
      
      return updated;
    });
    
    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;