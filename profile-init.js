firebase.initializeApp(FIREBASE_CONFIG);
const auth=firebase.auth();

auth.onAuthStateChanged(user=>{
  if(!user){document.getElementById('login-gate').style.display='flex';document.getElementById('profile-content').style.display='none';return}
  document.getElementById('login-gate').style.display='none';
  document.getElementById('profile-content').style.display='block';

  // Populate profile
  const name=user.displayName||user.email.split('@')[0];
  document.getElementById('profile-name').textContent=name;
  document.getElementById('profile-email').textContent=user.email;
  document.getElementById('avatar-letter').textContent=name[0].toUpperCase();
  document.getElementById('edit-name').value=user.displayName||'';

  // Load avatar from localStorage
  const savedAvatar=localStorage.getItem('ml_avatar');
  if(savedAvatar){
    const img=document.createElement('img');img.src=savedAvatar;
    document.getElementById('avatar-display').prepend(img);
    document.getElementById('avatar-letter').style.display='none';
  }

  // Stats from localStorage
  const versions=JSON.parse(localStorage.getItem('ml_versions')||'[]');
  document.getElementById('stat-manuscripts').textContent=versions.length;
  const totalWords=versions.reduce((s,v)=>s+(v.wordCount||0),0);
  document.getElementById('stat-words').textContent=totalWords>1000?(totalWords/1000).toFixed(1)+'k':totalWords;
  document.getElementById('stat-fixes').textContent=localStorage.getItem('ml_fixes_count')||'0';

  // Load preferences
  const prefs=JSON.parse(localStorage.getItem('ml_prefs')||'{}');
  document.getElementById('pref-autosave').checked=prefs.autosave!==false;
  document.getElementById('pref-cookies').checked=prefs.showCookies||false;
  document.getElementById('pref-theme').checked=prefs.darkTheme!==false;
  if(prefs.defaultGenre)document.getElementById('pref-genre').value=prefs.defaultGenre;
  document.getElementById('pref-push').checked=prefs.pushReminders||false;
  document.getElementById('pref-email-reminders').checked=prefs.emailReminders||false;

  // Beta access: check tier and show/hide accordingly
  firebase.firestore().collection('users').doc(user.uid).get().then(doc=>{
    const tier=(doc.exists&&doc.data().tier)||'free';
    const badge=document.getElementById('tier-badge');
    if(tier==='beta'){
      badge.textContent='BETA';badge.className='tier-badge tier-beta';
      document.getElementById('beta-form').style.display='none';
      document.getElementById('beta-active-msg').style.display='block';
      document.getElementById('sub-status').innerHTML='You have <strong>Beta</strong> access — AI features unlocked.';
    }else if(tier==='premium'){
      badge.textContent='PREMIUM';badge.className='tier-badge tier-premium';
      document.getElementById('beta-section').style.display='none';
    }else if(tier==='starter'){
      badge.textContent='STARTER';badge.className='tier-badge tier-starter';
      document.getElementById('beta-section').style.display='none';
    }
  }).catch(()=>{});
});

// Save profile
document.getElementById('save-profile').addEventListener('click',async()=>{
  const user=auth.currentUser;if(!user)return;
  const newName=document.getElementById('edit-name').value.trim();
  if(newName){await user.updateProfile({displayName:newName});document.getElementById('profile-name').textContent=newName;document.getElementById('avatar-letter').textContent=newName[0].toUpperCase()}
  // Save preferences
  const pushOn=document.getElementById('pref-push').checked;
  const emailOn=document.getElementById('pref-email-reminders').checked;
  const prefs={
    autosave:document.getElementById('pref-autosave').checked,
    showCookies:document.getElementById('pref-cookies').checked,
    darkTheme:document.getElementById('pref-theme').checked,
    defaultGenre:document.getElementById('pref-genre').value,
    pushReminders:pushOn,
    emailReminders:emailOn
  };
  localStorage.setItem('ml_prefs',JSON.stringify(prefs));

  // Handle push subscription change — write directly to Firestore
  const fsDb=firebase.firestore();
  if(pushOn&&'serviceWorker' in navigator&&'PushManager' in window){
    navigator.serviceWorker.register('/sw.js').then(async reg=>{
      await navigator.serviceWorker.ready;
      const existing=await reg.pushManager.getSubscription();
      if(!existing){
        const perm=await Notification.requestPermission();
        if(perm==='granted'){
          const VAPID_PUBLIC='BIExireuGYmZMRI4Ou3bUI0k4BaAJP1pxczO9WCmb58JvUiSqROFYRPcTFcrHcWUWtoF2aGTmBc6uudgqfkFpf8';
          function urlB64ToUint8Array(b){const p='='.repeat((4-b.length%4)%4);const d=atob((b+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...d].map(c=>c.charCodeAt(0)))}
          const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToUint8Array(VAPID_PUBLIC)});
          await fsDb.collection('pushSubscriptions').doc(user.uid).set({
            uid:user.uid,email:user.email||'',subscription:sub.toJSON(),
            updatedAt:firebase.firestore.FieldValue.serverTimestamp()
          });
          localStorage.setItem('ml_push_subscribed','1');
        }
      }
    }).catch(()=>{});
  }else if(!pushOn&&'serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration('/sw.js').then(async reg=>{
      const sub=await reg?.pushManager.getSubscription();
      if(sub)await sub.unsubscribe();
      await fsDb.collection('pushSubscriptions').doc(user.uid).delete().catch(()=>{});
      localStorage.removeItem('ml_push_subscribed');
    }).catch(()=>{});
  }

  // Sync email preference directly to Firestore
  const session=JSON.parse(localStorage.getItem('ml_session')||'{}');
  fsDb.collection('userSessions').doc(user.uid).set(
    {emailReminders:emailOn,email:user.email||''},{merge:true}
  ).catch(()=>{});

  alert('Profile saved!');
});

