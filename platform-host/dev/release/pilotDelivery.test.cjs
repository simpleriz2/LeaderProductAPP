/** Cross-fork local acceptance: real Re.Pack -> Central-signed HTTP -> verified disk activation. */
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {randomUUID}=require('node:crypto');
if(!process.env.LP2_API_PILOT_ROOT)throw Error('Explicit local API fork path LP2_API_PILOT_ROOT required');
const {startPilot}=require(path.join(process.env.LP2_API_PILOT_ROOT,'dev/platform-pilot/pilot.cjs'));
const {packageRemote}=require('../../scripts/packRemote.cjs');const {stageAndActivate,verifyRelease,artifactFiles}=require('../../core/releaseSet.ts');
const {ServiceRouter}=require('../../core/serviceRouter.ts');const {artifactDownloader}=require('../../core/artifactDownload.ts');const {createWebArtifactTransport}=require('../../adapters/artifacts.web.ts');const {createWebTrust}=require('../../adapters/trust.web.ts');
const {openDiskStore}=require('../recovery/diskStore.cjs');const {prepareForUser}=require('../recovery/dataGenerations.cjs');const runtime=require('../../host.runtime.json').android.runtime;
async function json(url,token,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal(r.status,200);return r.json();}
function assignment(company,id,artifacts){const release={format:2,platform:'android',company,id,minHost:1,runtime,api:'1.0.0',artifacts};const files=new Map(artifactFiles(release).map(f=>[f.path,fs.readFileSync(path.join(__dirname,'../../build/immutable',f.path))]));return{release,files};}
test('compiled module closures cross protected HTTP, remain tenant-scoped, reuse unchanged bytes and survive online revoke',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lp2-http-remotes-'));const store=openDiskStore(root);
  t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
  const qr1=packageRemote('qr','1.0.0'),help1=packageRemote('help','1.0.0'),qr2=packageRemote('qr','2.0.0');
  const alpha=assignment('alpha','alpha-real-1',[qr1,help1]), beta=assignment('beta','beta-real-2',[qr2]);
  const pilot=await startPilot({releases:[alpha,beta]});t.after(()=>pilot.close());
  const rawKey=Buffer.from(pilot.publicKey.export({format:'jwk'}).x,'base64url').toString('base64');const trust=createWebTrust({'pilot-key':rawKey});
  const sessions={};for(const user of ['alice','bob']) sessions[user]=(await json(`${pilot.central.url}/login`,null,{user,password:'fixture-only'})).token;
  async function prepare(user){
    const discovery=await json(`${pilot.central.url}/discovery`,sessions[user]);const scoped=await json(`${pilot.central.url}/tokens`,sessions[user],{audience:'artifacts'});
    const lease={session:{company:discovery.company,user,modules:discovery.modules,confirmation:'http-pilot'},online:true,signal:new AbortController().signal,assertCurrent(){}};
    const router=new ServiceRouter(lease,{assignment:async()=>({kind:'artifacts',company:discovery.company,audience:'artifacts',endpoint:discovery.artifactApi}),restrictedToken:async()=>({...scoped,value:scoped.token}),send:createWebArtifactTransport()},[pilot.artifactServer.url]);
    const context={platform:'android',company:discovery.company,user,modules:discovery.modules,host:1,runtime,compatibleApis:['1.0.0'],capabilities:{},contracts:{},moduleContracts:{qr:['1.0.0'],help:['1.0.0']}};
    return {signed:discovery.release,context,ports:{storage:store,trust,checkpoint:()=>{},withDataActivation:async work=>work(),createAttemptId:randomUUID,download:artifactDownloader(router),prepareData:(release,previous)=>prepareForUser(root,user,release,previous)}};
  }
  const first=await prepare('alice');let before=pilot.introspections();const activeAlpha=await stageAndActivate(first.signed,first.context,first.ports);await store.confirmHealthy(activeAlpha);
  assert.equal(pilot.introspections()-before,artifactFiles(alpha.release).length);store.readVerifiedBytes(activeAlpha);
  const second=await prepare('bob');const activeBeta=await stageAndActivate(second.signed,second.context,second.ports);store.readVerifiedBytes(activeBeta);
  assert.notEqual(store.blobFile('alpha','alice',qr1.digest),store.blobFile('beta','bob',qr1.digest));
  const alpha2=assignment('alpha','alpha-real-2',[qr2,help1]);pilot.assignRelease(alpha2.release,alpha2.files);
  const update=await prepare('alice');const downloaded=[];const original=update.ports.download;update.ports.download=async key=>{downloaded.push(key);return original(key);};
  const next=await stageAndActivate(update.signed,update.context,update.ports);assert.equal(next.release.id,'alpha-real-2');assert.ok(downloaded.length>0);
  const helpKeys=new Set(artifactFiles({artifacts:[help1]}).map(f=>f.path));assert.ok(downloaded.every(key=>!helpKeys.has(key)));assert.equal((await store.lastGood('alpha','alice')).release.id,'alpha-real-1');
  const beta1=assignment('beta','beta-real-1',[qr1]);pilot.assignRelease(beta1.release,beta1.files);
  const interrupted=await prepare('bob');const download=interrupted.ports.download;let fetched=0;
  interrupted.ports.download=async key=>{const bytes=await download(key);if(++fetched===1)pilot.revoke('bob');return bytes;};
  await assert.rejects(stageAndActivate(interrupted.signed,interrupted.context,interrupted.ports),/Artifact unavailable/);
  assert.equal((await store.current('beta','bob')).release.id,'beta-real-2');
  await pilot.stopCentral();
  await verifyRelease(activeBeta.signed,second.context,trust);store.readVerifiedBytes(activeBeta);
});
