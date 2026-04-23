// Shared Firebase Admin token verification for API routes.
// Prefers FIREBASE_SERVICE_ACCOUNT (full service account JSON string).
// Falls back to FIREBASE_PROJECT_ID alone — verifyIdToken() only needs the
// project ID; it fetches Google's public keys automatically at runtime.
// If neither is configured, requests are rejected — fail-closed.

let admin;
let initialized = false;

function getAdmin() {
  if (initialized) return admin;
  initialized = true;
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    const projectId = process.env.FIREBASE_PROJECT_ID;

    if (!sa && !projectId) {
      console.error('Firebase Admin: neither FIREBASE_SERVICE_ACCOUNT nor FIREBASE_PROJECT_ID is set. All API calls will be rejected.');
      return null;
    }

    admin = require('firebase-admin');
    if (!admin.apps.length) {
      if (sa) {
        // Full service account — enables all Admin SDK features
        admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
      } else {
        // Project ID only — sufficient for verifyIdToken(); no write operations
        admin.initializeApp({ projectId });
      }
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
