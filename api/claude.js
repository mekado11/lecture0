// AuthorScrolls - Multi-Model API Proxy
// Routes: OpenAI (fast/cheap) for most tasks, Claude (premium) for deep analysis
// Rate limited per user per day
const https = require('https');
const { verifyToken, getAdmin } = require('./_auth');
const { checkAndIncrement, analysisRun, openAnalysisRun } = require('./_ratelimit');

const LIMITS = { dev: 9999, beta: 50, premium: 75, starter: 25, free: 0 };
// Whole-manuscript AI analysis runs once per 24 hours (see _ratelimit.analysisRun). Ask Book,
// rewrites and fixes are per-request features and stay on the daily count above.
const ANALYSIS_FEATURES = new Set(['deepcritique','chapterbreakdown','openinganalysis','weaknessanalysis','comptitles','queryletter','betareaders','marketreadiness','editingroadmap','readersimulation','smartscan','calibrateissues']);

async function getUserTier(userId) {
  const fb = getAdmin();
  if (fb) {
    try {
      // Admin reads bypass Rules. Check the same deletion boundary explicitly,
      // including privileged accounts, and never reuse stale authorization.
      const db = fb.firestore();
      const [profile, deletion] = await db.getAll(
        db.collection('users').doc(userId),
        db.collection('accountDeletions').doc(userId)
      );
      if (deletion.exists) return 'free';
      if ((process.env.ADMIN_UIDS||'').split(',').map(s=>s.trim()).includes(userId)) return 'dev';
      const tier = profile.exists ? profile.data().tier : 'free';
      return typeof tier === 'string' && Object.hasOwn(LIMITS,tier) ? tier : 'free';
    } catch (_) { return null; } // Unavailable authority is not a cached grant.
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Id, X-Model, X-Feature, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // GET = health check (C-1 fix: no config details exposed publicly)
  if (req.method === 'GET') {
    const fb = getAdmin();
    res.status(200).json({
      status: fb ? 'ok' : 'misconfigured'
    });
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'Method not allowed' } }); return; }

  // Verify Firebase ID token — always fail closed; no fallback to client-supplied identity
  const auth = await verifyToken(req);
  if (!auth.user) {
    const diagMessages = {
      no_token: 'No Authorization header sent by client',
      admin_not_configured: 'Server misconfigured: Firebase Admin not initialized (set FIREBASE_PROJECT_ID or FIREBASE_SERVICE_ACCOUNT env var)',
      token_invalid: 'Token verification failed: ' + (auth.detail || 'unknown'),
      init_error: 'Firebase Admin failed to initialize'
    };
    res.status(401).json({
      error: {
        message: 'Authentication required',
        code: 'UNAUTHENTICATED',
        reason: auth.reason,
        diagnostic: diagMessages[auth.reason] || auth.reason
      }
    });
    return;
  }

  const decoded = auth.user;
  const userId = decoded.uid;
  const today = new Date().toISOString().split('T')[0];

  const userTier = await getUserTier(userId);
  if (userTier === null) {
    res.status(503).json({error:{message:'Access verification unavailable. Please try again.',code:'ACCESS_UNAVAILABLE'}});
    return;
  }
  const limit = LIMITS[userTier] || LIMITS.free;

  // The server owns model authorization. Client routing is only a request hint.
  const ALLOWED_ROUTES = new Set(['claude','claude-premium','openai-fast','openai-nano','openai-premium']);
  const requestedModel = req.headers['x-model'] || 'openai-fast';
  const requestedFeature = String(req.headers['x-feature'] || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  if (!ALLOWED_ROUTES.has(requestedModel)) {
    res.status(400).json({ error: { message: 'Invalid model route' } }); return;
  }
  const ROUTES_BY_TIER = {
    free: new Set(),
    starter: new Set(['openai-fast','openai-nano']),
    beta: new Set(['openai-fast','openai-nano','claude']),
    premium: new Set(['openai-fast','openai-nano','openai-premium','claude','claude-premium']),
    dev: ALLOWED_ROUTES
  };
  const permittedRoutes = ROUTES_BY_TIER[userTier] || ROUTES_BY_TIER.free;
  if (!permittedRoutes.has(requestedModel)) {
    res.status(403).json({ error: { message: 'This AI route is not available for your subscription tier', code: 'MODEL_NOT_ALLOWED', tier: userTier } }); return;
  }

  // Extract only allowed fields — never forward arbitrary client payload.
  // Bound prompt size at the server even if a modified client bypasses UI/retrieval budgets.
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const system = Array.isArray(body.system) ? body.system : [];
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const promptChars = JSON.stringify({ system, messages }).length;
  const MAX_PROMPT_CHARS = 120000;
  if (promptChars > MAX_PROMPT_CHARS) {
    res.status(413).json({ error: { message: 'AI request context is too large', code: 'PROMPT_TOO_LARGE', maxChars: MAX_PROMPT_CHARS } }); return;
  }
  if (!messages.length || messages.length > 12) {
    res.status(400).json({ error: { message: 'Invalid AI message payload', code: 'INVALID_MESSAGES' } }); return;
  }
  const sanitized = {
    system,
    messages,
    max_tokens: Math.min(Math.max(Number(body.max_tokens) || 2048, 64), 2048)
  };
  // Feature identity is metadata only; authorization remains server-owned.
  res.setHeader('X-AuthorScrolls-Feature', requestedFeature);

  // Count only authenticated, authorized, structurally valid requests.
  const needsClaude=requestedModel==='claude'||requestedModel==='claude-premium';
  if(!(needsClaude?process.env.CLAUDE_API_KEY:process.env.OPENAI_API_KEY))return res.status(503).json({error:{message:'Requested provider is unavailable'}});
  // One AI analysis run per 24 hours. Checked before the daily count so a blocked run is
  // not charged against it; the dev tier is exempt so the feature can be exercised.
  const isAnalysis = ANALYSIS_FEATURES.has(requestedFeature) && userTier !== 'dev';
  let run = null;
  if (isAnalysis) {
    try { run = await analysisRun(userId, Date.now()); }
    catch (_) { return res.status(503).json({ error: { message: 'Usage verification unavailable. Please try again.' } }); }
    if (!run.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((run.nextAt - Date.now()) / 1000))));
      res.status(429).json({
        error: {
          message: 'AI analysis runs once every 24 hours. The next run is available at ' + new Date(run.nextAt).toISOString() + '.',
          code: 'ANALYSIS_COOLDOWN', startedAt: run.startedAt, nextAt: run.nextAt
        }
      }); return;
    }
  }
  let used;
  try{used=await checkAndIncrement(userId,today);}
  catch(_){return res.status(503).json({error:{message:'Usage verification unavailable. Please try again.'}});}
  if (used > limit) {
    res.status(429).json({
      error: {
        message: userTier === 'free' ? 'AI features require a subscription.' : 'Daily AI limit reached (' + limit + '/day). Try again after the daily reset.',
        code: 'RATE_LIMITED', limit, used: used - 1, tier: userTier
      }
    }); return;
  }

  const status = (requestedModel === 'claude' || requestedModel === 'claude-premium')
    ? await callClaude(sanitized, res)
    : await callOpenAI(sanitized, requestedModel, res);
  // The run opens on the first successful analysis response, never on a failed one.
  if (isAnalysis && run && run.startedAt == null && status >= 200 && status < 300) {
    try { await openAnalysisRun(userId, Date.now()); } catch (_) { /* the response has been sent; nothing to add */ }
  }
};

