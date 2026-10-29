/**
 * Backend Entry Point
 * Starts the Express server
 */

import app from './app';
import { config } from './config';
import logger from './lib/logger';
import { connectRedis } from './lib/redis';

const PORT = config.PORT;
const HOST = config.HOST;

async function startServer() {
  try {
    // Connect to Redis
    await connectRedis();
    
    // Start HTTP server
    const server = app.listen(PORT, HOST, () => {
      logger.info({
        port: PORT,
        host: HOST,
        environment: config.NODE_ENV,
        version: config.APP_VERSION,
      }, '🚀 FDR Portal API server started');
      
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║  FDR Portal API Server                                      ║
║  ─────────────────────────────────────────────────────────  ║
║  Environment: ${config.NODE_ENV.padEnd(43)}║
║  Version: ${config.APP_VERSION.padEnd(49)}║
║  Server: http://${HOST}:${PORT}                                    ║
║  Health: http://${HOST}:${PORT}/health                                ║
║  Docs: http://${HOST}:${PORT}/api-docs                                ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutting down server...');
      server.close(async () => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      
      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();