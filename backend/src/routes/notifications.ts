import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { NotificationType, NotificationChannel } from '@fdr-portal/shared/types';

const router: Router = Router();

router.use(authMiddleware);
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/notifications
 * Get user notifications
 */
router.get('/',
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, unreadOnly, type } = req.query;
    
    const where: any = { userId: req.user!.id };
    if (unreadOnly === 'true') where.readAt = null;
    if (type) where.type = Array.isArray(type) ? { in: type } : type;
    
    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
    ]);
    
    res.json({
      success: true,
      data: notifications,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId!,
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
        unreadCount,
      },
    });
  })
);

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark notification as read
 */
router.patch('/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });
    
    if (!notification) {
      throw new NotFoundError('Notification');
    }
    
    if (notification.userId !== req.user!.id) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { readAt: new Date() },
    });
    
    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PATCH /api/v1/notifications/read-all
 * Mark all notifications as read
 */
router.patch('/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    
    res.json({
      success: true,
      data: { message: 'All notifications marked as read' },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/notifications/unread-count
 * Get unread notification count
 */
router.get('/unread-count',
  asyncHandler(async (req: Request, res: Response) => {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, readAt: null },
    });
    
    res.json({
      success: true,
      data: { count },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;