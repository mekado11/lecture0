'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {eligible,verifiedRecipient,pushPayload,emailHtml}=require('./functions/reminder-policy');
test('reminders require current owner preferences, not only writable session opt-in',()=>{
  const session={lastSessionTime:1,emailReminders:true,lastReminderTier:0};
  assert.equal(eligible('email',session,{},300000000),false);
  assert.equal(eligible('email',session,{preferences:{emailReminders:true}},300000000),true);
  assert.equal(eligible('push',session,{preferences:{pushReminders:true}},90000000),true);
  assert.equal(eligible('push',session,{preferences:{pushReminders:false}},90000000),false);
});
test('reminders use verified Auth email and exclude manuscript content',()=>{
  assert.equal(verifiedRecipient({email:'unverified@example.test',emailVerified:false}),null);
  assert.equal(verifiedRecipient({email:'verified@example.test',emailVerified:true}),'verified@example.test');
  assert.equal(verifiedRecipient({email:'disabled@example.test',emailVerified:true,disabled:true}),null);
  assert.equal(pushPayload().url,'/app.html');
  assert.ok(emailHtml().includes('profile.html'));
});
