'use strict';
const {getAdmin}=require('./_auth');
async function rawBody(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>1048576)throw new Error('Payload too large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.STRIPE_WEBHOOK_SECRET||!process.env.STRIPE_SECRET_KEY)return res.status(503).json({error:'Billing not configured'});
  const stripe=require('stripe')(process.env.STRIPE_SECRET_KEY);
  let event;
  try{event=stripe.webhooks.constructEvent(await rawBody(req),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);}
  catch(_){return res.status(400).json({error:'Webhook signature verification failed'});}
  const handled=new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.updated','customer.subscription.deleted']);
  if(!handled.has(event.type))return res.status(200).json({received:true});
  const fb=getAdmin();
  if(!fb)return res.status(503).json({error:'Billing storage unavailable'});
  try{
    const object=event.data.object;
    // Read Stripe's current state, not stale event amounts/order. Metadata is
    // attached by our authenticated checkout endpoint, never by the browser.
    const subscriptionId=event.type.startsWith('checkout.')?object.subscription:object.id;
    if(!subscriptionId)return res.status(200).json({received:true});
    const sub=event.type==='customer.subscription.deleted'?object:await stripe.subscriptions.retrieve(subscriptionId);
    let userId=sub.metadata?.userId||object.metadata?.userId;
    if(!userId){
      const snap=await fb.firestore().collection('users').where('stripeSubscriptionId','==',sub.id).limit(1).get();
      userId=snap.docs[0]?.id;
    }
    if(!userId)throw new Error('Subscription cannot be mapped to a user');
    const ref=fb.firestore().collection('users').doc(userId);
    const plan=sub.metadata?.plan||object.metadata?.plan;
    const active=['active','trialing'].includes(sub.status);
    if(active&&!['starter','premium'].includes(plan))throw new Error('Subscription needs plan metadata migration');
    await fb.firestore().runTransaction(async tx=>{
      const deletion=await tx.get(fb.firestore().collection('accountDeletions').doc(userId));
      if(deletion.exists)return;
      const current=await tx.get(ref),data=current.data()||{};
      if(!current.exists&&!active)return;
      if(data.stripeLastEventId===event.id&&event.id)return;
      // Serialize entitlement writes and ignore older events/subscriptions.
      if((data.stripeLastEventCreated||0)>(event.created||0))return;
      if(data.stripeSubscriptionId&&data.stripeSubscriptionId!==sub.id){
        if(event.type==='customer.subscription.deleted')return;
        if((data.stripeSubscriptionCreated||0)>(sub.created||0))return;
      }
      tx.set(ref,{tier:active?plan:'free',stripeCustomerId:sub.customer,
        stripeSubscriptionId:sub.id,subscriptionStatus:sub.status,
        stripeSubscriptionCreated:sub.created||0,stripeLastEventCreated:event.created||0,
        stripeLastEventId:event.id||null,
        tierUpdatedAt:fb.firestore.FieldValue.serverTimestamp()},{merge:true});
    });
    return res.status(200).json({received:true});
  }catch(error){
    console.error('Webhook processing failed:',error.message);
    // Non-2xx lets Stripe retry instead of silently dropping paid entitlement.
    return res.status(503).json({error:'Billing update deferred; retry required'});
  }
}
module.exports=handler;
module.exports.config={api:{bodyParser:false}};
