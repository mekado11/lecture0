// ManuscriptLens - Firebase Cloud Functions
// Deploy: firebase deploy --only functions

const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const https = require("https");

admin.initializeApp();
const db = admin.firestore();

const rateLimitMap = new Map();
const LIMITS = { dev: 9999, premium: 5, starter: 1, free: 0 };
const DEV_UIDS = new Set([]);
const tierCache = new Map();
const TIER_CACHE_TTL = 60000;

async function getUserTier(uid) {
  if (DEV_UIDS.has(uid)) return 'dev';
  const cached = tierCache.get(uid);
  if (cached && Date.now() - cached.ts < TIER_CACHE_TTL) return cached.tier;
  try {
    const doc = await db.collection('users').doc(uid).get();
    const tier = doc.exists ? (doc.data().tier || 'free') : 'free';
    tierCache.set(uid, { tier, ts: Date.now() });
    return tier;
  } catch (e) { return 'free'; }
}

// API key stored as Firebase secret (never in code)
const claudeApiKey = defineSecret("CLAUDE_API_KEY");
const vapidPublicKey = defineSecret("VAPID_PUBLIC_KEY");
const vapidPrivateKey = defineSecret("VAPID_PRIVATE_KEY");
const smtpHost = defineSecret("SMTP_HOST");
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

// ── Claude proxy (existing) ────────────────────────────────
exports.claude = onRequest(
  {
    cors: true,
    secrets: [claudeApiKey],
    memory: "256MiB",
    timeoutSeconds: 120,
    maxInstances: 10,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: { message: "Method not allowed" } });
      return;
    }
    if (req.body.test) { res.json({ ok: true }); return; }
    if (!req.body.model || !req.body.messages) {
      res.status(400).json({ error: { message: "Missing model or messages" } });
      return;
    }

    // Verify Firebase ID token
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: { message: "Authentication required", code: "UNAUTHENTICATED" } });
      return;
    }
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
    } catch (e) {
      res.status(401).json({ error: { message: "Invalid or expired token", code: "UNAUTHENTICATED" } });
      return;
    }

    // Tier-based rate limiting
    const uid = decoded.uid;
    const today = new Date().toISOString().split("T")[0];
    const key = uid + ":" + today;
    const userTier = await getUserTier(uid);
    const limit = LIMITS[userTier] ?? LIMITS.free;
    const current = rateLimitMap.get(key) || 0;
    if (current >= limit) {
      res.status(429).json({
        error: {
          message: userTier === "free"
            ? "AI features require a subscription. Upgrade to Starter ($5/mo)."
            : "Daily AI limit reached (" + limit + "/day). Resets at midnight UTC.",
          code: "RATE_LIMITED", limit, used: current, tier: userTier
        }
      });
      return;
    }
    rateLimitMap.set(key, current + 1);

    const body = { ...req.body };
    if (body.max_tokens > 2048) body.max_tokens = 2048;
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

// ── Helper: build push notification copy ───────────────────
function buildPushPayload(session) {
  const { manuscript, lastChapter, lastActionType, lastScore } = session;
  const title = "AuthorScrolls";
  let body;

  if (lastChapter && lastActionType === "editing") {
    body = `You stopped editing "${lastChapter}" in ${manuscript}. The story is still mid-sentence.`;
  } else if (lastChapter && lastActionType === "analyzing") {
    body = `Your analysis of "${lastChapter}" is waiting. Score: ${lastScore}/100.`;
  } else if (lastChapter) {
    body = `"${lastChapter}" — you left ${manuscript} open. Ready to continue?`;
  } else if (lastScore) {
    body = `${manuscript} scored ${lastScore}/100. A few edits could change everything.`;
  } else {
    body = `${manuscript} is waiting for you. Jump back in.`;
  }

  return JSON.stringify({ title, body, url: "/app.html" });
}

