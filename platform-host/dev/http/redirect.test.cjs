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
