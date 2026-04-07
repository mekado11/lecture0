// ManuscriptLens API Proxy Server
// Keeps your Claude API key on the server, never exposed to the browser.
// Usage: CLAUDE_API_KEY=sk-ant-xxx node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.CLAUDE_API_KEY || '';

if (!API_KEY) {
  console.error('ERROR: Set CLAUDE_API_KEY environment variable');
  console.error('Usage: CLAUDE_API_KEY=sk-ant-xxx node server.js');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // API proxy endpoint
  if (req.url === '/api/claude' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        // Test ping
        if (parsed.test) { res.writeHead(200, {'Content-Type':'application/json'}); res.end('{"ok":true}'); return; }

        // Forward to Anthropic with server-side API key
        const https = require('https');
        const payload = JSON.stringify(parsed);
        const options = {
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'prompt-caching-2024-07-31',
            'Content-Length': Buffer.byteLength(payload)
          }
        };

        const proxyReq = https.request(options, proxyRes => {
          let data = '';
          proxyRes.on('data', chunk => data += chunk);
          proxyRes.on('end', () => {
            res.writeHead(proxyRes.statusCode, {'Content-Type':'application/json'});
            res.end(data);
          });
        });
        proxyReq.on('error', err => {
          res.writeHead(500, {'Content-Type':'application/json'});
          res.end(JSON.stringify({error:{message:err.message}}));
        });
        proxyReq.write(payload);
        proxyReq.end();
      } catch (err) {
        res.writeHead(400, {'Content-Type':'application/json'});
        res.end(JSON.stringify({error:{message:'Invalid request: '+err.message}}));
      }
    });
    return;
  }

  // Static file serving
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {'Content-Type': contentType});
    res.end(content);
  } catch (err) {
    res.writeHead(404, {'Content-Type':'text/plain'});
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ManuscriptLens Server running on http://localhost:' + PORT);
  console.log('  API Key: ' + API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 4));
  console.log('  AI Critique features: ENABLED');
  console.log('');
});
