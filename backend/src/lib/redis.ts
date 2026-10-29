/**
 * Redis Client Configuration
 * Uses ioredis with connection pooling and retry logic
 */

import Redis from 'ioredis';
import { config } from '../config';
import logger from './logger';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (!config.REDIS_URL) {
    logger.warn('Redis URL not configured, Redis features disabled');
    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      if (times > 3) {
        logger.error('Redis max retries reached');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    reconnectOnError: (err) => {
      const targetErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
      return targetErrors.some(e => err.message.includes(e));
    },
    lazyConnect: true,
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('error', (err) => {
    logger.error({ err }, 'Redis error');
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  redisClient.on('reconnecting', () => {
    logger.info('Redis reconnecting...');
  });

  return redisClient;
}

export async function connectRedis(): Promise<Redis | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    // Reuse the live connection instead of re-connecting on every health check
    if (client.status === 'ready' || client.status === 'connecting') {
      return client;
    }
    await client.connect();
    return client;
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to Redis');
    return null;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected');
  }
}

// Cache helpers
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient();
    if (!client) return null;

    try {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error({ err: error, key }, 'Cache get error');
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const client = getRedisClient();
    if (!client) return false;

    try {
      await client.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error({ err: error, key }, 'Cache set error');
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    const client = getRedisClient();
    if (!client) return false;

    try {
      await client.del(key);
      return true;
    } catch (error) {
      logger.error({ err: error, key }, 'Cache delete error');
      return false;
    }
  },

  async exists(key: string): Promise<boolean> {
    const client = getRedisClient();
    if (!client) return false;

    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ err: error, key }, 'Cache exists error');
      return false;
    }
  },

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    const client = getRedisClient();
    if (!client) return 0;

    try {
      const count = await client.incr(key);
      if (ttlSeconds && count === 1) {
        await client.expire(key, ttlSeconds);
      }
      return count;
    } catch (error) {
      logger.error({ err: error, key }, 'Cache increment error');
      return 0;
    }
  },
};

// Rate limiting helpers
export const rateLimiter = {
  async checkLimit(key: string, max: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const client = getRedisClient();
    if (!client) return { allowed: true, remaining: max, resetAt: Date.now() + windowSeconds * 1000 };

    try {
      const current = await client.incr(key);
      if (current === 1) {
        await client.expire(key, windowSeconds);
      }

      const ttl = await client.ttl(key);
      return {
        allowed: current <= max,
        remaining: Math.max(0, max - current),
        resetAt: Date.now() + ttl * 1000,
      };
    } catch (error) {
      logger.error({ err: error, key }, 'Rate limit check error');
      return { allowed: true, remaining: max, resetAt: Date.now() + windowSeconds * 1000 };
    }
  },
};

export default getRedisClient;