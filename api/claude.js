// AuthorScrolls - Multi-Model API Proxy
// Routes: OpenAI (fast/cheap) for most tasks, Claude (premium) for deep analysis
// Rate limited per user per day
const https = require('https');

const rateLimitMap = new Map();
const FREE_AI_LIMIT = 3;   // 3 AI calls/day free
const PREMIUM_AI_LIMIT = 50; // 50/day for $5/mo

// Premium users (checked via Stripe webhook or manual list)
// In production, check Firestore for user.premium = true
const PREMIUM_USERS = new Set(); // populated by webhook

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

  if (req.body.test) { res.json({ ok: true }); return; }

  // Rate limiting
  const userId = req.headers['x-user-id'] || 'anonymous';
  const today = new Date().toISOString().split('T')[0];
  const key = userId + ':' + today;
  const current = rateLimitMap.get(key) || 0;
  const isPremium = PREMIUM_USERS.has(userId);
  const limit = isPremium ? PREMIUM_AI_LIMIT : FREE_AI_LIMIT;

  if (current >= limit) {
    res.status(429).json({
      error: {
        message: isPremium
          ? 'Premium daily limit reached (' + limit + '/day). Resets at midnight UTC.'
          : 'Free daily limit reached. Upgrade to Premium for ' + PREMIUM_AI_LIMIT + ' AI analyses per day.',
        code: 'RATE_LIMITED', limit, used: current, isPremium
      }
    });
    return;
  }
  rateLimitMap.set(key, current + 1);
  for (const [k] of rateLimitMap) { if (!k.endsWith(today)) rateLimitMap.delete(k); }

  // Determine which model/provider to use
  const requestedModel = req.headers['x-model'] || req.body._model || 'openai-fast';
  delete req.body._model;
  delete req.body._userId;

  if (requestedModel === 'claude' || requestedModel === 'claude-premium') {
    // === CLAUDE (premium deep analysis) ===
    return callClaude(req.body, res);
  } else {
    // === OPENAI (fast/cheap for most tasks) ===
    return callOpenAI(req.body, requestedModel, res);
  }
};

function callClaude(body, res) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) { res.status(500).json({ error: { message: 'Claude API key not configured' } }); return Promise.resolve(); }

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
