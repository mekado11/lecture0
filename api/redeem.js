'use strict';
const { verifyToken, getAdmin } = require('./_auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const decoded = await verifyToken(req);
  if (!decoded) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const code = (req.body.code || '').trim().toUpperCase();
  if (!code) {
    res.status(400).json({ error: 'Missing invite code' });
    return;
  }

  const fb = getAdmin();
  if (!fb) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const db = fb.firestore();
  const uid = decoded.uid;

  try {
    const userDoc = await db.collection('users').doc(uid).get();
    const currentTier = userDoc.exists ? (userDoc.data().tier || 'free') : 'free';
    if (currentTier === 'beta' || currentTier === 'premium' || currentTier === 'starter') {
      res.status(400).json({ error: 'You already have an active plan (' + currentTier + ')' });
      return;
    }

    const codeRef = db.collection('betaCodes').doc(code);
    const codeDoc = await codeRef.get();
    if (!codeDoc.exists) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    const data = codeDoc.data();
    const usedBy = data.usedBy || [];
    const maxUses = data.maxUses || 1;

    if (usedBy.includes(uid)) {
      res.status(400).json({ error: 'You already redeemed this code' });
      return;
    }

    if (usedBy.length >= maxUses) {
      res.status(410).json({ error: 'This invite code has been fully used' });
      return;
    }

    const tier = data.tier || 'beta';
    await db.runTransaction(async (t) => {
      const fresh = await t.get(codeRef);
      const freshUsed = fresh.data().usedBy || [];
      if (freshUsed.length >= maxUses) throw new Error('Code fully used');
      t.update(codeRef, { usedBy: [...freshUsed, uid] });
      t.set(db.collection('users').doc(uid), {
        tier,
        tierUpdatedAt: fb.firestore.FieldValue.serverTimestamp(),
        betaCode: code
      }, { merge: true });
    });

    res.status(200).json({ success: true, tier });
  } catch (e) {
    if (e.message === 'Code fully used') {
      res.status(410).json({ error: 'This invite code has been fully used' });
    } else {
      res.status(500).json({ error: 'Redemption failed: ' + e.message });
    }
  }
};
