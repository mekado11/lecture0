// Local development server. Uses the same authenticated handlers as Vercel.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname;
const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.json':'application/json'};
const apiRoutes=new Set(['claude','checkout','webhook','grammar','redeem','notify','account']);
const publicFiles=new Set(fs.readdirSync(root).filter(name=>
  /\.(html|css|js)$/.test(name)&&!name.endsWith('.test.js')&&!['server.js'].includes(name)
));
const headers=require('./vercel.json').headers[0].headers;
const server=http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};
  res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  headers.forEach(({key,value})=>res.setHeader(key,value));
  let pathname;
  try{const url=new URL(req.url,'http://localhost');pathname=decodeURIComponent(url.pathname);req.query=Object.fromEntries(url.searchParams);}catch(_){res.status(400).end();return;}
  if(pathname.startsWith('/api/')){
    const route=pathname.slice(5);
    if(!apiRoutes.has(route)){res.status(404).end();return;}
    try{
      if(route!=='webhook'){
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>512000){res.status(413).end();return;}chunks.push(chunk);}
        const raw=Buffer.concat(chunks).toString();
        try{req.body=raw?JSON.parse(raw):{};}catch(_){res.status(400).json({error:'Invalid JSON'});return;}
      }
      await require('./api/'+route)(req,res);
    }catch(error){console.error('Request failed:',error.message);if(!res.writableEnded)res.status(503).json({error:'Service temporarily unavailable'});}
    return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.status(405).end();return;}
  const relative=pathname==='/'?'index.html':pathname.slice(1);
  const asset=/^assets\/[a-zA-Z0-9_.-]+\.(webp|png|svg|ico|js|mjs)$/.test(relative);
  if(!publicFiles.has(relative)&&!asset){res.status(404).end('Not found');return;}
  try{
    const content=await fs.promises.readFile(path.join(root,relative));
    res.setHeader('Content-Type',mime[path.extname(relative)]||'application/octet-stream');
    res.end(req.method==='HEAD'?undefined:content);
  }catch(_){res.status(404).end('Not found');}
});
if(require.main===module)server.listen(process.env.PORT||3000,process.env.HOST||'127.0.0.1',()=>console.log('AuthorScrolls development server ready'));
module.exports=server;
