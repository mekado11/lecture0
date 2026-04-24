// Firebase init + auth gate — extracted from inline script for CSP compliance
firebase.initializeApp(FIREBASE_CONFIG);
const ADMIN_EMAILS = ['admin@authorscrolls.com'];
window.__isAdmin = false;
window.__userPlan = 'free';
firebase.auth().onAuthStateChanged(function(user) {
  if (!user) { window.location.href = 'index.html'; return; }
  window.__isAdmin = ADMIN_EMAILS.includes((user.email||'').toLowerCase());
  // Fetch tier from Firestore
  firebase.firestore().collection('users').doc(user.uid).get().then(function(doc) {
    if (doc.exists && doc.data().tier) {
      window.__userPlan = doc.data().tier;
    }
  }).catch(function() {});
  var brand = document.querySelector('.brand');
  if (brand) brand.textContent = 'AuthorScrolls';
  if (window.__isAdmin) {
    var pill = document.getElementById('top-status');
    if (pill) pill.insertAdjacentHTML('afterend','<span style="font-size:.6rem;background:var(--gold-d);color:#fff;padding:.1rem .4rem;border-radius:3px;margin-left:.3rem;font-family:Inter,sans-serif">ADMIN</span>');
  }
  var topRight = document.querySelector('.topbar-r');
  if (topRight && !document.getElementById('signout-btn')) {
    var btn = document.createElement('button');
    btn.id = 'signout-btn';
    btn.className = 'tb-btn';
    btn.textContent = 'Sign Out';
    btn.onclick = function() { localStorage.removeItem('ml_autosave'); localStorage.removeItem('ml_session'); localStorage.removeItem('ml_last_open'); localStorage.removeItem('ml_push_subscribed'); sessionStorage.clear(); firebase.auth().signOut().then(function(){ window.location.href = 'index.html'; }).catch(function(){ window.location.href = 'index.html'; }); };
    topRight.appendChild(btn);
  }
});
