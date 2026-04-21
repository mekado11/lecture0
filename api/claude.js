// AuthorScrolls - Multi-Model API Proxy
// Routes: OpenAI (fast/cheap) for most tasks, Claude (premium) for deep analysis
// Rate limited per user per day
const https = require('https');
const { verifyToken, getAdmin } = require('./_auth');
const { checkAndIncrement, getCount } = require('./_ratelimit');

const LIMITS = { dev: 9999, premium: 5, starter: 1, free: 0 };

// Developer admin UIDs (your Firebase UID — unlimited access)
const DEV_UIDS = new Set([
  // Add your Firebase UID here after first sign-in
]);

// Brief in-memory tier cache to avoid hitting Firestore on every request
const tierCache = new Map();
const TIER_CACHE_TTL = 60000; // 1 minute

async function getUserTier(userId) {
  const isDev = DEV_UIDS.has(userId);
  if (isDev) return 'dev';

  const cached = tierCache.get(userId);
  if (cached && Date.now() - cached.ts < TIER_CACHE_TTL) return cached.tier;

  const fb = getAdmin();
  if (fb) {
    try {
      const doc = await fb.firestore().collection('users').doc(userId).get();
      const tier = doc.exists ? (doc.data().tier || 'free') : 'free';
      tierCache.set(userId, { tier, ts: Date.now() });
      return tier;
    } catch (e) { /* Firestore unavailable — fall through */ }
  }
  return 'free';
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = ['https://authorscrolls.com','https://www.authorscrolls.com'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://authorscrolls.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-Model, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'Method not allowed' } }); return; }

  if (req.body.test === true && process.env.NODE_ENV !== 'production') { res.json({ ok: true }); return; }

  // Verify Firebase ID token — fail-closed if configured, warn if not
  const decoded = await verifyToken(req);
  const hasFbAdmin = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  if (hasFbAdmin && !decoded) {
    res.status(401).json({ error: { message: 'Authentication required', code: 'UNAUTHENTICATED' } });
    return;
  }

  // Rate limiting — use verified UID when available, fall back to header only in dev
  const userId = decoded ? decoded.uid : (req.headers['x-user-id'] || 'anonymous');
  const today = new Date().toISOString().split('T')[0];

  const userTier = await getUserTier(userId);
  const limit = LIMITS[userTier] || LIMITS.free;
  const used = await checkAndIncrement(userId, today);

  if (used > limit) {
    res.status(429).json({
      error: {
        message: userTier === 'free'
          ? 'AI features require a subscription. Upgrade to Starter ($5/mo) for 1 AI analysis per day.'
          : 'Daily AI limit reached (' + limit + '/day). Upgrade for more, or wait until midnight UTC.',
        code: 'RATE_LIMITED', limit, used: used - 1, tier: userTier
      }
    });
    return;
  }

  // Determine which model/provider to use
  const ALLOWED_ROUTES = new Set(['claude','claude-premium','openai-fast','openai-nano','openai-premium']);
  const requestedModel = req.headers['x-model'] || 'openai-fast';
  if (!ALLOWED_ROUTES.has(requestedModel)) {
    res.status(400).json({ error: { message: 'Invalid model route' } }); return;
  }

  // Extract only allowed fields — never forward arbitrary client payload
  const sanitized = {
    system: req.body.system || [],
    messages: req.body.messages || [],
    max_tokens: Math.min(Number(req.body.max_tokens) || 2048, 2048)
  };

  if (requestedModel === 'claude' || requestedModel === 'claude-premium') {
    return callClaude(sanitized, res);
  } else {
    return callOpenAI(sanitized, requestedModel, res);
  }
};

function callClaude(body, res) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) { res.status(500).json({ error: { message: 'Claude API key not configured' } }); return Promise.resolve(); }

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: body.max_tokens,
    system: body.system,
    messages: body.messages
  });

  const options = {
    hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'x-api-key': apiKey,
      'anthropic-version': '2023-06-01', 'anthropic-beta': 'prompt-caching-2024-07-31',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise(resolve => {
    const proxyReq = https.request(options, proxyRes => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try { res.status(proxyRes.statusCode).json(JSON.parse(data)); }
        catch (e) { res.status(500).json({ error: { message: 'Invalid response from Claude' } }); }
        resolve();
      });
    });
    proxyReq.on('error', err => { res.status(500).json({ error: { message: err.message } }); resolve(); });
    proxyReq.write(payload); proxyReq.end();
  });
}

function callOpenAI(body, model, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback to Claude if no OpenAI key
    return callClaude(convertToClaude(body), res);
  }

  // Map our model names to OpenAI models
  const modelMap = {
    'openai-fast': 'gpt-4.1-mini',
    'openai-nano': 'gpt-4.1-nano',
    'openai-premium': 'gpt-4.1'
  };
  const openaiModel = modelMap[model] || 'gpt-4.1-mini';

  // Convert from Claude format to OpenAI format
  const messages = [];
  if (body.system) {
    const sysText = Array.isArray(body.system) ? body.system.map(s => s.text).join('\n\n') : body.system;
    messages.push({ role: 'system', content: sysText });
  }
  if (body.messages) {
    body.messages.forEach(m => messages.push({ role: m.role, content: m.content }));
  }

  const payload = JSON.stringify({
    model: openaiModel,
    messages,
    max_tokens: Math.min(body.max_tokens || 2048, 2048),
    temperature: 0.7
  });

  const options = {
    hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise(resolve => {
    const proxyReq = https.request(options, proxyRes => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            res.status(proxyRes.statusCode).json({ error: { message: parsed.error.message } });
          } else {
            // Convert OpenAI response to Claude-compatible format
            const content = parsed.choices?.[0]?.message?.content || '';
            res.json({
              content: [{ type: 'text', text: content }],
              usage: {
                input_tokens: parsed.usage?.prompt_tokens || 0,
                output_tokens: parsed.usage?.completion_tokens || 0
              },
              _provider: 'openai', _model: openaiModel
            });
          }
        } catch (e) { res.status(500).json({ error: { message: 'Invalid response from OpenAI' } }); }
        resolve();
      });
    });
    proxyReq.on('error', err => { res.status(500).json({ error: { message: err.message } }); resolve(); });
    proxyReq.write(payload); proxyReq.end();
  });
}

function convertToClaude(body) {
  // Body is already in Claude format, just return it
  return body;
}
