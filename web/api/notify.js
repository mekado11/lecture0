// AuthorScrolls — /api/notify (Vercel)
// Lightweight endpoint for direct push sends (no Firebase Admin needed).
// Heavy lifting (cron, Firestore reads) moved to Firebase Cloud Functions.
//
// POST /api/notify?action=send-push — send a push to a specific subscription (internal use)

'use strict';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://authorscrolls.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const action = (req.query && req.query.action) || '';

  // Simple health check
  if (action === 'ping') {
    return res.status(200).json({ ok: true, service: 'notify' });
  }

  // Send a single push notification (called from Firebase Cloud Function if needed)
  if (action === 'send-push') {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers['x-cron-secret'] !== secret) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { subscription, payload } = req.body;
    if (!subscription || !payload) {
      return res.status(400).json({ error: 'Missing subscription or payload' });
    }

    try {
      const webpush = require('web-push');
      webpush.setVapidDetails(
        'mailto:support@authorscrolls.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
      );
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
};
