// Pricing page — Firebase init + checkout + FAQ
firebase.initializeApp(FIREBASE_CONFIG);
document.querySelectorAll('.faq-item').forEach(function(item){item.querySelector('.faq-q').addEventListener('click',function(){item.classList.toggle('open')})});
document.querySelectorAll('.checkout-tier').forEach(function(btn){btn.addEventListener('click',async function(){
  var user=firebase.auth().currentUser;
  if(!user){alert('Please sign in first at the home page');window.location.href='index.html';return}
  var plan=btn.dataset.plan;btn.textContent='Redirecting...';btn.disabled=true;
  try{
    var hdrs={'content-type':'application/json'};
    try{hdrs['authorization']='Bearer '+await user.getIdToken()}catch(e){}
    var resp=await fetch('/api/checkout',{method:'POST',headers:hdrs,body:JSON.stringify({userId:user.uid,email:user.email,plan})});
    var data=await resp.json();
    if(data.url)window.location.href=data.url;
    else{alert(data.error||'Checkout failed');btn.textContent='Get '+plan.charAt(0).toUpperCase()+plan.slice(1);btn.disabled=false}
  }catch(e){alert('Error: '+e.message);btn.textContent='Get '+plan.charAt(0).toUpperCase()+plan.slice(1);btn.disabled=false}
})});
