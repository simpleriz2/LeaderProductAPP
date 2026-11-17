const{test}=require('node:test');const assert=require('node:assert/strict');const{generateKeyPairSync,sign,createHash}=require('node:crypto');
function protocol(){const pair=generateKeyPairSync('ed25519');const bytes={};const hash=b=>createHash('sha256').update(b).digest('hex');const file=(name,text)=>{const buffer=Buffer.from(text);const digest=hash(buffer),key=`artifacts/${digest}.bundle`;bytes[key]=buffer.toString('base64');return{name,digest,path:key,size:buffer.length};};
 const release=version=>({format:2,platform:'web',id:`set-${version}`,company:'alpha',minHost:1,runtime:'fixture-web',api:'1.0.0',artifacts:['qr','help'].map(module=>({module,version:`${module==='qr'?version:1}.0.0`,contract:'1.0.0',requires:{minHost:1,capabilities:{},contracts:{}},schema:1,...file(`${module}.container.js`,`${module}:${module==='qr'?version:1}`),assets:[file('shared.js','shared runtime fixture')]}))});
 const signed=version=>{const payload=JSON.stringify(release(version));return{keyId:'fixture',payload,signature:sign(null,Buffer.from(payload),pair.privateKey).toString('base64')};};
 const manifests={one:signed(1),two:signed(2)};return{roots:{fixture:Buffer.from(pair.publicKey.export({format:'jwk'}).x,'base64url').toString('base64')},manifests,bytes};}
const{browserFixture}=require('./browserFixture.cjs');
async function fixture(t){return browserFixture(t,async data=>{const api=globalThis.LP2;const trust=api.createWebTrust(data.roots);const store=await api.openWebReleaseStorage(trust);const context={platform:'web',company:'alpha',user:'alice',host:4,runtime:'fixture-web',compatibleApis:['1.0.0'],modules:['qr','help'],capabilities:{},contracts:{},moduleContracts:{qr:['1.0.0'],help:['1.0.0']}};
   globalThis.f={...data,api,trust,store,context,ports:{storage:store,trust,checkpoint(){},withDataActivation:async work=>work(),createAttemptId:()=>crypto.randomUUID(),download:async key=>Uint8Array.from(atob(data.bytes[key]),c=>c.charCodeAt(0)),prepareData:async()=> 'data-fixture'},async install(which){return api.stageAndActivate(data.manifests[which],context,this.ports);},async verify(){const active=await store.current('alpha','alice');await api.verifyRelease(active.signed,context,trust);for(const file of api.artifactFiles(active.release)){const bytes=await store.cachedFile('alpha','alice',file);if(!bytes||await trust.sha256(bytes)!==file.digest)throw Error('Bad cache');}return active;}};
  },protocol());}
test('actual Chromium IDB persists complete signed tenant caches and health checkpoint across browser restart',async t=>{
 const f=await fixture(t);let page=await f.open();const first=await page.evaluate(async()=>{const f=globalThis.f;const a=await f.install('one');if(await f.store.lastGood('alpha','alice')!==null)throw Error('Implicit LKG');await f.store.confirmHealthy(a);return a;});
 await f.close();page=await f.open();const saved=await page.evaluate(async()=>{const f=globalThis.f;return{active:await f.verify(),good:await f.store.lastGood('alpha','alice'),other:await f.store.current('beta','bob'),leak:await f.store.cachedFile('beta','bob',JSON.parse(f.manifests.one.payload).artifacts[0])};});assert.deepEqual(saved.active,first);assert.deepEqual(saved.good,first);assert.equal(saved.other,null);assert.equal(saved.leak,null);
 await page.evaluate(async()=>{const f=globalThis.f;const next=await f.install('two');if((await f.store.lastGood('alpha','alice')).release.id!=='set-1')throw Error('Candidate replaced LKG');await f.verify();if(next.release.id!=='set-2')throw Error('Wrong candidate');});
});
test('real IDB CAS/partial staging aborts retain active pointers and confirmed LKG',async t=>{
 const f=await fixture(t),page=await f.open();const state=await page.evaluate(async()=>{const f=globalThis.f;const first=await f.install('one');await f.store.confirmHealthy(first);const before=await f.store.current('alpha','alice');let rejected=0;
  const corrupt={...f.ports,storage:{...f.store,cachedFile:async()=>null},download:async key=>key===JSON.parse(f.manifests.two.payload).artifacts[0].path?new Uint8Array([0]):f.ports.download(key)};
  try{await f.api.stageAndActivate(f.manifests.two,f.context,corrupt);}catch{rejected++;}
  const candidate={...first,release:JSON.parse(f.manifests.two.payload),signed:f.manifests.two};const ns=`alpha/alice/set-2/${crypto.randomUUID()}`;
  try{await f.store.commit(first,candidate,ns);}catch{rejected++;}
  for(const file of f.api.artifactFiles(candidate.release))await f.store.stage(ns,file,await f.ports.download(file.path));
  try{await f.store.commit(null,candidate,ns);}catch{rejected++;}await f.store.discard(ns);
  try{await f.store.current('../other','alice');}catch{rejected++;}
  try{await f.api.openWebReleaseStorage(f.trust,null);}catch{rejected++;}
  const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='blobs'){IDBObjectStore.prototype.put=original;throw new DOMException('Fixture quota full','QuotaExceededError');}return original.apply(this,args);};
  try{await f.install('two');}catch(error){if(error.name!=='QuotaExceededError')throw error;rejected++;}
  if((await f.store.current('alpha','alice')).release.id!=='set-1')throw Error('Quota failure changed pointer');
  const second=await f.install('two');try{await f.store.confirmHealthy(first);}catch{rejected++;}
  return{rejected,before,active:await f.verify(),good:await f.store.lastGood('alpha','alice'),second};
 });assert.equal(state.rejected,7);assert.equal(state.before.release.id,'set-1');assert.deepEqual(state.active,state.second);assert.equal(state.good.release.id,'set-1');
});
test('owned browser crash DURING a multi-store write aborts candidate blobs/pointer and retains confirmed LKG',async t=>{
 const f=await fixture(t);let page=await f.open();await page.evaluate(async()=>{const f=globalThis.f;await f.store.confirmHealthy(await f.install('one'));});
 const session=await page.context().newCDPSession(page);let hit=false;
 await page.exposeBinding('crashAtBlob',async()=>{hit=true;await session.send('Browser.crash').catch(()=>{});});
 await page.evaluate(async()=>{
  const original=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);if(this.name==='blobs'){
    // Interrupt after an actual candidate blob write was scheduled, before the pointer can be written.
    IDBObjectStore.prototype.put=original;void globalThis.crashAtBlob();const until=Date.now()+10000;while(Date.now()<until){};
  }return request;};
  await globalThis.f.install('two');
 }).catch(()=>{});
 assert.equal(hit,true);await f.close().catch(()=>{});
 page=await f.open();const state=await page.evaluate(async()=>({active:await globalThis.f.verify(),good:await globalThis.f.store.lastGood('alpha','alice')}));
 assert.equal(state.active.release.id,'set-1');assert.equal(state.good.release.id,'set-1');
});
