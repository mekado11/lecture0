'use strict';
const {verifyToken,getAdmin}=require('./_auth');
module.exports=async(req,res)=>{
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const {user}=await verifyToken(req);
  if(!user)return res.status(401).json({error:'Authentication required'});
  const fb=getAdmin();
  if(!fb)return res.status(503).json({error:'Account service unavailable'});
  const action=req.body?.action;
  if(!['delete','billing'].includes(action))return res.status(400).json({error:'Invalid account action'});
  if(action==='delete'&&(req.body?.confirmation!=='permanently delete'||!user.auth_time||Date.now()/1000-user.auth_time>300))
    return res.status(403).json({error:'Sign out and sign in again, then confirm deletion within five minutes.'});
  try{
    const db=fb.firestore(),ref=db.collection('users').doc(user.uid),profile=(await ref.get()).data()||{};
    if(action==='billing'){
      if(!profile.stripeCustomerId)return res.status(400).json({error:'No billing account found'});
      if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:'Billing unavailable'});
      const session=await require('stripe')(process.env.STRIPE_SECRET_KEY).billingPortal.sessions.create({
        customer:profile.stripeCustomerId,return_url:'https://authorscrolls.com/profile.html'
      });
      return res.json({url:session.url});
    }
    // A server-only tombstone blocks concurrent webhook/profile recreation.
    // Keep it after deletion; removing it is a separately reviewed admin action.
    await db.collection('accountDeletions').doc(user.uid).set({
      requestedAt:fb.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    // Cancel billing before removing identity, so no orphaned subscription keeps charging.
    if(profile.stripeSubscriptionId){
      if(!process.env.STRIPE_SECRET_KEY)throw new Error('Billing cancellation unavailable');
      const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY);
      const sub=await stripe.subscriptions.retrieve(profile.stripeSubscriptionId);
      if(!['canceled','incomplete_expired'].includes(sub.status))await stripe.subscriptions.cancel(sub.id);
    }
    // Admin recursiveDelete includes all nested chapters, scans and snapshots.
    await db.recursiveDelete(ref);
    await db.collection('pushSubscriptions').doc(user.uid).delete();
    await db.collection('userSessions').doc(user.uid).delete();
    await db.collection('checkoutLocks').doc(user.uid).delete();
    await fb.auth().deleteUser(user.uid);
    return res.json({success:true});
  }catch(error){
    console.error('Account action failed:',error.message);
    return res.status(503).json({error:'The account operation did not complete. Please retry or contact support.'});
  }
};
