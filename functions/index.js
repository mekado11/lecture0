'use strict';
// Reminders only. Model authorization and quotas live in Vercel's api/ directory.
const {onRequest}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {defineSecret}=require('firebase-functions/params');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');
const {eligible,verifiedRecipient,pushPayload,emailHtml}=require('./reminder-policy');
initializeApp();
const db=getFirestore();
const vapidPublic=defineSecret('VAPID_PUBLIC_KEY'),vapidPrivate=defineSecret('VAPID_PRIVATE_KEY');
const smtpHost=defineSecret('SMTP_HOST'),smtpUser=defineSecret('SMTP_USER'),smtpPass=defineSecret('SMTP_PASS');

// Keep the old export to replace an already-deployed endpoint without a second
// provider implementation or a destructive function deletion during migration.
exports.claude=onRequest({maxInstances:1},(_req,res)=>{
  res.status(410).json({error:{message:'This legacy API is retired. Use AuthorScrolls on its primary domain.'}});
});

async function eachPage(collection,processPage){
  let cursor=null;
  while(true){
    let query=db.collection(collection).orderBy(FieldPath.documentId()).limit(100);
    if(cursor)query=query.startAfter(cursor);
    const page=await query.get();
    if(page.empty)return;
    await processPage(page.docs);
    if(page.size<100)return;
    cursor=page.docs[page.docs.length-1];
  }
}
exports.sendPushReminders=onSchedule({
  schedule:'every 6 hours',secrets:[vapidPublic,vapidPrivate],memory:'256MiB',timeoutSeconds:120,
},async()=>{
  const webpush=require('web-push');
  webpush.setVapidDetails('mailto:support@authorscrolls.com',vapidPublic.value(),vapidPrivate.value());
  await eachPage('pushSubscriptions',async docs=>{
    for(const doc of docs){
      // The document owner is the identity. Never trust a client-written uid.
      const uid=doc.id;
      const [session,profile]=await Promise.all([
        db.collection('userSessions').doc(uid).get(),db.collection('users').doc(uid).get(),
      ]);
      if(!eligible('push',session.data(),profile.data(),Date.now()))continue;
      try{
        await webpush.sendNotification(doc.data().subscription,JSON.stringify(pushPayload()),{timeout:10000});
        await session.ref.update({lastReminderTier:2});
      }catch(error){
        if([404,410].includes(error.statusCode))await doc.ref.delete();
        else console.error('Push delivery failed',error.statusCode||'transport');
      }
    }
  });
});
exports.sendEmailReminders=onSchedule({
  schedule:'every day 09:00',secrets:[smtpHost,smtpUser,smtpPass],memory:'256MiB',timeoutSeconds:120,
},async()=>{
  const transporter=require('nodemailer').createTransport({
    host:smtpHost.value(),port:587,secure:false,requireTLS:true,
    auth:{user:smtpUser.value(),pass:smtpPass.value()},
    connectionTimeout:10000,socketTimeout:15000,
  });
  await eachPage('userSessions',async docs=>{
    for(const doc of docs){
      const profile=await db.collection('users').doc(doc.id).get();
      if(!eligible('email',doc.data(),profile.data(),Date.now()))continue;
      try{
        // A writable session.email must never turn this into an email relay.
        const recipient=verifiedRecipient(await getAuth().getUser(doc.id));
        if(!recipient)continue;
        await transporter.sendMail({
          from:'"AuthorScrolls" <noreply@authorscrolls.com>',to:recipient,
          subject:'Your writing workspace is waiting',html:emailHtml(),
        });
        await doc.ref.update({lastReminderTier:3});
      }catch(error){console.error('Email delivery failed',error.code||'transport');}
    }
  });
});
