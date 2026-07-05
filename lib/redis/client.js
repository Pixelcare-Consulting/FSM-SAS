/**
 * Shared Redis connection for server-side caching (API routes).
 * When REDIS_URL is unset, all helpers no-op gracefully so the app works unchanged.
 */
import { createClient } from 'redis';

const globalForRedis = globalThis;

/**
 * Lazily connects a singleton client using standard redis v4 semantics.
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
export async function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!globalForRedis.__fsmRedis) {
    const redis = createClient({
      url,
      socket: {
        connectTimeout: 5000,
        reconnectStrategy(retries) {
          if (retries > 5) return new Error('Redis reconnect limit exceeded');
          return Math.min(retries * 200, 2000);
        },
      },
    });
    redis.on('error', (err) => {
      console.error('[redis]', err.message);
    });
    globalForRedis.__fsmRedis = redis;
  }

  const client = globalForRedis.__fsmRedis;
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (e) {
      console.error('[redis] connect failed:', e.message || e);
      return null;
    }
  }
  return client;
}
