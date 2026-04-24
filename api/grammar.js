// Server-side proxy for LanguageTool API
// Avoids CORS issues and prevents abuse of the public API
const https = require('https');

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = ['https://authorscrolls.com','https://www.authorscrolls.com'];
  if (allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://authorscrolls.com');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const text = req.body?.text;
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'Missing text field' }); return;
  }
  if (text.length > 20000) {
    res.status(400).json({ error: 'Text too long (max 20000 chars)' }); return;
  }

  const params = new URLSearchParams({
    text: text,
    language: req.body.language || 'en-US',
    disabledCategories: 'CASING,REDUNDANCY,STYLE,TYPOGRAPHY',
    disabledRules: 'WHITESPACE_RULE,EN_QUOTES,DASH_RULE,WORD_CONTAINS_UNDERSCORE,COMMA_PARENTHESIS_WHITESPACE,UNLIKELY_OPENING_PUNCTUATION',
    level: 'default'
  });

  const postData = params.toString();
  const options = {
    hostname: 'api.languagetool.org',
    path: '/v2/check',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'AuthorScrolls/1.0'
    }
  };

  return new Promise(resolve => {
    const proxyReq = https.request(options, proxyRes => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          res.status(proxyRes.statusCode).json(JSON.parse(data));
        } catch (e) {
          res.status(502).json({ error: 'Invalid response from LanguageTool' });
        }
        resolve();
      });
    });
    proxyReq.on('error', err => {
      res.status(502).json({ error: 'LanguageTool unavailable: ' + err.message });
      resolve();
    });
    proxyReq.write(postData);
    proxyReq.end();
  });
};
