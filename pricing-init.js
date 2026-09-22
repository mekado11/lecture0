// Pricing page: FAQ and checkout. Sign-in and the header live in landing-init.js. The page must
// read and its FAQ must work even when the Firebase SDK cannot load; only checkout needs it.
(function(){
  'use strict';
  var hasFirebase=typeof firebase!=='undefined'&&typeof FIREBASE_CONFIG!=='undefined';
  if(hasFirebase&&!firebase.apps.length)firebase.initializeApp(FIREBASE_CONFIG);
  document.querySelectorAll('.faq-item').forEach(function(item){
    var q=item.querySelector('.faq-q');
    q.addEventListener('click',function(){var open=item.classList.toggle('open');q.setAttribute('aria-expanded',String(open));});
  });
  function openSignIn(){
    var signIn=document.getElementById('nav-signin');
    if(signIn)signIn.click();else window.location.href='index.html#signup';
  }
  document.querySelectorAll('.checkout-tier').forEach(function(btn){btn.addEventListener('click',async function(){
    var label=btn.dataset.label||btn.textContent;
    if(!hasFirebase){openSignIn();return;}
    // Wait for the restored session rather than reading currentUser before Firebase has loaded it.
    var user=await new Promise(function(resolve){var stop=firebase.auth().onAuthStateChanged(function(u){stop();resolve(u)})});
    if(!user){openSignIn();return;}
    var plan=btn.dataset.plan;btn.textContent='Redirecting…';btn.disabled=true;
    try{
      var hdrs={'content-type':'application/json'};
      try{hdrs['authorization']='Bearer '+await user.getIdToken()}catch(e){}
      var resp=await fetch('/api/checkout',{method:'POST',headers:hdrs,body:JSON.stringify({userId:user.uid,email:user.email,plan})});
      var data=await resp.json();
      if(data.url)window.location.href=data.url;
      else{alert(data.error||'Checkout failed');btn.textContent=label;btn.disabled=false}
    }catch(e){alert('Error: '+e.message);btn.textContent=label;btn.disabled=false}
  })});
})();
