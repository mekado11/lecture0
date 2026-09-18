'use strict';
// Real Chromium UI + real parsers; only auth, Firestore and paid provider are mocked.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const server=require('../server'),JSZip=require('jszip');
const root=path.resolve(__dirname,'..');
const text='Chapter 1: The Gate\n\n'+
  'Alice was the captain of the guard. Bob was her brother. Alice trusted Bob. They waited beside the gate, listening to the rain. '.repeat(8)+
  '\n\nChapter 2: The Return\n\nThree days later, Alice returned to the village. Bob betrayed Alice. '+
  'The old road was empty. She remembered the promise and opened the door. '.repeat(8);
async function docx(){
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+text.split('\n').filter(Boolean).map(t=>'<w:p><w:r><w:t>'+t+'</w:t></w:r></w:p>').join('')+'</w:body></w:document>');
  return zip.generateAsync({type:'nodebuffer'});
}
function pdf(){
  const stream='BT /F1 10 Tf 40 760 Td (Chapter 1: The Gate) Tj '+Array.from({length:25},()=> '0 -18 Td (Alice trusted Bob. The captain waited beside the gate in the rain.) Tj').join(' ')+' ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let out='%PDF-1.4\n';const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const start=Buffer.byteLength(out);
  out+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(out);
}
(async()=>{
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const errors=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    // The homepage must work without any auth/CDN dependency.
    await context.route('https://www.gstatic.com/**',route=>route.abort());
    await page.goto(base);
    await page.getByRole('heading',{name:'Your book. Understood.'}).waitFor();
    await page.screenshot({path:path.join(root,'test-results/home-desktop.png')});
    await page.locator('#theme-toggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await page.screenshot({path:path.join(root,'test-results/home-light.png')});
    await page.locator('#nav-signin').click();
    await page.locator('#auth-dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#auth-dialog[open]').count(),0);
    await page.setViewportSize({width:375,height:812});
    await page.locator('#theme-toggle').click();
    await page.locator('#menu-toggle').click();
    assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true');
    await page.locator('#mobile-nav a').first().click();
    await page.evaluate(()=>scrollTo(0,0));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(root,'test-results/home-mobile.png')});
    console.log('PASS homepage: responsive, light/dark, navigation, modal, CDN failure isolation');
    await context.unroute('https://www.gstatic.com/**');
    await context.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:''}));
    await context.addInitScript({path:path.join(__dirname,'firebase-fixture.js')});
    await context.addInitScript(()=>{
      window.__fixture=createFirebaseFixture();window.firebase=__fixture.firebase;
      localStorage.setItem('ml_storage_owner','test-author');localStorage.setItem('wizard_done','1');
      localStorage.setItem('cookie_consent','essential');localStorage.setItem('ml_push_dismissed','1');
      Object.defineProperty(navigator,'serviceWorker',{configurable:true,get(){throw new DOMException('Notifications blocked in this environment','SecurityError');}});
    });
    let providerCalls=0,contextSent='';
    await context.route('**/api/claude',async route=>{
      providerCalls++;contextSent=route.request().postData();
      await route.fulfill({json:{content:[{text:JSON.stringify({answer:'Alice trusted Bob before his betrayal.',evidence:[]})}]}});
    });
    await page.setViewportSize({width:1440,height:1000});
    page.on('dialog',dialog=>{console.log('DIALOG:',dialog.message());dialog.accept();});
    await page.goto(base+'/app.html');
    await page.locator('#lib-loading.hidden').waitFor({state:'attached'});
    // An older draft must not be deleted by startup or silently cross accounts.
    await page.evaluate(()=>localStorage.setItem('ml_autosave',JSON.stringify({text:'LEGACY_PRIVATE_DRAFT'})));
    await page.reload();
    await page.getByRole('heading',{name:'Protect your older drafts'}).waitFor();
    const recoveryDownload=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download recovery archive'}).click();
    assert.ok(fs.readFileSync(await (await recoveryDownload).path(),'utf8').includes('LEGACY_PRIVATE_DRAFT'));
    await page.getByRole('button',{name:'Remove old browser copies'}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('ml_autosave')),null);
    await page.locator('#lib-loading.hidden').waitFor({state:'attached'});
    async function upload(name,buffer,genre='fantasy'){
      // Open the actual upload modal, then use its real file picker.
      await page.locator('#lib-add-btn').click();
      await page.locator('#file-input').setInputFiles({name,mimeType:'application/octet-stream',buffer});
      await page.locator('#genre-select').selectOption(genre);
      await page.locator('#analyze-btn').click();
      await page.locator('#editor-view:not(.hidden)').waitFor({timeout:30000});
      await page.locator('[data-wsnav="chapters"]').click();
      await page.locator('#workspace-nav-content [data-chapter]').first().waitFor();
      assert.ok((await page.locator('#ed-annotated').innerText()).length>100);
    }
    await upload('draft.txt',Buffer.from(text));
    assert.equal(await page.evaluate(()=>AuthorScrollsEditor.getText()),text,'Opening a draft must not change its text or add page footers');
    const original=await page.evaluate(()=>AuthorScrollsEditor.getText());
    await page.locator('#ed-annotated').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' TYPING_SENTINEL');
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(()=>AuthorScrollsEditor.getText()),original,'Typing undo restores the pre-edit DOM and text');
    await page.keyboard.press('Control+Shift+z');
    assert.ok((await page.evaluate(()=>AuthorScrollsEditor.getText())).includes('TYPING_SENTINEL'));
    await page.keyboard.press('Control+z');
    assert.equal(providerCalls,0,'No automatic paid calls on manuscript open');
    await page.screenshot({path:path.join(root,'test-results/editor-desktop.png')});
    for(const mode of ['characters','threads','review','chapters']){
      await page.locator(`[data-wsnav="${mode}"]`).click();
      await page.locator(`#workspace-nav-content`).waitFor();
    }
    await page.locator('#workspace-intel-open').click();
    await page.locator('#intel-question').fill('Why did Bob betray Alice?');
    await page.locator('#intel-ask').click();
    await page.locator('#intel-answer').getByText('Alice trusted Bob before his betrayal.',{exact:true}).waitFor();
    assert.ok(contextSent.includes('RETRIEVED BOOK CONTEXT'));
    assert.ok(contextSent.includes('Alice'));
    await page.locator('#intel-close').click();
    await page.waitForTimeout(350);
    await page.locator('#save-btn').click();
    await page.waitForFunction(async()=> (await Storage.getVersions(Storage._currentManuscriptId)).length>0);
    await page.locator('#ed-annotated').evaluate(el=>{el.appendChild(Object.assign(document.createElement('p'),{textContent:'UNSAVED SENTINEL'}));el.dispatchEvent(new InputEvent('input',{bubbles:true}));});
    // Export immediately, before reanalysis/autosave debounce.
    await page.locator('.header-menu summary').filter({hasText:'Tools'}).click();
    const download=page.waitForEvent('download');await page.locator('#export-btn').click();
    const exported=await download;
    assert.ok(fs.readFileSync(await exported.path(),'utf8').includes('UNSAVED SENTINEL'));
    // Restore snapshot while current edits have not been saved.
    await page.locator('[data-wsnav="versions"]').click();
    await page.locator('[data-version]').first().click();
    await page.locator('.ws-restore').click();
    await page.getByText('Version restored. Your previous working text is available in the safety snapshot.').waitFor();
    assert.ok(!(await page.locator('#ed-annotated').innerText()).includes('UNSAVED SENTINEL'));
    assert.ok(await page.evaluate(async()=>{
      const versions=await Storage.getVersions(Storage._currentManuscriptId);
      const safety=versions.find(v=>v.reason==='before_restore');
      return (await Storage.getVersion(Storage._currentManuscriptId,safety.id)).text.includes('UNSAVED SENTINEL');
    }));
    await page.locator('#ed-annotated').evaluate(el=>{el.appendChild(Object.assign(document.createElement('p'),{textContent:'NAVIGATION SENTINEL'}));el.dispatchEvent(new InputEvent('input',{bubbles:true}));});
    await page.locator('#new-btn').click();
    await page.locator('#upload-view:not(.hidden)').waitFor();
    assert.ok(await page.evaluate(async()=>{const m=(await Storage.getManuscripts())[0];return (await Storage.getManuscript(m.id)).text.includes('NAVIGATION SENTINEL');}));
    await upload('draft.txt',Buffer.from(text));
    assert.equal(await page.evaluate(async()=>(await Storage.getManuscripts()).length),2,'Same-name drafts preserved');
    await page.locator('#new-btn').click();
    await page.locator('#upload-view:not(.hidden)').waitFor();
    await upload('import.docx',await docx());
    await page.locator('#new-btn').click();
    await page.locator('#upload-view:not(.hidden)').waitFor();
    await upload('import.pdf',pdf());
    await page.locator('#new-btn').click();
    await page.locator('#upload-view:not(.hidden)').waitFor();
    const nonfiction=require('./manuscript-fixtures').nonfiction(12,4);
    await upload('The Practice of Deliberate Change - A Complete Manuscript Review Edition.txt',Buffer.from(nonfiction),'selfHelp');
    assert.equal(await page.evaluate(()=>AuthorScrollsEditor.getAnalysis().scores.dialogue),null);
    await page.locator('[data-wsnav="characters"]').click();
    assert.equal(await page.locator('[data-wsnav="characters"]').innerText(),'Concepts');
    await page.locator('#intel-open').click();
    await page.getByRole('heading',{name:'Attributed claims',exact:false}).waitFor();
    await page.locator('#intel-close').click();
    await page.waitForTimeout(350);
    const scoreBefore=await page.evaluate(()=>JSON.stringify({overall:AuthorScrollsEditor.getAnalysis().overall,scores:AuthorScrollsEditor.getAnalysis().scores}));
    await context.route('**/api/grammar',route=>route.fulfill({json:{matches:[{offset:0,length:7,message:'Synthetic grammar advice',replacements:[],rule:{category:{id:'GRAMMAR'}}}]}}));
    await page.evaluate(()=>{window.__userPlan='premium';});
    await page.locator('.header-menu summary').filter({hasText:'Tools'}).click();
    await page.locator('#optional-checks-btn').click();
    await page.waitForFunction(()=>!document.getElementById('optional-checks-btn').disabled);
    assert.equal(await page.evaluate(()=>JSON.stringify({overall:AuthorScrollsEditor.getAnalysis().overall,scores:AuthorScrollsEditor.getAnalysis().scores})),scoreBefore,'Optional external advice cannot change scores');
    assert.ok(await page.evaluate(()=>!Object.values(localStorage).some(value=>value.includes('UNIQUE_ANCHOR'))&&!Object.values(sessionStorage).some(value=>value.includes('UNIQUE_ANCHOR'))),'No manuscript-derived browser persistence');
    await page.screenshot({path:path.join(root,'test-results/header-nonfiction-desktop.png')});
    // Failure path: retain the open draft and block navigation if cloud writes fail.
    await page.evaluate(()=>{__fixture.fail=()=>true;});
    await page.locator('#ed-annotated').click();
    await page.keyboard.press('Control+End');await page.keyboard.type(' UNSAVED_FAILURE_SENTINEL');
    await page.locator('#new-btn').click();
    assert.ok(await page.locator('#editor-view').isVisible());
    assert.equal(await page.locator('#save-state').innerText(),'Not saved');
    assert.ok((await page.evaluate(()=>AuthorScrollsEditor.getText())).includes('UNSAVED_FAILURE_SENTINEL'));
    await page.evaluate(()=>{__fixture.fail=null;});
    await page.locator('#save-btn').click();
    await page.waitForFunction(()=>document.getElementById('save-state').textContent==='Saved to cloud');
    await page.locator('.header-menu summary').filter({hasText:'Account'}).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.header-menu[open]').count(),0,'Escape closes menus');
    console.log('PASS nonfiction routing, exact no-edit text preservation, typing undo/redo, immutable AI scores, private caches, failed-save navigation guard, header menus');
    console.log('PASS editor: TXT/DOCX/PDF imports, worker analysis, navigator, grounded question, save, export, restore, safety snapshot, navigation flush, distinct same-name drafts');
    await page.setViewportSize({width:375,height:812});
    assert.ok(await page.locator('.center-panel').evaluate(el=>el.getBoundingClientRect().height>400),'Mobile manuscript retains writing space');
    assert.ok((await page.locator('#ed-annotated h1,#ed-annotated h2').first().innerText()).length<100,'Body is not swallowed by its chapter heading');
    await page.screenshot({path:path.join(root,'test-results/editor-mobile.png')});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile editor must not overflow');
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#new-btn').click();
    await page.locator('#upload-view:not(.hidden)').waitFor();
    const longBook=require('./manuscript-fixtures').nonfiction(30,60),started=Date.now();
    await upload('Long-book-validation.txt',Buffer.from(longBook),'selfHelp');
    assert.equal(await page.evaluate(()=>AuthorScrollsEditor.getText()),longBook,'Long book round-trip');
    assert.equal(await page.evaluate(async()=> (await Storage.getManuscript(Storage._currentManuscriptId)).text),longBook,'Cloud round-trip');
    console.log(`PASS long-book browser analysis + render + cloud save: ${longBook.split(/\s+/).length} words, ${Date.now()-started}ms`);
    await page.locator('#genre-override').selectOption('fantasy');
    assert.equal(await page.evaluate(()=>AuthorScrollsEditor.getAnalysis().genre.primary),'fantasy');
    await page.locator('#genre-override').selectOption('selfHelp');
    assert.equal(await page.evaluate(()=>AuthorScrollsEditor.getAnalysis().scores.dialogue),null);
    assert.equal(await page.evaluate(()=>AuthorScrollsEditor.getText()),longBook,'Genre switches preserve source');
    await page.setViewportSize({width:375,height:812});
    for(const filename of ['features.html','pricing.html','faq.html','blog.html','legal.html','profile.html']){
      await page.goto(base+'/'+filename);
      assert.ok((await page.locator('body').innerText()).trim().length>100,filename);
      await page.screenshot({path:path.join(root,'test-results',filename.replace('.html','')+'-mobile.png')});
    }
    console.log('PASS supporting pages: features, pricing, resources, blog, legal, profile render');
    assert.deepEqual(errors,[],'No uncaught browser exceptions');
    console.log('PASS mobile editor width and zero uncaught browser errors');
  }finally{if(errors.length)console.error('Browser errors:',errors);await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
