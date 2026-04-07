# ManuscriptLens - Firebase Deployment Guide

## Prerequisites
1. Node.js 18+ installed
2. Firebase CLI: `npm install -g firebase-tools`
3. A Firebase project created at https://console.firebase.google.com
4. Your Claude API key (sk-ant-...)

## Setup (one-time)

### 1. Login to Firebase
```bash
firebase login
```

### 2. Set your project ID
Edit `web/.firebaserc` and replace `YOUR-FIREBASE-PROJECT-ID` with your actual Firebase project ID.

Or run:
```bash
cd web
firebase use --add
```

### 3. Store your Claude API key as a secret
```bash
firebase functions:secrets:set CLAUDE_API_KEY
```
When prompted, paste your `sk-ant-...` key. It's encrypted and stored securely by Firebase — never in your code.

### 4. Install function dependencies
```bash
cd functions
npm install
cd ..
```

## Deploy

### Deploy everything (hosting + functions)
```bash
cd web
firebase deploy
```

### Deploy only the website
```bash
firebase deploy --only hosting
```

### Deploy only the API function
```bash
firebase deploy --only functions
```

## After deployment

Your app will be live at:
`https://YOUR-PROJECT-ID.web.app`

The AI Critique features will work automatically because:
- `/api/claude` requests are rewritten to the Cloud Function
- The Cloud Function reads the API key from Firebase Secrets
- Prompt caching reduces costs by ~90% across the 6 AI features

## Architecture

```
Browser (ManuscriptLens)
    |
    | POST /api/claude
    v
Firebase Hosting (rewrites to function)
    |
    v
Cloud Function (claude)
    |
    | + API key from secrets
    v
Anthropic API (Claude)
```

## Cost Estimates
- Firebase Hosting: Free (Spark plan, up to 10GB/month)
- Cloud Functions: Free tier covers ~2M invocations/month
- Claude API: ~$0.003-0.01 per analysis (with caching)
  - First call: ~5000 input tokens = ~$0.015
  - Calls 2-6: cached = ~$0.002 each
  - Total per manuscript: ~$0.025

## Local Development
```bash
cd web
CLAUDE_API_KEY=sk-ant-xxx node server.js
# Open http://localhost:3000
```
