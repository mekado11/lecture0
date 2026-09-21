// Public navigation is independent of Firebase. Auth loads only when needed.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('auth-dialog');
  let mode = 'signin', busy = false, authPromise = null, currentUser = null, firstState = null;
  let returnFocus = null;
  // The workspace sets this hint on sign-in and clears it on sign-out. It only decides whether the
  // homepage loads the auth SDK before anyone clicks; Firebase itself says whether a session exists.
  const SESSION_HINT = 'ml_signed_in';
  function hasSessionHint() { try { return localStorage.getItem(SESSION_HINT) === '1'; } catch (_) { return false; } }
  function setSessionHint(on) { try { on ? localStorage.setItem(SESSION_HINT, '1') : localStorage.removeItem(SESSION_HINT); } catch (_) { /* storage blocked */ } }
  const root = document.documentElement;
  function setTheme(theme) {
    root.dataset.theme = theme;
    $('theme-toggle').setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme');
  }
  setTheme(window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  $('theme-toggle').addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('menu-toggle').addEventListener('click', () => {
    const open = $('menu-toggle').getAttribute('aria-expanded') !== 'true';
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    $('mobile-nav').classList.toggle('hidden', !open);
  });
  $('mobile-nav').addEventListener('click', e => {
    if (e.target.closest('a')) { $('mobile-nav').classList.add('hidden'); $('menu-toggle').setAttribute('aria-expanded', 'false'); }
  });
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      const timer = setTimeout(() => { script.remove(); reject(new Error('Sign-in could not load. Check your connection and try again.')); }, 12000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Sign-in could not load. Check your connection and try again.')); };
      document.head.appendChild(script);
    });
  }
  async function getAuth() {
    if (!authPromise) authPromise = (async () => {
      if (!window.firebase) await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
      if (!window.firebase.auth) await loadScript('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js');
      if (typeof FIREBASE_CONFIG === 'undefined') await loadScript('firebase-config.js');
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      const auth = firebase.auth();
      firstState = new Promise(resolve => auth.onAuthStateChanged(user => {
        currentUser = user;
        setSessionHint(!!user);
        $('nl').classList.toggle('hidden', !!user);
        $('nu').classList.toggle('hidden', !user);
        resolve(user);
      }));
      return auth;
    })().catch(error => { authPromise = null; $('nl').classList.remove('hidden'); throw error; });
    return authPromise;
  }
  // Who is here? Null for a visitor with no session hint (no SDK load, no wait); otherwise the
  // restored user once Firebase has reported, or null if it cannot within a few seconds.
  function knownUser() {
    if (currentUser) return Promise.resolve(currentUser);
    if (!hasSessionHint()) return Promise.resolve(null);
    return Promise.race([
      getAuth().then(() => firstState),
      new Promise(resolve => setTimeout(() => resolve(null), 5000))
    ]).catch(() => null);
  }
  // A returning author sees "Open workspace", not "Sign in": load auth now instead of on click, and
  // keep the signed-out buttons out of sight until Firebase has answered.
  if (hasSessionHint()) { $('nl').classList.add('hidden'); knownUser().then(user => { if (!user) $('nl').classList.remove('hidden'); }); }
  function message(text) { $('auth-message').textContent = text; }
  function setBusy(value) {
    busy = value;
    ['auth-submit','google-signin','auth-toggle','forgot-password'].forEach(id => $(id).disabled = value);
    $('auth-submit').textContent = value ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in';
  }
  async function showAuth(nextMode = 'signin') {
    if (nextMode !== 'reset' && await knownUser()) { location.href = 'app.html'; return; }
    mode = nextMode;
    $('auth-title').textContent = mode === 'signup' ? 'Begin your story.' : mode === 'reset' ? 'A fresh start.' : 'Welcome back.';
    $('auth-subtitle').textContent = mode === 'signup' ? 'Create your free writing workspace.' : mode === 'reset' ? 'We’ll email you a password reset link.' : 'Sign in to return to your manuscripts.';
    $('name-field').classList.toggle('hidden', mode !== 'signup');
    $('password-field').classList.toggle('hidden', mode === 'reset');
    $('auth-password').required = mode !== 'reset';
    $('auth-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('auth-switch-copy').textContent = mode === 'signup' ? 'Already have an account?' : mode === 'reset' ? 'Remember your password?' : 'New to AuthorScrolls?';
    $('auth-toggle').textContent = mode === 'signin' ? 'Create an account' : 'Sign in';
    $('forgot-password').classList.toggle('hidden', mode !== 'signin');
    message(''); setBusy(false);
    if (!dialog.open) { returnFocus = document.activeElement; dialog.showModal(); }
    $(mode === 'signup' ? 'auth-name' : 'auth-email').focus();
    getAuth().catch(error => message(error.message));
  }
  $('nav-signin').addEventListener('click', () => showAuth());
  ['nav-signup','hero-cta','bottom-cta'].forEach(id => $(id).addEventListener('click', () => showAuth('signup')));
  // The workspace demo's "Create a free account" link lands here.
  if (location.hash === '#signup') { history.replaceState(null, '', location.pathname); showAuth('signup'); }
  $('auth-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { $('auth-password').value = ''; returnFocus?.focus(); });
  dialog.addEventListener('click', e => {
    if (e.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) dialog.close();
    }
  });
  $('auth-toggle').addEventListener('click', () => showAuth(mode === 'signin' ? 'signup' : 'signin'));
  $('forgot-password').addEventListener('click', () => showAuth('reset'));
  const errors = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/email-already-in-use': 'An account already uses that email. Try signing in.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a password with at least six characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups or use email.',
    'auth/unauthorized-domain': 'Sign-in is not configured for this preview domain. Use the production site.',
    'auth/network-request-failed': 'Connection interrupted. Please try again.'
  };
  $('auth-form').addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const email = $('auth-email').value.trim(), password = $('auth-password').value;
    message(''); setBusy(true);
    try {
      const auth = await getAuth();
      if (mode === 'reset') { await auth.sendPasswordResetEmail(email); message('If an account exists for this email, a reset link is on its way.'); }
      else {
        if (mode === 'signup') {
          const credential = await auth.createUserWithEmailAndPassword(email, password);
          const name = $('auth-name').value.trim();
          if (name) await credential.user.updateProfile({ displayName: name });
        } else await auth.signInWithEmailAndPassword(email, password);
        setSessionHint(true);
        location.href = 'app.html';
      }
    } catch (error) { message(errors[error.code] || 'Unable to complete sign-in. Please try again.'); }
    finally { setBusy(false); }
  });
  $('google-signin').addEventListener('click', async () => {
    if (busy) return;
    message(''); setBusy(true);
    try {
      const auth = await getAuth();
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      setSessionHint(true);
      location.href = 'app.html';
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') message(errors[error.code] || 'Google sign-in did not complete. Try again or use email.');
    } finally { setBusy(false); }
  });
})();
