'use strict';
// These tests must never be pointed at a live project, including a preview's
// production Firebase. All accounts and manuscripts below are synthetic.
const assert = require('node:assert/strict');
const {test, before, after} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const PROJECT = 'demo-authorscrolls-staging';
assert.equal(process.env.GCLOUD_PROJECT, PROJECT);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
assert.ok(!process.env.FIREBASE_SERVICE_ACCOUNT, 'Never supply live credentials');
assert.ok(!process.env.OPENAI_API_KEY && !process.env.CLAUDE_API_KEY, 'No live providers in this suite');
process.env.FIREBASE_PROJECT_ID = PROJECT;
process.env.NODE_ENV = 'test';
process.env.METADATA_SERVER_DETECTION = 'none';
delete process.env.VERCEL;
delete process.env.ADMIN_UIDS;

const {initializeTestEnvironment, assertFails, assertSucceeds} = require('@firebase/rules-unit-testing');
const {doc, setDoc, getDoc, deleteDoc, updateDoc} = require('firebase/firestore');
// Pin the actual browser client version independently of Rules-test tooling.
const firebase = require('firebase-client/compat/app');
require('firebase-client/compat/auth');
require('firebase-client/compat/firestore');
const {getAdmin, verifyToken} = require('../../api/_auth');
const handler = require('../../api/claude');
const root = path.resolve(__dirname, '../..');
const storageSource = fs.readFileSync(path.join(root, 'storage.js'), 'utf8');
const ManuscriptParser = require('../../manuscript-parser');
let env, admin, author, secondDevice, stranger;
const apps = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const analysis = {analysisPending:true, scores:{}, genre:{primary:'nonfiction', label:'Nonfiction'}};
const deadline = setTimeout(()=>{
  console.error('Emulator integration suite exceeded its 90-second safety deadline');
  process.exit(1);
},90000);
deadline.unref();

async function client(name, email, create = true) {
  const app = firebase.initializeApp({projectId:PROJECT, apiKey:'emulator-only', authDomain:'localhost'}, name);
  apps.push(app);
  const auth = app.auth();
  auth.useEmulator('http://127.0.0.1:9099', {disableWarnings:true});
  await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
  const method = create ? 'createUserWithEmailAndPassword' : 'signInWithEmailAndPassword';
  await auth[method](email, 'Synthetic-test-only-42!');
  const db = app.firestore();
  db.useEmulator('127.0.0.1', 8080);
  const sdk = {
    auth:()=>auth,
    firestore:Object.assign(()=>db, {FieldValue:firebase.firestore.FieldValue})
  };
  // Same realm as the SDK: a separate VM realm's Object prototype is rejected
  // by Firestore's plain-object validator, unlike actual browser execution.
  const mod = {exports:{}};
  vm.compileFunction(storageSource, ['module','firebase','ManuscriptParser'],
    {filename:'storage.js'})(mod,sdk,ManuscriptParser);
  const storage = mod.exports;
  storage.init();
  await storage.whenReady();
  return {app, auth, db, storage, uid:auth.currentUser.uid};
}
async function request(token, overrides = {}) {
  const req = {method:'POST', headers:{authorization:token?'Bearer '+token:'', 'x-model':'openai-fast'},
    body:{messages:[{role:'user', content:'Summarize this synthetic test sentence.'}]}, ...overrides};
  const res = {code:0, body:null, setHeader(){}, status(code){this.code=code;return this;},
    json(body){this.body=body;return this;}, end(){return this;}};
  await handler(req, res);
  return res;
}
before(async () => {
  env = await initializeTestEnvironment({projectId:PROJECT,
    firestore:{host:'127.0.0.1', port:8080, rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}});
  await env.clearFirestore();
  admin = getAdmin();
  author = await client('author', 'author@example.test');
  secondDevice = await client('device-two', 'author@example.test', false);
  stranger = await client('stranger', 'stranger@example.test');
});
after(async () => {
  await Promise.all(apps.map(async app=>{
    await app.firestore().terminate();
    await app.delete();
  }));
  await env?.cleanup();
  const {getApps,deleteApp} = require('firebase-admin/app');
  await Promise.all(getApps().map(deleteApp));
});

test('real Auth emulator: sign-in, token verification, wrong password and logout', async () => {
  const token = await author.auth.currentUser.getIdToken();
  assert.equal((await verifyToken({headers:{authorization:'Bearer '+token}})).user.uid, author.uid);
  assert.equal((await verifyToken({headers:{authorization:'Bearer invalid'}})).reason, 'token_invalid');
  assert.equal((await request(null,{headers:{'x-user-id':author.uid}})).code,401);
  await assert.rejects(secondDevice.auth.signInWithEmailAndPassword('author@example.test','wrong-password'));
  await secondDevice.auth.signOut();
  assert.equal(secondDevice.auth.currentUser, null);
  await secondDevice.auth.signInWithEmailAndPassword('author@example.test','Synthetic-test-only-42!');
});

