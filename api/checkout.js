'use strict';
const {randomUUID}=require('node:crypto');
const {verifyToken,getAdmin}=require('./_auth');
const PLANS={starter:{amount:500,name:'AuthorScrolls Starter'},premium:{amount:1500,name:'AuthorScrolls Premium'}};
module.exports=async(req,res)=>{
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const {user}=await verifyToken(req);
  if(!user)return res.status(401).json({error:'Authentication required'});
  const plan=req.body?.plan;
  if(!Object.hasOwn(PLANS,plan))return res.status(400).json({error:'Choose a valid plan'});
  if(!user.email)return res.status(400).json({error:'An email address is required for billing'});
  if(!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:'Billing is unavailable'});
  const fb=getAdmin();
  if(!fb)return res.status(503).json({error:'Billing storage is unavailable'});
  try{
    const db=fb.firestore(),profileRef=db.collection('users').doc(user.uid);
    const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY,{timeout:20000,maxNetworkRetries:1});
    const profile=(await profileRef.get()).data()||{};
    if(profile.stripeSubscriptionId){
      const subscription=await stripe.subscriptions.retrieve(profile.stripeSubscriptionId);
      if(!['canceled','incomplete_expired'].includes(subscription.status))
        return res.status(409).json({error:'You already have a subscription. Manage or change it from your profile.'});
    }
    const lockRef=db.collection('checkoutLocks').doc(user.uid),now=Math.floor(Date.now()/1000);
    const lease=await db.runTransaction(async tx=>{
      const [deletion,lock,current]=await Promise.all([
        tx.get(db.collection('accountDeletions').doc(user.uid)),tx.get(lockRef),tx.get(profileRef)
      ]);
      if(deletion.exists)throw new Error('This account is being deleted');
      if((current.data()?.stripeSubscriptionId||null)!==(profile.stripeSubscriptionId||null))
        throw new Error('Billing changed. Refresh your profile before continuing');
      const existing=lock.data();
      // One unexpired Checkout Session per user, regardless of double clicks.
      if(existing&&existing.expiresAt>now)return existing;
      const next={key:randomUUID(),plan,createdAt:now,expiresAt:now+1860};
      tx.set(lockRef,next);return next;
    });
    if(lease.plan!==plan)return res.status(409).json({error:'A checkout for another plan is already open. Finish it or wait 31 minutes before changing plans.'});
    if(lease.url)return res.json({url:lease.url,sessionId:lease.sessionId});
    const origin=['https://authorscrolls.com','https://www.authorscrolls.com'].includes(req.headers.origin)?req.headers.origin:'https://authorscrolls.com';
    const session=await stripe.checkout.sessions.create({
      mode:'subscription',payment_method_types:['card'],
      ...(profile.stripeCustomerId?{customer:profile.stripeCustomerId}:{customer_email:user.email}),
      metadata:{userId:user.uid,plan},subscription_data:{metadata:{userId:user.uid,plan}},
      line_items:[{price_data:{currency:'usd',unit_amount:PLANS[plan].amount,recurring:{interval:'month'},product_data:{name:PLANS[plan].name}},quantity:1}],
      expires_at:lease.createdAt+1800,
      success_url:origin+'/app.html?upgraded=true',cancel_url:origin+'/app.html?cancelled=true'
    },{idempotencyKey:'authorscrolls-checkout-'+lease.key});
    await lockRef.set({url:session.url,sessionId:session.id},{merge:true});
    return res.json({url:session.url,sessionId:session.id});
  }catch(error){
    console.error('Checkout failed:',error.message);
    return res.status(503).json({error:'Checkout could not complete. Please retry or manage billing from your profile.'});
  }
};