function callClaude(body, res) {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) { res.status(500).json({ error: { message: 'Claude API key not configured' } }); return Promise.resolve(500); }

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
        let status = proxyRes.statusCode;
        try { res.status(proxyRes.statusCode).json(JSON.parse(data)); }
        catch (e) { status = 500; res.status(500).json({ error: { message: 'Invalid response from Claude' } }); }
        resolve(status);
      });
    });
    proxyReq.on('error', err => { res.status(500).json({ error: { message: err.message } }); resolve(500); });
    proxyReq.setTimeout(30000,()=>proxyReq.destroy(new Error('Provider request timed out')));
    proxyReq.write(payload); proxyReq.end();
  });
}

function callOpenAI(body, model, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(503).json({error:{message:'Requested provider is unavailable'}});
    return Promise.resolve(503);
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
        let status = proxyRes.statusCode;
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
        } catch (e) { status = 500; res.status(500).json({ error: { message: 'Invalid response from OpenAI' } }); }
        resolve(status);
      });
    });
    proxyReq.on('error', err => { res.status(500).json({ error: { message: err.message } }); resolve(500); });
    proxyReq.setTimeout(30000,()=>proxyReq.destroy(new Error('Provider request timed out')));
    proxyReq.write(payload); proxyReq.end();
  });
}
