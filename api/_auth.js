// Shared Firebase Admin token verification for API routes.
// Prefers FIREBASE_SERVICE_ACCOUNT (full service account JSON string).
// FIREBASE_PROJECT_ID also works with Application Default Credentials.
// Revocation checks require Auth admin access, not just a public project ID.
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

    const {getApps,initializeApp,cert}=require('firebase-admin/app');
    const {getAuth}=require('firebase-admin/auth');
    const {getFirestore,FieldValue}=require('firebase-admin/firestore');
    if (!getApps().length) {
      if (sa) {
        initMode = 'service_account';
        initializeApp({ credential: cert(JSON.parse(sa)) });
      } else {
        initMode = 'project_id';
        initializeApp({ projectId });
      }
    }
    // Narrow adapter keeps endpoint code stable across the modular Admin SDK.
    admin={auth:getAuth,firestore:Object.assign(()=>getFirestore(),{FieldValue})};
    return admin;
  } catch (e) {
    admin = null;
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
    const decoded = await fb.auth().verifyIdToken(token, true);
    return { user: decoded, reason: 'ok' };
  } catch (e) {
    return { user: null, reason: 'token_invalid', detail: e.code || e.message };
  }
}

function getInitMode() { return initMode; }

module.exports = { verifyToken, getAdmin, getInitMode };
