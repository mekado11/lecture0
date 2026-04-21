// Persistent rate limiting via Upstash Redis.
// Falls back to in-memory Map when Redis is not configured (dev only).
// Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.

'use strict';

let redis = null;
let redisInitialized = false;
const fallbackMap = new Map();

function getRedis() {
  if (redisInitialized) return redis;
  redisInitialized = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.warn('Rate limiting: UPSTASH_REDIS_REST_URL/TOKEN not set — using in-memory fallback (resets on cold start)');
    return null;
  }
  try {
    const { Redis } = require('@upstash/redis');
    redis = new Redis({ url, token });
    return redis;
  } catch (e) {
    console.error('Rate limiting: Redis init failed:', e.message);
    return null;
  }
}

async function checkAndIncrement(userId, today) {
  const key = 'rl:' + userId + ':' + today;
  const r = getRedis();

  if (r) {
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, 86400);
    }
    return count;
  }

  // In-memory fallback
  const current = fallbackMap.get(key) || 0;
  fallbackMap.set(key, current + 1);
  for (const [k] of fallbackMap) {
    if (!k.endsWith(today)) fallbackMap.delete(k);
  }
  return current + 1;
}

async function getCount(userId, today) {
  const key = 'rl:' + userId + ':' + today;
  const r = getRedis();

  if (r) {
    return (await r.get(key)) || 0;
  }
  return fallbackMap.get(key) || 0;
}

module.exports = { checkAndIncrement, getCount };