test('real Auth emulator: password reset code is single-use and changes sign-in', async () => {
  const reset = await client('reset-user', 'reset@example.test');
  await reset.auth.sendPasswordResetEmail('reset@example.test');
  const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`);
  assert.equal(response.status,200);
  const {oobCodes} = await response.json();
  const code = oobCodes.find(c=>c.email==='reset@example.test' && c.requestType==='PASSWORD_RESET').oobCode;
  await reset.auth.confirmPasswordReset(code, 'New-synthetic-test-only-73!');
  await assert.rejects(reset.auth.confirmPasswordReset(code, 'New-synthetic-test-only-73!'));
  await assert.rejects(reset.auth.signInWithEmailAndPassword('reset@example.test','Synthetic-test-only-42!'));
  await reset.auth.signInWithEmailAndPassword('reset@example.test','New-synthetic-test-only-73!');
});

test('real Admin verification rejects revoked and disabled users', async () => {
  const revoked = await client('revoked-user', 'revoked@example.test');
  const token = await revoked.auth.currentUser.getIdToken();
  await pause(1100); // Auth revocation timestamps have one-second granularity.
  await admin.auth().revokeRefreshTokens(revoked.uid);
  assert.equal((await verifyToken({headers:{authorization:'Bearer '+token}})).reason,'token_invalid');
  const disabled = await client('disabled-user', 'disabled@example.test');
  const disabledToken = await disabled.auth.currentUser.getIdToken();
  await admin.auth().updateUser(disabled.uid,{disabled:true});
  assert.equal((await request(disabledToken)).code,401);
});

test('repository rules enforce owner isolation and server-owned profile fields', async () => {
  const owner = env.authenticatedContext('rules-owner').firestore();
  const other = env.authenticatedContext('rules-other').firestore();
  const anon = env.unauthenticatedContext().firestore();
  const manuscript = 'users/rules-owner/manuscripts/book';
  await assertSucceeds(setDoc(doc(owner,'users/rules-owner'),{preferences:{theme:'dark'}}));
  await assertSucceeds(setDoc(doc(owner,manuscript),{text:'Synthetic'}));
  await assertSucceeds(setDoc(doc(owner,manuscript+'/versions/v1/parts/0'),{text:'Synthetic'}));
  await assertSucceeds(getDoc(doc(owner,manuscript)));
  for (const db of [other,anon]) {
    await assertFails(getDoc(doc(db,manuscript)));
    await assertFails(setDoc(doc(db,manuscript),{text:'Overwrite'}));
    await assertFails(getDoc(doc(db,manuscript+'/versions/v1/parts/0')));
  }
  for (const field of ['tier','tierUpdatedAt','subscriptionStatus','stripeCustomerId',
    'stripeSubscriptionId','stripeSubscriptionCreated','stripeLastEventCreated','stripeLastEventId']) {
    await assertFails(updateDoc(doc(owner,'users/rules-owner'),{[field]:'forged'}));
    const fresh = env.authenticatedContext('create-'+field).firestore();
    await assertFails(setDoc(doc(fresh,'users/create-'+field),{[field]:'forged'}));
  }
  await assertFails(deleteDoc(doc(owner,'users/rules-owner')));
  await assertFails(getDoc(doc(owner,'betaCodes/private')));
  await assertFails(setDoc(doc(owner,'accountDeletions/rules-other'),{blocked:true}));
  await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'accountDeletions/rules-owner'),{blocked:true}));
  await assertFails(getDoc(doc(owner,manuscript)));
  await assertFails(setDoc(doc(owner,manuscript+'/chapters/new'),{text:'Blocked'}));
});

test('actual Storage + Auth + Firestore: multi-part Unicode round-trip, versions and safety restore', async () => {
  const text = 'Chapter 1\n' + '🪶 Stories and evidence 世界 café.\n'.repeat(26000);
  assert.ok(Buffer.byteLength(text)>700000);
  const id = await author.storage.saveManuscript('synthetic-unicode.txt',text,analysis);
  const saved = await author.storage.getManuscript(id);
  assert.equal(saved.text,text);
  assert.ok(saved.partCount>1);
  assert.equal(saved.analysisState,'pending');
  assert.equal(saved.schemaVersion,4);
  assert.match(saved.contentHash,/^[a-f0-9]{64}$/);
  const version = await author.storage.saveVersion(id,analysis,text);
  await author.storage.updateManuscript(id,'Chapter 1\nNew synthetic draft',analysis);
  assert.equal(await author.storage.restoreVersion(id,version,analysis,'Unsaved synthetic edit'),text);
  const safety = (await author.storage.getVersions(id)).find(v=>v.reason==='before_restore');
  assert.equal((await author.storage.getVersion(id,safety.id)).text,'Unsaved synthetic edit');
  await assert.rejects(stranger.db.doc(`users/${author.uid}/manuscripts/${id}`).get(),/permission/i);
});

test('independent authenticated clients cannot silently overwrite a competing save', async () => {
  const id = await author.storage.saveManuscript('concurrency.txt','Initial',analysis);
  await secondDevice.storage.getManuscript(id);
  const results = await Promise.allSettled([
    author.storage.updateManuscript(id,'Device one',analysis),
    secondDevice.storage.updateManuscript(id,'Device two',analysis)
  ]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(results.filter(r=>r.status==='rejected').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/another device/i);
  assert.ok(['Device one','Device two'].includes((await author.storage.getManuscript(id)).text));
});

test('missing cloud chunks are rejected rather than opened as truncated manuscripts', async () => {
  const id = await author.storage.saveManuscript('corruption.txt','Synthetic complete draft',analysis);
  const ref = admin.firestore().doc(`users/${author.uid}/manuscripts/${id}`);
  const parts = await ref.collection('chapters').get();
  await parts.docs[0].ref.delete();
  await assert.rejects(author.storage.getManuscript(id),/incomplete/i);
  const snapshot = await author.storage.saveVersion(id,analysis,'Synthetic snapshot');
  const snapshotParts = await ref.collection('versions').doc(snapshot).collection('parts').get();
  await snapshotParts.docs[0].ref.delete();
  await assert.rejects(author.storage.getVersion(id,snapshot),/incomplete/i);
});

test('offline stale save cannot replace the newer draft when connectivity returns', async () => {
  const id = await author.storage.saveManuscript('offline.txt','Initial',analysis);
  await secondDevice.storage.getManuscript(id);
  await secondDevice.db.disableNetwork();
  let earlyResult;
  const pending = secondDevice.storage.updateManuscript(id,'Offline edit',analysis);
  const checked = pending.then(()=>({ok:true}),error=>({ok:false,error}))
    .then(result=>{earlyResult=result;return result;});
  try {
    await pause(100);
    assert.notEqual(earlyResult?.ok,true,'Offline write must not report a cloud save');
    await author.storage.updateManuscript(id,'New online draft',analysis);
  } finally {
    await secondDevice.db.enableNetwork();
  }
  const result = await checked;
  assert.equal(result.ok,false);
  // SDK versions may reject the initial read while offline rather than queue it.
  // Both outcomes are safe; silently publishing the stale edit is not.
  assert.match(result.error.message,/another device|offline|unavailable/i);
  assert.equal((await author.storage.getManuscript(id)).text,'New online draft');
});

test('same-length corruption is detected by actual Storage for both drafts and snapshots', async () => {
  const id = await author.storage.saveManuscript('digest.txt','Original',analysis);
  const snapshot = await author.storage.saveVersion(id,analysis,'Original');
  const ref = admin.firestore().doc(`users/${author.uid}/manuscripts/${id}`);
  const draftParts = await ref.collection('chapters').get();
  const snapshotParts = await ref.collection('versions').doc(snapshot).collection('parts').get();
  await draftParts.docs[0].ref.update({text:'Tampered'});
  await snapshotParts.docs[0].ref.update({text:'Tampered'});
  await assert.rejects(author.storage.getManuscript(id),/integrity/i);
  await assert.rejects(author.storage.getVersion(id,snapshot),/integrity/i);
});

test('a device cannot resurrect a deleted manuscript with a stale save', async () => {
  const id = await author.storage.saveManuscript('deleted.txt','Initial',analysis);
  await secondDevice.storage.getManuscript(id);
  await author.storage.deleteManuscript(id);
  await assert.rejects(secondDevice.storage.updateManuscript(id,'Stale deleted edit',analysis),/another device/i);
  assert.equal(await author.storage.getManuscript(id),null);
});

test('authenticated AI route rejects unavailable providers and immediate access removal', async () => {
  const ai = await client('ai-user','ai@example.test');
  const token = await ai.auth.currentUser.getIdToken();
  assert.equal((await request(token)).code,403);
  const profile = admin.firestore().doc('users/'+ai.uid);
  await profile.set({tier:'beta',tierUpdatedAt:admin.firestore.FieldValue.serverTimestamp()});
  assert.equal((await request(token)).code,503);
  await profile.delete();
  assert.equal((await request(token)).code,403,'Deleted profile must never reuse cached AI access');
  await profile.set({tier:'beta'});
  assert.equal((await request(token)).code,503);
  await profile.update({tier:'free'});
  assert.equal((await request(token)).code,403,'Access changes must not depend on tierUpdatedAt');
  await profile.update({tier:'beta'});
  await admin.firestore().doc('accountDeletions/'+ai.uid).set({blocked:true});
  assert.equal((await request(token)).code,403,'Account deletion must block Admin-backed AI reads too');
});
