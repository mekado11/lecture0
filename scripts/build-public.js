'use strict';
// Explicit public boundary. Never ship API source, tests, credentials or tooling.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(path.join(root,'assets'),{recursive:true});
for(const [source,target] of [
  ['mammoth/mammoth.browser.min.js','mammoth.browser.min.js'],
  ['jszip/dist/jszip.min.js','jszip.min.js'],
  ['pdfjs-dist/build/pdf.min.mjs','pdf.min.mjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs','pdf.worker.min.mjs']
])fs.copyFileSync(path.join(root,'node_modules',source),path.join(root,'assets',target));
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out);
for(const name of fs.readdirSync(root)){
  if(/\.(html|css|js)$/.test(name)&&!name.endsWith('.test.js')&&name!=='server.js')
    fs.copyFileSync(path.join(root,name),path.join(out,name));
}
fs.cpSync(path.join(root,'assets'),path.join(out,'assets'),{recursive:true});
console.log('Public build prepared in dist; private server and test files excluded.');
