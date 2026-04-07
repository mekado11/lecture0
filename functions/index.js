// ManuscriptLens - Firebase Cloud Function
// Proxies requests to Claude API with server-side API key
// Deploy: firebase deploy --only functions

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const https = require("https");

// API key stored as Firebase secret (never in code)
const claudeApiKey = defineSecret("CLAUDE_API_KEY");

exports.claude = onRequest(
  {
    cors: true,
    secrets: [claudeApiKey],
    memory: "256MiB",
    timeoutSeconds: 120,
    maxInstances: 10,
  },
  async (req, res) => {
    // Only POST
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Method not allowed" } });
      return;
    }

    // Test ping
    if (req.body.test) {
      res.json({ ok: true });
      return;
    }

    // Validate request has required fields
    if (!req.body.model || !req.body.messages) {
      res.status(400).json({ error: { message: "Missing model or messages" } });
      return;
    }

    // Rate limiting: max 2048 tokens output, max 15000 chars of manuscript
    const body = { ...req.body };
    if (body.max_tokens > 2048) body.max_tokens = 2048;

    // Forward to Anthropic
    const payload = JSON.stringify(body);
    const apiKey = claudeApiKey.value();

    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    return new Promise((resolve) => {
      const proxyReq = https.request(options, (proxyRes) => {
        let data = "";
        proxyRes.on("data", (chunk) => (data += chunk));
        proxyRes.on("end", () => {
          res.status(proxyRes.statusCode).json(JSON.parse(data));
          resolve();
        });
      });

      proxyReq.on("error", (err) => {
        res.status(500).json({ error: { message: err.message } });
        resolve();
      });

      proxyReq.write(payload);
      proxyReq.end();
    });
  }
);
