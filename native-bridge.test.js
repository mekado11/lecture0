'use strict';
// native-bridge.js is inert in a browser and active only when the iOS shell has registered its
// message handler. These tests drive it in a fake document.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');

function page({handler}={}){
  const posted=[],listeners={},docListeners={};
  const html={dataset:{}};
  const body={};
  const win={
    location:{href:'https://authorscrolls.com/app.html',origin:'https://authorscrolls.com'},
    webkit:handler?{messageHandlers:{authorscrolls:{postMessage:m=>posted.push(m)}}}:undefined,
    btoa:s=>Buffer.from(s,'binary').toString('base64'),
    unescape,encodeURIComponent,String,Object,URL,
    getComputedStyle:()=>({backgroundColor:'rgb(20, 23, 16)'}),
    MutationObserver:class{observe(){}},
    document:{documentElement:html,body,readyState:'complete',addEventListener:(t,f)=>{(docListeners[t]=docListeners[t]||[]).push(f);}},
    addEventListener:(t,f)=>{(listeners[t]=listeners[t]||[]).push(f);}
  };
  win.window=win;
  vm.createContext(win);
  vm.runInContext(fs.readFileSync(require.resolve('./native-bridge'),'utf8'),win);
  const click=(href,opts={})=>{const ev={target:{closest:()=>({getAttribute:()=>href,target:opts.target||'',dataset:{}})},preventDefault(){ev.prevented=true;}};(docListeners.click||[]).forEach(f=>f(ev));return ev;};
  return {bridge:win.AuthorScrollsNative,posted,html,click};
}

test('in a browser the bridge is inert',()=>{
  const {bridge,posted,html}=page();
  assert.equal(bridge.platform,null);
  assert.equal(bridge.saveFile('a.doc','application/msword','x'),false);
  assert.equal(bridge.openExternal('https://stripe.com'),false);
  assert.deepEqual(posted,[]);
  assert.equal(html.dataset.native,undefined);
});

test('inside the shell: the page is marked, the theme is reported, files and outside links go to the shell',()=>{
  const {bridge,posted,html,click}=page({handler:true});
  assert.equal(bridge.platform,'ios');
  assert.equal(html.dataset.native,'ios');
  const theme=posted.find(m=>m.type==='theme');
  assert.ok(theme&&theme.dark===true,'the dark app background is reported as dark');
  assert.equal(bridge.saveFile('Draft-AuthorScrolls.doc','application/msword','<p>Em dash — and “quotes”</p>'),true);
  const save=posted.find(m=>m.type==='saveFile');
  assert.equal(save.filename,'Draft-AuthorScrolls.doc');
  assert.equal(save.mime,'application/msword');
  assert.equal(Buffer.from(save.base64,'base64').toString('utf8'),'<p>Em dash — and “quotes”</p>','UTF-8 survives the base64 round trip');
  const away=click('https://checkout.stripe.com/pay/x');
  assert.equal(away.prevented,true);
  assert.equal(posted.filter(m=>m.type==='openExternal').pop().url,'https://checkout.stripe.com/pay/x');
  const home=click('/pricing.html');
  assert.notEqual(home.prevented,true,'links on the app’s own origin stay in the web view');
  const mail=click('mailto:hello@example.com');
  assert.notEqual(mail.prevented,true,'non-web schemes are left to the web view and the shell’s navigation rules');
});
