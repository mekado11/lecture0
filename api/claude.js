// AuthorScrolls - Vercel Serverless Function - Claude API Proxy
// Rate limited: 1 AI analysis per user per day (free tier)
const https = require('https');

// Simple in-memory rate limit (resets on cold start, but catches most abuse)
// For production, this should use Firestore or Redis
const rateLimitMap = new Map();
const DAILY_LIMIT = 1; // 1 AI call per user per day for free tier
const PREMIUM_LIMIT = 20; // future premium tier

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'Method not allowed' } }); return; }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) { res.status(500).json({ error: { message: 'API key not configured' } }); return; }
  if (req.body.test) { res.json({ ok: true }); return; }

  // Rate limiting by user ID (passed from client via Firebase auth)
  const userId = req.headers['x-user-id'] || req.body._userId || 'anonymous';
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const key = userId + ':' + today;
  const current = rateLimitMap.get(key) || 0;

  if (current >= DAILY_LIMIT) {
    res.status(429).json({
      error: {
        message: 'Daily AI analysis limit reached. Free tier allows ' + DAILY_LIMIT + ' analysis per day. Upgrade to Premium for ' + PREMIUM_LIMIT + ' analyses per day.',
        code: 'RATE_LIMITED',
        limit: DAILY_LIMIT,
        used: current
      }
    });
    return;
  }

  // Increment counter (only count actual API calls, not test pings)
  rateLimitMap.set(key, current + 1);

  // Clean old entries (prevent memory leak)
  for (const [k] of rateLimitMap) {
    if (!k.endsWith(today)) rateLimitMap.delete(k);
  }

  // Forward to Anthropic
  const body = { ...req.body };
  delete body._userId; // Don't send user ID to Anthropic
  if (body.max_tokens > 2048) body.max_tokens = 2048;
  const payload = JSON.stringify(body);

  const options = {
    hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-api-key': apiKey,
      'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve) => {
    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => { res.status(proxyRes.statusCode).json(JSON.parse(data)); resolve(); });
    });
    proxyReq.on('error', err => { res.status(500).json({ error: { message: err.message } }); resolve(); });
    proxyReq.write(payload); proxyReq.end();
  });
};
