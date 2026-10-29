import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ValidationError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { NotificationType } from '@fdr-portal/shared/types';
import { createWebhookSchema, updateWebhookSchema } from '@fdr-portal/shared/validators';
import crypto from 'crypto';

const router: Router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/webhooks
 * List all webhooks
 */
router.get('/',
  asyncHandler(async (req: Request, res: Response) => {
    const webhooks = await prisma.webhook.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { deliveries: true } },
      },
    });
    
    res.json({
      success: true,
      data: webhooks,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/webhooks/:id
 * Get webhook details
 */
router.get('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
      include: {
        deliveries: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        _count: { select: { deliveries: true } },
      },
    });
    
    if (!webhook) {
      throw new NotFoundError('Webhook');
    }
    
    res.json({
      success: true,
      data: webhook,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/webhooks
 * Create webhook
 */
router.post('/',
  asyncHandler(async (req: Request, res: Response) => {
    const validated = createWebhookSchema.parse(req.body);
    
    // Generate secret
    const secret = crypto.randomBytes(32).toString('hex');
    
    const webhook = await prisma.webhook.create({
      data: {
        name: validated.name,
        url: validated.url,
        events: validated.events,
        secret,
        createdBy: req.user!.id,
      },
    });
    
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: { ...webhook, secret }, // Only return secret on creation
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PATCH /api/v1/webhooks/:id
 * Update webhook
 */
router.patch('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const validated = updateWebhookSchema.parse(req.body);
    
    const webhook = await prisma.webhook.update({
      where: { id: req.params.id },
      data: validated,
    });
    
    res.json({
      success: true,
      data: webhook,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * DELETE /api/v1/webhooks/:id
 * Delete webhook
 */
router.delete('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.webhook.delete({ where: { id: req.params.id } });
    
    res.json({
      success: true,
      data: { message: 'Webhook deleted' },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/webhooks/:id/test
 * Test webhook delivery
 */
router.post('/:id/test',
  asyncHandler(async (req: Request, res: Response) => {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.id },
    });
    
    if (!webhook) {
      throw new NotFoundError('Webhook');
    }
    
    // Send test payload
    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery' },
    };
    
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(JSON.stringify(testPayload))
      .digest('hex');
    
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': 'webhook.test',
        },
        body: JSON.stringify(testPayload),
      });
      
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: 'webhook.test',
          payload: testPayload,
          responseStatus: response.status,
          responseBody: await response.text(),
          attempts: 1,
          succeededAt: response.ok ? new Date() : null,
        },
      });
      
      res.json({
        success: true,
        data: { status: response.status, ok: response.ok },
        meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
      });
    } catch (error: any) {
      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event: 'webhook.test',
          payload: testPayload,
          responseStatus: 0,
          responseBody: error.message,
          attempts: 1,
        },
      });
      
      throw new AppError(`Webhook delivery failed: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
  })
);

/**
 * POST /api/v1/webhooks/:id/retry/:deliveryId
 * Retry failed webhook delivery
 */
router.post('/:id/retry/:deliveryId',
  asyncHandler(async (req: Request, res: Response) => {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: req.params.deliveryId },
      include: { webhook: true },
    });
    
    if (!delivery) {
      throw new NotFoundError('Delivery');
    }
    
    if (delivery.webhookId !== req.params.id) {
      throw new AppError('Delivery does not belong to this webhook', HttpStatus.BAD_REQUEST);
    }
    
    const signature = crypto
      .createHmac('sha256', delivery.webhook.secret)
      .update(JSON.stringify(delivery.payload))
      .digest('hex');
    
    try {
      const response = await fetch(delivery.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': delivery.event,
        },
        body: JSON.stringify(delivery.payload),
      });
      
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          responseStatus: response.status,
          responseBody: await response.text(),
          attempts: { increment: 1 },
          succeededAt: response.ok ? new Date() : null,
          nextRetryAt: response.ok ? null : new Date(Date.now() + 5 * 60 * 1000), // retry in 5 min
        },
      });
      
      res.json({
        success: true,
        data: { status: response.status, ok: response.ok },
        meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
      });
    } catch (error: any) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          responseBody: error.message,
          attempts: { increment: 1 },
          nextRetryAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });
      
      throw new AppError(`Webhook retry failed: ${error.message}`, HttpStatus.BAD_GATEWAY);
    }
  })
);

export default router;