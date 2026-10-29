/**
 * Logger Configuration
 * Uses Pino for structured JSON logging
 */

import pino from 'pino';
import { config } from '../config';

const logLevel = config.LOG_LEVEL;

const logger = pino({
  level: logLevel,
  transport: config.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss Z',
      ignore: 'pid,hostname',
    },
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'fdr-portal-api',
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
  },
});

// Create child logger with context
export function createLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

// Export default logger
export default logger;