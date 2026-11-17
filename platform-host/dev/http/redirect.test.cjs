const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {createWebHttpTransport}=require('../../adapters/http.web.ts');
async function server(handler){const s=http.createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));return {url:`http://127.0.0.1:${s.address().port}`,close:()=>new Promise(resolve=>s.close(resolve))};}
test('actual fetch refuses redirect without forwarding scoped bearer to a different origin',async t=>{
  let leaked=0;const target=await server((req,res)=>{if(req.headers.authorization)leaked++;res.end('{}');});t.after(target.close);
  const source=await server((req,res)=>{assert.equal(req.headers.authorization,'Bearer scoped-fixture');res.writeHead(302,{location:target.url});res.end();});t.after(source.close);
  await assert.rejects(createWebHttpTransport()({url:source.url,method:'GET',token:'scoped-fixture',redirect:'error',signal:new AbortController().signal}));assert.equal(leaked,0);
});
test('actual fetch accepts JSON and bounds oversized responses',async t=>{
  const source=await server((req,res)=>{res.setHeader('content-type','application/json');res.end(req.url==='/large'?'x'.repeat(2*1024*1024+1):'{"ok":true}');});t.after(source.close);
  const send=createWebHttpTransport();const request={url:source.url,method:'GET',token:'scoped-fixture',redirect:'error',signal:new AbortController().signal};
  assert.deepEqual(await send(request),{status:200,body:{ok:true}});await assert.rejects(send({...request,url:`${source.url}/large`}),/too large/);
});
const {createWebArtifactTransport}=require('../../adapters/artifacts.web.ts');
test('private binary transport refuses redirects and bounds actual streamed bytes',async t=>{
  let leaked=0;const target=await server((req,res)=>{if(req.headers.authorization)leaked++;res.end('not reached');});t.after(target.close);
  const source=await server((req,res)=>{
    if(req.url==='/redirect'){res.writeHead(307,{location:target.url});res.end();}
    else if(req.url==='/large'){res.writeHead(200,{'transfer-encoding':'chunked'});res.end(Buffer.alloc(12*1024*1024+1));}
    else if(req.url==='/missing'){res.writeHead(404);res.end('not a bundle');}
    else res.end(Buffer.from([0,255,1,128]));
  });t.after(source.close);
  const send=createWebArtifactTransport();const request={url:source.url,method:'GET',token:'scoped-fixture',redirect:'error',signal:new AbortController().signal};
  assert.deepEqual(await send(request),{status:200,body:new Uint8Array([0,255,1,128])});
  await assert.rejects(send({...request,url:source.url+'/redirect'}));assert.equal(leaked,0);
  await assert.rejects(send({...request,url:source.url+'/large'}),/too large/);
  assert.deepEqual(await send({...request,url:source.url+'/missing'}),{status:404,body:null});
});
test('binary transport rejects stale sessions and non-GET requests before accepting data',async t=>{
  const source=await server((req,res)=>res.end('bytes'));t.after(source.close);
  const controller=new AbortController();controller.abort();
  const request={url:source.url,method:'GET',token:'scoped-fixture',redirect:'error',signal:controller.signal};
  await assert.rejects(createWebArtifactTransport()(request));
  await assert.rejects(createWebArtifactTransport()({...request,method:'POST',body:'{}'}),/GET required/);
});
test('real fetch deadlines include stalled headers and stalled JSON/binary body streams',async t=>{
 const source=await server((req,res)=>{if(req.url==='/headers')return;res.writeHead(200,{'content-type':'application/octet-stream'});res.write('partial');});t.after(source.close);
 const request={url:`${source.url}/headers`,method:'GET',token:'scoped-fixture',redirect:'error',signal:new AbortController().signal};
 await assert.rejects(createWebHttpTransport(fetch,60)(request),/deadline exceeded/);
 await assert.rejects(createWebHttpTransport(fetch,60)({...request,url:`${source.url}/body`}),/deadline exceeded/);
 await assert.rejects(createWebArtifactTransport(fetch,60)({...request,url:`${source.url}/body`}),/deadline exceeded/);
});
test('body reader cancellation handles abort even for a stalled custom stream; expired/caller cancellation remain distinct',async()=>{
 const{readResponseBytes}=require('../../adapters/httpBytes.web.ts');const controller=new AbortController();let cancelled=false;
 const response=new Response(new ReadableStream({cancel(){cancelled=true;}}));const pending=readResponseBytes(response,controller.signal,100);controller.abort();await assert.rejects(pending,/aborted/);assert.equal(cancelled,true);
 const fetcher=async()=>new Response(new ReadableStream({}));await assert.rejects(createWebHttpTransport(fetcher,20)({url:'http://127.0.0.1/fixture',method:'GET',token:'scoped',redirect:'error',signal:new AbortController().signal}),/deadline exceeded/);
 const aborted=new AbortController();aborted.abort();await assert.rejects(createWebHttpTransport(fetcher,20)({url:'http://127.0.0.1/fixture',method:'GET',token:'scoped',redirect:'error',signal:aborted.signal}),/Request aborted/);
});
