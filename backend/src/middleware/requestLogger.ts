/**
 * Request Logger Middleware
 * Logs all incoming requests with timing and response info
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../lib/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  const correlationId = req.correlationId || 'unknown';

  // Log incoming request
  logger.info({
    correlationId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    query: req.query,
    body: sanitizeBody(req.body),
    userId: req.user?.id,
  }, 'Incoming request');

  // Capture original send function
  const originalSend = res.send;

  // Override send to log response
  res.send = function (body?: any): Response {
    const duration = Date.now() - startTime;
    
    // Log response
    logger.info({
      correlationId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('content-length') || body?.length || 0,
      userId: req.user?.id,
    }, 'Request completed');

    // Call original send
    return originalSend.call(this, body);
  };

  next();
}

function sanitizeBody(body: any): any {
  if (!body || typeof body !== 'object') return body;

  const sanitized = { ...body };
  
  // List of sensitive fields to redact
  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'refreshToken',
    'accessToken',
    'secret',
    'apiKey',
    'otp',
    'mfaCode',
    'mfaSecret',
    'mfaBackupCodes',
    'cardNumber',
    'cvv',
    'ssn',
    'aadhaar',
  ];

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
}