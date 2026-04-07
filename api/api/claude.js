// Vercel Serverless Function - Claude API Proxy
// API key from environment variable (set in Vercel dashboard)
const https = require('https');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'Method not allowed' } }); return; }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) { res.status(500).json({ error: { message: 'API key not configured' } }); return; }

  // Test ping
  if (req.body.test) { res.json({ ok: true }); return; }

  // Forward to Anthropic
  const body = { ...req.body };
  if (body.max_tokens > 2048) body.max_tokens = 2048;
  const payload = JSON.stringify(body);

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'prompt-caching-2024-07-31',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve) => {
    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        res.status(proxyRes.statusCode).json(JSON.parse(data));
        resolve();
      });
    });
    proxyReq.on('error', err => {
      res.status(500).json({ error: { message: err.message } });
      resolve();
    });
    proxyReq.write(payload);
    proxyReq.end();
  });
};
