// Firebase init + auth gate — extracted from inline script for CSP compliance
firebase.initializeApp(FIREBASE_CONFIG);
const ADMIN_EMAILS = ['admin@authorscrolls.com'];
window.__isAdmin = false;
window.__userPlan = 'free';
// Never silently erase the sole surviving copy of an older draft.
sessionStorage.removeItem('ml_cache');
function clearPrivateStorage(preserveLegacy=false){
  const retained=preserveLegacy?new Set(window.LegacyRecovery.keys()):new Set();
  Object.keys(localStorage).filter(k=>/^(ml_|aic_|scan:|fixes:)/.test(k)&&!retained.has(k)&&!(preserveLegacy&&k==='ml_storage_owner')).forEach(k=>localStorage.removeItem(k));
  sessionStorage.clear();
}
firebase.auth().onAuthStateChanged(async function(user) {
  if (!user) { window.location.href = 'index.html'; return; }
  // UI hint only. Server authorization uses ADMIN_UIDS, never email alone.
  window.__isAdmin = user.emailVerified && ADMIN_EMAILS.includes((user.email||'').toLowerCase());
  const previousOwner=localStorage.getItem('ml_storage_owner');
  if(previousOwner && previousOwner!==user.uid){
    clearPrivateStorage(true);
  }
  const cleared=await window.LegacyRecovery.offer(previousOwner===user.uid);
  if(cleared || previousOwner===user.uid)localStorage.setItem('ml_storage_owner',user.uid);
  try{document.documentElement.dataset.editorTheme=JSON.parse(localStorage.getItem('ml_prefs')||'{}').darkTheme===false?'light':'dark';}catch(_){}
  // Fetch tier from Firestore
  firebase.firestore().collection('users').doc(user.uid).get().then(function(doc) {
    if(doc.data()?.preferences){
      localStorage.setItem('ml_prefs',JSON.stringify(doc.data().preferences));
      document.documentElement.dataset.editorTheme=doc.data().preferences.darkTheme===false?'light':'dark';
    }
    if (doc.exists && doc.data().tier) {
      window.__userPlan = doc.data().tier;
    }
    // Tier resolves after first paint — let the app re-render plan-gated UI (Fix/Rewrite buttons etc.)
    window.dispatchEvent(new Event('ml-plan-ready'));
  }).catch(function() { window.dispatchEvent(new Event('ml-plan-ready')); });
  var brand = document.querySelector('.brand');
  if (brand) brand.textContent = 'AuthorScrolls';
  if (window.__isAdmin) {
    var pill = document.getElementById('top-status');
    if (pill) pill.insertAdjacentHTML('afterend','<span style="font-size:.6rem;background:var(--gold-d);color:#fff;padding:.1rem .4rem;border-radius:3px;margin-left:.3rem;font-family:Inter,sans-serif">ADMIN</span>');
  }
  var topRight = document.getElementById('account-actions') || document.querySelector('.topbar-r');
  if (topRight && !document.getElementById('signout-btn')) {
    var btn = document.createElement('button');
    btn.id = 'signout-btn';
    btn.className = 'tb-btn';
    btn.textContent = 'Sign Out';
    btn.onclick = async function() {
      if(window.AuthorScrollsEditor?.save&&!await window.AuthorScrollsEditor.save())return;
      // Preserve quarantined legacy drafts until the explicit recovery decision.
      try{await firebase.auth().signOut();clearPrivateStorage(true);window.location.href='index.html';}
      catch(_){alert('Sign-out failed. Please try again.');}
    };
    topRight.appendChild(btn);
  }
});
