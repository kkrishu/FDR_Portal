/**
 * Error Handling Middleware
 * Centralized error handling for the application
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import logger from '../lib/logger';
import { ApiResponse, ApiError, ErrorCodes, HttpStatus } from '@fdr-portal/shared';

// Custom error classes
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: string = ErrorCodes.INTERNAL_ERROR, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', code: string = ErrorCodes.TOKEN_INVALID) {
    super(message, HttpStatus.UNAUTHORIZED, code);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', code: string = ErrorCodes.FORBIDDEN) {
    super(message, HttpStatus.FORBIDDEN, code);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, HttpStatus.NOT_FOUND, ErrorCodes.FDR_NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = ErrorCodes.DUPLICATE_FDR) {
    super(message, HttpStatus.CONFLICT, code);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMIT_EXCEEDED);
  }
}

// Error handler middleware
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  const correlationId = req.correlationId || 'unknown';
  
  // Log error with context
  logger.error({
    err,
    correlationId,
    method: req.method,
    url: req.originalUrl,
    userId: req.user?.id,
    ip: req.ip,
  }, 'Request error');

  // Default error response
  let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
  let code: string = ErrorCodes.INTERNAL_ERROR;
  let message = 'Internal server error';
  let details: Record<string, unknown> | undefined;

  // Handle known error types
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = HttpStatus.BAD_REQUEST;
    code = ErrorCodes.VALIDATION_ERROR;
    message = 'Validation failed';
    details = {
      errors: err.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
    };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Handle Prisma specific errors
    if (err.code === 'P2002') {
      statusCode = HttpStatus.CONFLICT;
      code = ErrorCodes.DUPLICATE_FDR;
      message = 'A record with this value already exists';
      details = { field: err.meta?.target };
    } else if (err.code === 'P2025') {
      statusCode = HttpStatus.NOT_FOUND;
      code = ErrorCodes.FDR_NOT_FOUND;
      message = 'Record not found';
    }
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = HttpStatus.UNAUTHORIZED;
    code = ErrorCodes.TOKEN_INVALID;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = HttpStatus.UNAUTHORIZED;
    code = ErrorCodes.TOKEN_EXPIRED;
    message = 'Token expired';
  } else if (err.name === 'MulterError') {
    statusCode = HttpStatus.BAD_REQUEST;
    code = ErrorCodes.INVALID_DOCUMENTS;
    message = err.message;
  }

  // Build response
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: correlationId,
    },
  };

  // Don't expose internal errors in production
  if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR && process.env.NODE_ENV === 'production') {
    response.error!.message = 'An unexpected error occurred';
    response.error!.details = undefined;
  }

  res.status(statusCode).json(response);
}

// 404 handler
export function notFoundHandler(req: Request, res: Response) {
  const correlationId = req.correlationId || 'unknown';
  
  logger.warn({
    correlationId,
    method: req.method,
    url: req.originalUrl,
  }, 'Route not found');

  const response: ApiResponse = {
    success: false,
    error: {
      code: ErrorCodes.ROUTE_NOT_FOUND,
      message: `Route ${req.method} ${req.originalUrl} not found`,
      details: {
        path: req.originalUrl,
        method: req.method,
        hint: 'Available API routes are mounted under /api/v1. Try GET /health or see /api-docs.',
      },
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: correlationId,
    },
  };

  res.status(HttpStatus.NOT_FOUND).json(response);
}

// Async handler wrapper
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Re-export ErrorCodes and HttpStatus for convenience
export { ErrorCodes, HttpStatus } from '@fdr-portal/shared';