// ── Helper: build email HTML ───────────────────────────────
function escHtml(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function buildEmailHtml(session) {
  const { manuscript, lastChapter, lastScore } = session;
  return `<!DOCTYPE html><html><body style="font-family:Georgia,serif;background:#0a0705;color:#e8dfd4;max-width:600px;margin:0 auto;padding:2rem">
<h1 style="color:#dbb08a;font-size:1.5rem">&#127807; AuthorScrolls</h1>
<p style="color:#9c9085;font-size:.9rem">Hi,</p>
<p style="color:#e8dfd4;font-size:1rem;line-height:1.7">It's been a few days since you opened <strong style="color:#dbb08a">${escHtml(manuscript)}</strong>${lastChapter ? ` — specifically <em style="color:#c8956c">${escHtml(lastChapter)}</em>` : ""}.</p>
${lastScore ? `<p style="color:#9c9085;font-size:.9rem">Last analysis score: <strong style="color:#dbb08a">${lastScore}/100</strong>. There's room to push it higher.</p>` : ""}
<p style="color:#9c9085;font-size:.9rem;line-height:1.7">Every manuscript gets better with another pass. Yours is waiting exactly where you left it.</p>
<a href="https://authorscrolls.com/app.html" style="display:inline-block;margin:1.5rem 0;padding:.7rem 2rem;background:linear-gradient(135deg,#c8956c,#8a6548);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:.95rem">Open My Manuscript</a>
</body></html>`;
}

// ── CRON: Push notifications (every 6 hours) ───────────────
// Fires for users inactive 24–48 hours who haven't been notified yet
exports.sendPushReminders = onSchedule(
  {
    schedule: "every 6 hours",
    secrets: [vapidPublicKey, vapidPrivateKey],
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const webpush = require("web-push");
    webpush.setVapidDetails(
      "mailto:support@authorscrolls.com",
      vapidPublicKey.value(),
      vapidPrivateKey.value()
    );

    const now = Date.now();
    const MIN_INACTIVE = 24 * 60 * 60 * 1000;
    const MAX_INACTIVE = 48 * 60 * 60 * 1000;

    const subs = await db.collection("pushSubscriptions").get();
    let sent = 0, skipped = 0;

    for (const doc of subs.docs) {
      const { uid, subscription } = doc.data();
      const sessionDoc = await db.collection("userSessions").doc(uid).get();
      if (!sessionDoc.exists) { skipped++; continue; }

      const session = sessionDoc.data();
      const inactive = now - (session.lastSessionTime || 0);

      // Only send if 24-48hr inactive and haven't sent push yet
      if (inactive < MIN_INACTIVE || inactive > MAX_INACTIVE) { skipped++; continue; }
      if ((session.lastReminderTier || 0) >= 2) { skipped++; continue; }

      try {
        await webpush.sendNotification(subscription, buildPushPayload(session));
        await db.collection("userSessions").doc(uid).update({ lastReminderTier: 2 });
        sent++;
      } catch (err) {
        // Remove expired subscriptions
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.collection("pushSubscriptions").doc(uid).delete();
        }
      }
    }

    console.log(`Push reminders: sent=${sent}, skipped=${skipped}`);
  }
);

// ── CRON: Email reminders (daily at 9am UTC, opt-in only) ──
exports.sendEmailReminders = onSchedule(
  {
    schedule: "every day 09:00",
    secrets: [smtpHost, smtpUser, smtpPass],
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: smtpHost.value(),
      port: 587,
      secure: false,
      auth: { user: smtpUser.value(), pass: smtpPass.value() },
    });

    const now = Date.now();
    const MIN_INACTIVE = 72 * 60 * 60 * 1000;

    // Only users who opted in
    const sessions = await db.collection("userSessions")
      .where("emailReminders", "==", true)
      .get();

    let sent = 0, skipped = 0;

    for (const doc of sessions.docs) {
      const session = doc.data();
      const inactive = now - (session.lastSessionTime || 0);
      if (inactive < MIN_INACTIVE) { skipped++; continue; }
      if ((session.lastReminderTier || 0) >= 3) { skipped++; continue; }
      if (!session.email) { skipped++; continue; }

      try {
        await transporter.sendMail({
          from: '"AuthorScrolls" <noreply@authorscrolls.com>',
          to: session.email,
          subject: `Your manuscript is waiting — ${session.manuscript || "AuthorScrolls"}`,
          html: buildEmailHtml(session),
        });
        await db.collection("userSessions").doc(doc.id).update({ lastReminderTier: 3 });
        sent++;
      } catch (err) {
        console.error("Email send error:", err.message);
      }
    }

    console.log(`Email reminders: sent=${sent}, skipped=${skipped}`);
  }
);
