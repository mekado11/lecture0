'use strict';
function eligible(channel,session,profile,now){
  if(!session||!profile)return false;
  const age=now-Number(session.lastSessionTime||0);
  if(!Number.isFinite(age)||age<0)return false;
  if(channel==='push')return profile.preferences?.pushReminders===true&&age>=86400000&&age<=172800000&&(session.lastReminderTier||0)<2;
  return channel==='email'&&profile.preferences?.emailReminders===true&&age>=259200000&&(session.lastReminderTier||0)<3;
}
function verifiedRecipient(user){
  return user&&!user.disabled&&user.emailVerified&&typeof user.email==='string'?user.email:null;
}
// No manuscript titles, excerpts or scores in lock-screen/email notifications.
function pushPayload(){return {title:'AuthorScrolls',body:'Your writing workspace is waiting. Ready to continue?',url:'/app.html'};}
function emailHtml(){return '<!doctype html><html><body><h1>AuthorScrolls</h1><p>Your writing workspace is waiting whenever you are ready.</p><p><a href="https://authorscrolls.com/app.html">Return to your writing</a></p><p>Turn off email reminders in <a href="https://authorscrolls.com/profile.html">your preferences</a>.</p></body></html>';}
module.exports={eligible,verifiedRecipient,pushPayload,emailHtml};
