'use strict';
// Optional Computer review build ONLY. Never invoked by the production build.
// Uses the actual app with synthetic data and explicitly mocked cloud/auth.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist');
const sample=require('./manuscript-fixtures').nonfiction(8,5);
let html=fs.readFileSync(path.join(dist,'app.html'),'utf8');
html=html.replace(/<script[^>]+src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"[^>]*><\/script>/g,'');
html=html.replace('<script src="legacy-recovery.js"></script>','<script src="preview-fixture.js"></script><script src="preview-boot.js"></script><script src="legacy-recovery.js"></script>');
fs.writeFileSync(path.join(dist,'workspace-preview.html'),html);
fs.copyFileSync(path.join(__dirname,'firebase-fixture.js'),path.join(dist,'preview-fixture.js'));
fs.writeFileSync(path.join(dist,'preview-boot.js'),`
window.__fixture=createFirebaseFixture();window.firebase=__fixture.firebase;
localStorage.setItem('ml_storage_owner','test-author');localStorage.setItem('wizard_done','1');
localStorage.setItem('cookie_consent','essential');localStorage.setItem('ml_push_dismissed','1');
const originalFetch=window.fetch.bind(window);
window.fetch=(url,options)=>String(url).includes('/api/')?Promise.reject(new Error('Review preview: live services are not connected.')):originalFetch(url,options);
window.addEventListener('DOMContentLoaded',async()=>{
 document.title='AuthorScrolls · Workspace review preview';
 const notice=document.createElement('aside');
 notice.textContent='REVIEW PREVIEW · Synthetic manuscript · In-memory saves · No live AI, billing or cloud';
 notice.style.cssText='position:fixed;top:0;left:0;right:0;height:25px;background:#d1ae80;color:#211b15;z-index:9000;text-align:center;font:10px/25px sans-serif;white-space:nowrap;overflow:hidden';
 document.body.style.paddingTop='25px';document.body.style.boxSizing='border-box';document.body.appendChild(notice);
 for(let i=0;i<100&&!document.getElementById('lib-add-btn');i++)await new Promise(r=>setTimeout(r,50));
 document.getElementById('lib-add-btn').click();
 const input=document.getElementById('file-input'),files=new DataTransfer();
 files.items.add(new File([${JSON.stringify(sample)}],'The Practice of Deliberate Change - Review Manuscript.txt',{type:'text/plain'}));
 input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 const genre=document.getElementById('genre-select');genre.value='selfHelp';genre.dispatchEvent(new Event('change',{bubbles:true}));
 document.getElementById('analyze-btn').click();
});
`);
console.log('Isolated review entry built. Never deploy this fixture entry to production.');
