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
  if(!r&&(process.env.VERCEL||process.env.NODE_ENV==='production'))throw new Error('Persistent rate limiter unavailable');

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
  if(!r&&(process.env.VERCEL||process.env.NODE_ENV==='production'))throw new Error('Persistent rate limiter unavailable');

  if (r) {
    return parseInt(await r.get(key), 10) || 0;
  }
  return fallbackMap.get(key) || 0;
}

// AI analysis runs once per 24 hours per user. A "run" is the burst of analysis requests an
// author fires together (deep critique, roadmap, opening…), so requests are allowed for a
// grace window after the run opens; after that the next run is 24 hours from the opening.
// The run opens only after a provider request succeeds, so a failed call does not spend it.
const ANALYSIS_PERIOD_MS = 24 * 60 * 60 * 1000;
const ANALYSIS_GRACE_MS = 15 * 60 * 1000;
const runFallback = new Map();

async function analysisRun(userId, nowMs = Date.now()) {
  const key = 'ai:run:' + userId;
  const r = getRedis();
  if(!r&&(process.env.VERCEL||process.env.NODE_ENV==='production'))throw new Error('Persistent rate limiter unavailable');
  let startedAt = null;
  if (r) { const raw = await r.get(key); startedAt = raw == null ? null : Number(raw); }
  else {
    const entry = runFallback.get(key);
    if (entry && entry.expiresAt > nowMs) startedAt = entry.startedAt; else runFallback.delete(key);
  }
  if (startedAt == null || !Number.isFinite(startedAt)) return { allowed: true, startedAt: null, nextAt: null };
  const nextAt = startedAt + ANALYSIS_PERIOD_MS;
  if (nowMs >= nextAt) return { allowed: true, startedAt: null, nextAt: null };
  return { allowed: nowMs - startedAt <= ANALYSIS_GRACE_MS, startedAt, nextAt };
}

async function openAnalysisRun(userId, nowMs = Date.now()) {
  const key = 'ai:run:' + userId;
  const r = getRedis();
  if(!r&&(process.env.VERCEL||process.env.NODE_ENV==='production'))throw new Error('Persistent rate limiter unavailable');
  if (r) { await r.set(key, String(nowMs), { nx: true, ex: Math.ceil(ANALYSIS_PERIOD_MS / 1000) }); return; }
  const entry = runFallback.get(key);
  if (!entry || entry.expiresAt <= nowMs) runFallback.set(key, { startedAt: nowMs, expiresAt: nowMs + ANALYSIS_PERIOD_MS });
}

module.exports = { checkAndIncrement, getCount, analysisRun, openAnalysisRun, ANALYSIS_PERIOD_MS, ANALYSIS_GRACE_MS };
