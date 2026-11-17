const assert=require('node:assert/strict');const http=require('node:http');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const{chromium}=require('@playwright/test');
const script=fs.readFileSync(path.join(__dirname,'../../build/web-test/fixture.js'));
async function browserFixture(t,setup,data={},options={}){
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'lp2-idb-profile-'));let context;const errors=[];
 const server=http.createServer((req,res)=>{res.setHeader('cache-control','no-store');if(options.handleRequest?.(req,res))return;if(req.url==='/fixture.js'){res.setHeader('content-type','text/javascript');res.end(script);}else if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><script src="/fixture.js"></script>');}else{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await context?.close().catch(()=>{});await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});assert.deepEqual(errors,[]);});
 async function anotherPage(){const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);await page.waitForFunction(()=>!!globalThis.LP2);await page.evaluate(setup,data);return page;}
 async function open(){context=await chromium.launchPersistentContext(profile,{headless:true,args:['--no-sandbox']});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort('blockedbyclient'));return anotherPage();}
 return{open,anotherPage,close:async()=>context.close()};
}
module.exports={browserFixture};
