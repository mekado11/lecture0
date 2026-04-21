// Shared Firebase Admin token verification for API routes.
// Requires FIREBASE_SERVICE_ACCOUNT env var (JSON string of service account key).
// If not configured, requests are rejected — fail-closed.

let admin;
let initialized = false;

function getAdmin() {
  if (initialized) return admin;
  initialized = true;
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!sa) return null;
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(sa))
      });
    }
    return admin;
  } catch (e) {
    console.error('Firebase Admin init failed:', e.message);
    return null;
  }
}

async function verifyToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7);
  const fb = getAdmin();
  if (!fb) return null;
  try {
    return await fb.auth().verifyIdToken(token);
  } catch (e) {
    return null;
  }
}

module.exports = { verifyToken, getAdmin };
