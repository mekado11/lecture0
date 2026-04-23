// Shared Firebase Admin token verification for API routes.
// Prefers FIREBASE_SERVICE_ACCOUNT (full service account JSON string).
// Falls back to FIREBASE_PROJECT_ID alone — verifyIdToken() only needs the
// project ID; it fetches Google's public keys automatically at runtime.
// If neither is configured, requests are rejected — fail-closed.

let admin;
let initialized = false;
let initMode = 'none'; // 'service_account', 'project_id', or 'none'

function getAdmin() {
  if (initialized) return admin;
  initialized = true;
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!sa && !projectId) {
      initMode = 'none';
      return null;
    }

    admin = require('firebase-admin');
    if (!admin.apps.length) {
      if (sa) {
        initMode = 'service_account';
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
      } else {
        initMode = 'project_id';
        admin.initializeApp({ projectId });
      }
    }
    return admin;
  } catch (e) {
    console.error('Firebase Admin init failed:', e.message);
    initMode = 'init_error';
    return null;
  }
}

async function verifyToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return { user: null, reason: 'no_token' };
  const token = header.slice(7);
  const fb = getAdmin();
  if (!fb) return { user: null, reason: 'admin_not_configured', initMode };
  try {
    const decoded = await fb.auth().verifyIdToken(token);
    return { user: decoded, reason: 'ok' };
  } catch (e) {
    return { user: null, reason: 'token_invalid', detail: e.code || e.message };
  }
}

function getInitMode() { return initMode; }

module.exports = { verifyToken, getAdmin, getInitMode };
