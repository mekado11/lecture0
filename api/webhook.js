// AuthorScrolls - Stripe Webhook
// Receives checkout.session.completed events and updates user tier in Firestore.
// Requires STRIPE_WEBHOOK_SECRET env var (from Stripe dashboard → Webhooks).

'use strict';
const { getAdmin } = require('./_auth');

// Disable Vercel's body parser so we get the raw bytes for Stripe signature verification
module.exports.config = { api: { bodyParser: false } };

// Read raw request body as a Buffer
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) { res.status(500).json({ error: 'Webhook secret not configured' }); return; }

  let event;
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    res.status(400).json({ error: 'Webhook signature verification failed' });
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId;
    const planAmount = session.amount_total;

    if (userId) {
      const fb = getAdmin();
      if (fb) {
        try {
          const tier = planAmount >= 1500 ? 'premium' : 'starter';
          await fb.firestore().collection('users').doc(userId).set({
            tier,
            stripeCustomerId: session.customer || null,
            stripeSubscriptionId: session.subscription || null,
            tierUpdatedAt: fb.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        } catch (e) {
          console.error('Webhook Firestore update failed:', e.message);
        }
      }
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const fb = getAdmin();
    if (fb) {
      try {
        const snap = await fb.firestore().collection('users')
          .where('stripeSubscriptionId', '==', sub.id).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.set({ tier: 'free', tierUpdatedAt: fb.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
      } catch (e) {
        console.error('Webhook subscription cancel failed:', e.message);
      }
    }
  }

  res.status(200).json({ received: true });
};
