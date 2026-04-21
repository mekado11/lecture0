// Firebase init + auth UI for landing page — extracted from inline script for CSP compliance
firebase.initializeApp({apiKey:"AIzaSyBkLqqoxn7gkE9EBvGeuRz54-7xEN9dAWI",authDomain:"writers-manuscript.firebaseapp.com",projectId:"writers-manuscript",storageBucket:"writers-manuscript.appspot.com",messagingSenderId:"420138585851",appId:"1:420138585851:web:09c683cf202c9dde50aa5e"});
var auth=firebase.auth();var am='signin';
auth.onAuthStateChanged(function(u){if(u){document.getElementById('nl').classList.add('hidden');document.getElementById('nu').classList.remove('hidden');document.getElementById('unm').textContent=u.displayName||u.email.split('@')[0];document.getElementById('uav').textContent=(u.displayName||u.email)[0].toUpperCase();hideAuth()}else{document.getElementById('nl').classList.remove('hidden');document.getElementById('nu').classList.add('hidden')}});
function showAuth(m){
  am=m||'signin';document.getElementById('ao').classList.add('show');
  var atg=document.getElementById('atg');
  if(am==='signup'){
    document.getElementById('ati').textContent='Create Your Account';
    document.getElementById('asu').textContent='Start analyzing your manuscripts for free';
    document.getElementById('anm').style.display='block';
    document.getElementById('aes').textContent='Sign Up';
    atg.textContent='Already have an account? ';
    var s=document.createElement('span');s.textContent='Sign in';s.style.cursor='pointer';s.addEventListener('click',sw);atg.appendChild(s);
  }else{
    document.getElementById('ati').textContent='Welcome Back';
    document.getElementById('asu').textContent='Sign in to access your manuscripts';
    document.getElementById('anm').style.display='none';
    document.getElementById('aes').textContent='Sign In';
    atg.textContent="Don't have an account? ";
    var s=document.createElement('span');s.textContent='Sign up';s.style.cursor='pointer';s.addEventListener('click',sw);atg.appendChild(s);
  }
  document.getElementById('aer').style.display='none';
}
function hideAuth(){document.getElementById('ao').classList.remove('show')}
function sw(){showAuth(am==='signin'?'signup':'signin')}
function se(m){var e=document.getElementById('aer');e.textContent=m;e.style.display='block'}
// Bind navigation buttons
document.getElementById('nav-signin').addEventListener('click',function(){showAuth('signin')});
document.getElementById('nav-signup').addEventListener('click',function(){showAuth('signup')});
document.getElementById('hero-cta').addEventListener('click',function(){showAuth('signup')});
document.getElementById('hero-how').addEventListener('click',function(){document.getElementById('how').scrollIntoView({behavior:'smooth'})});
document.getElementById('bottom-cta').addEventListener('click',function(){showAuth('signup')});
document.getElementById('auth-close').addEventListener('click',hideAuth);
document.getElementById('auth-toggle').addEventListener('click',sw);
// Firebase auth
document.getElementById('gbtn').addEventListener('click',async function(){try{await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());window.location.href='app.html'}catch(e){se(e.message)}});
document.getElementById('aes').addEventListener('click',async function(){var em=document.getElementById('aem').value.trim(),pw=document.getElementById('apw').value,nm=document.getElementById('anm').value.trim();if(!em||!pw){se('Enter email and password');return}if(pw.length<6){se('Password: 6+ characters');return}try{if(am==='signup'){var c=await auth.createUserWithEmailAndPassword(em,pw);if(nm)await c.user.updateProfile({displayName:nm})}else{await auth.signInWithEmailAndPassword(em,pw)}window.location.href='app.html'}catch(e){var m={'auth/email-already-in-use':'Email already registered.','auth/invalid-email':'Invalid email.','auth/user-not-found':'No account found.','auth/wrong-password':'Incorrect password.','auth/weak-password':'Password too short.'};se(m[e.code]||e.message)}});
// Reveal animations
document.querySelectorAll('.rv').forEach(function(el){new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)e.target.classList.add('v')})},{threshold:.15}).observe(el)});