document.getElementById('reset-profile').addEventListener('click',()=>{
  const user=auth.currentUser;if(!user)return;
  document.getElementById('edit-name').value=user.displayName||'';
});

// Avatar upload
document.getElementById('avatar-display').addEventListener('click',()=>document.getElementById('avatar-input').click());
document.getElementById('avatar-input').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  if(file.size>500*1024){alert('Image too large (max 500KB)');return}
  const reader=new FileReader();
  reader.onload=ev=>{
    localStorage.setItem('ml_avatar',ev.target.result);
    const existing=document.getElementById('avatar-display').querySelector('img');
    if(existing)existing.src=ev.target.result;
    else{const img=document.createElement('img');img.src=ev.target.result;document.getElementById('avatar-display').prepend(img);document.getElementById('avatar-letter').style.display='none'}
  };
  reader.readAsDataURL(file);
});

// Sign out
document.getElementById('signout-btn').addEventListener('click',()=>{
  auth.signOut();window.location.href='index.html';
});

// Clear data
document.getElementById('clear-data-btn').addEventListener('click',()=>{
  if(confirm('Clear all local data? This removes auto-saves, preferences, and cached analyses.')){
    localStorage.clear();sessionStorage.clear();alert('Data cleared.');window.location.reload();
  }
});

// Delete account — requires typing "permanently delete" to confirm
document.getElementById('delete-account-btn').addEventListener('click',()=>{
  // Show confirmation modal
  let overlay=document.getElementById('delete-confirm-overlay');
  if(overlay){overlay.remove()}
  overlay=document.createElement('div');
  overlay.id='delete-confirm-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:3000';
  overlay.innerHTML=`
    <div style="background:#1c1917;border:1px solid #3a3330;border-radius:12px;padding:2rem;max-width:420px;width:90%;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,.5)">
      <div style="font-size:2rem;margin-bottom:.5rem">&#9888;</div>
      <h3 style="color:#c45c4a;font-family:Lora,serif;margin-bottom:.5rem">Delete Your Account</h3>
      <p style="color:#9c9085;font-size:.82rem;line-height:1.6;margin-bottom:1rem">This will permanently delete your account and all manuscripts. This action <strong style="color:#e8dfd4">cannot be undone</strong>.</p>
      <p style="color:#9c9085;font-size:.78rem;margin-bottom:.6rem">Type <strong style="color:#c45c4a">permanently delete</strong> to confirm:</p>
      <input type="text" id="delete-confirm-input" placeholder="Type here..." style="width:100%;padding:.5rem .65rem;background:#252220;border:1px solid #3a3330;border-radius:6px;color:#e8dfd4;font-size:.85rem;font-family:monospace;text-align:center;margin-bottom:1rem">
      <div style="display:flex;gap:.5rem;justify-content:center">
        <button id="delete-confirm-cancel" style="padding:.45rem 1.2rem;background:#252220;border:1px solid #3a3330;color:#9c9085;border-radius:6px;font-size:.82rem;cursor:pointer;font-family:inherit">Cancel</button>
        <button id="delete-confirm-go" style="padding:.45rem 1.2rem;background:#3a1515;border:1px solid #c45c4a;color:#c45c4a;border-radius:6px;font-size:.82rem;cursor:pointer;font-family:inherit;opacity:.4;pointer-events:none">Delete Account</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input=document.getElementById('delete-confirm-input');
  const goBtn=document.getElementById('delete-confirm-go');
  input.addEventListener('input',()=>{
    const match=input.value.trim().toLowerCase()==='permanently delete';
    goBtn.style.opacity=match?'1':'.4';
    goBtn.style.pointerEvents=match?'auto':'none';
  });
  document.getElementById('delete-confirm-cancel').addEventListener('click',()=>overlay.remove());
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
  goBtn.addEventListener('click',async()=>{
    if(input.value.trim().toLowerCase()!=='permanently delete')return;
    goBtn.textContent='Deleting...';goBtn.style.pointerEvents='none';
    try{await auth.currentUser.delete();localStorage.clear();sessionStorage.clear();window.location.href='index.html'}
    catch(e){
      if(e.code==='auth/requires-recent-login'){
        overlay.remove();
        alert('For security, please sign out and sign back in, then try again.');
      }else{overlay.remove();alert(e.message)}
    }
  });
  input.focus();
});

// Beta code redemption
document.getElementById('redeem-btn').addEventListener('click',async()=>{
  const user=auth.currentUser;if(!user)return;
  const codeInput=document.getElementById('beta-code');
  const msg=document.getElementById('beta-msg');
  const btn=document.getElementById('redeem-btn');
  const code=codeInput.value.trim();
  if(!code){msg.textContent='Please enter an invite code.';msg.className='beta-msg err';return}

  btn.textContent='Activating...';btn.disabled=true;
  msg.className='beta-msg';msg.style.display='none';

  try{
    const token=await user.getIdToken();
    const res=await fetch('/api/redeem',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+token},
      body:JSON.stringify({code:code})
    });
    const data=await res.json();
    if(res.ok&&data.success){
      msg.textContent='Beta access activated! AI features are now unlocked. Refreshing...';
      msg.className='beta-msg ok';
      setTimeout(()=>window.location.reload(),1500);
    }else{
      msg.textContent=data.error||'Redemption failed. Please try again.';
      msg.className='beta-msg err';
    }
  }catch(e){
    msg.textContent='Network error. Please check your connection and try again.';
    msg.className='beta-msg err';
  }
  btn.textContent='Activate';btn.disabled=false;
});
