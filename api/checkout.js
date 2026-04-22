// AuthorScrolls - Stripe Checkout API
// Creates a Stripe checkout session for premium subscription
const https = require('https');
const { verifyToken } = require('./_auth');

module.exports = async (req, res) => {
  const origin = req.headers.origin || '';
  const allowed = ['https://authorscrolls.com','https://www.authorscrolls.com'];
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : 'https://authorscrolls.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) { res.status(500).json({ error: 'Stripe not configured' }); return; }

  // Verify Firebase ID token — always fail closed; never trust client-supplied userId/email
  const decoded = await verifyToken(req);
  if (!decoded) {
    res.status(401).json({ error: 'Authentication required' }); return;
  }

  const safeOrigin = allowed.includes(origin) ? origin : 'https://authorscrolls.com';
  const { plan } = req.body;
  const userId = decoded.uid;
  const email = decoded.email;
  if (!userId || !email) { res.status(400).json({ error: 'Missing userId or email' }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'Invalid email' }); return; }

  // Price IDs - create these in your Stripe dashboard
  // For now, use ad-hoc price
  const prices = {
    starter: { amount: 500, name: 'AuthorScrolls Starter', interval: 'month' },
    premium: { amount: 1500, name: 'AuthorScrolls Premium', interval: 'month' }
  };
  const selectedPlan = prices[plan] || prices.starter;

  const payload = new URLSearchParams({
    'payment_method_types[0]': 'card',
    'mode': 'subscription',
    'customer_email': email,
    'metadata[userId]': userId,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': selectedPlan.amount.toString(),
    'line_items[0][price_data][recurring][interval]': selectedPlan.interval,
    'line_items[0][price_data][product_data][name]': selectedPlan.name,
    'line_items[0][quantity]': '1',
    'success_url': safeOrigin + '/app.html?upgraded=true',
    'cancel_url': safeOrigin + '/app.html?cancelled=true'
  }).toString();

  const options = {
    hostname: 'api.stripe.com', path: '/v1/checkout/sessions', method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Bearer ' + stripeKey,
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
            res.status(400).json({ error: parsed.error.message });
          } else {
            res.json({ url: parsed.url, sessionId: parsed.id });
          }
        } catch (e) { res.status(500).json({ error: 'Invalid Stripe response' }); }
        resolve();
      });
    });
    proxyReq.on('error', err => { res.status(500).json({ error: err.message }); resolve(); });
    proxyReq.write(payload); proxyReq.end();
  });
};
