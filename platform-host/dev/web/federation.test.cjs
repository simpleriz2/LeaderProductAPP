const{test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const{generateKeyPairSync,sign}=require('node:crypto');
const root=path.resolve(__dirname,'../..');
function protocol(){
 const pair=generateKeyPairSync('ed25519'),bytes={};
 const release=version=>({format:2,platform:'web',company:'alpha',id:`web-${version}`,minHost:1,runtime:'web-test',api:'1.0.0',artifacts:['qr','help'].map(module=>{
  const artifact=require('../../scripts/packWebRemote.cjs').packageWebRemote(module,module==='qr'?`${version}.0.0`:'1.0.0');
  bytes[artifact.path]=fs.readFileSync(path.join(root,'build/immutable-web',artifact.path)).toString('base64');return artifact;
 })});
 const signed=version=>{const payload=JSON.stringify(release(version));return{keyId:'test',payload,signature:sign(null,Buffer.from(payload),pair.privateKey).toString('base64')};};
 return{manifests:{one:signed(1),two:signed(2)},bytes,roots:{test:Buffer.from(pair.publicKey.export({format:'jwk'}).x,'base64url').toString('base64')}};
}
const data=protocol();const{browserFixture}=require('./browserFixture.cjs');
async function fixture(t){return browserFixture(t,async data=>{
 const api=globalThis.LP2,trust=api.createWebTrust(data.roots),store=await api.openWebReleaseStorage(trust);
 const context={company:'alpha',user:'alice',platform:'web',host:1,runtime:'web-test',compatibleApis:['1.0.0'],modules:['qr','help'],capabilities:{},contracts:{},moduleContracts:{qr:['1.0.0'],help:['1.0.0']}};
 let online=true;const ports={trust,storage:store,checkpoint(){},withDataActivation:async work=>work(),createAttemptId:()=>crypto.randomUUID(),prepareData:async()=> 'stateless',download:async key=>{if(!online)throw Error('Offline download');return Uint8Array.from(atob(data.bytes[key]),c=>c.charCodeAt(0));}};
 globalThis.f={api,trust,store,context,ports,data,offline(){online=false;},async install(which){return api.stageAndActivate(data.manifests[which],context,ports);},async execute(){
  const a=await store.current('alpha','alice');this.loader=await api.openVerifiedWebFederation(a,context,ports,async()=>{});
  const screens=await Promise.all(['qr','help'].map(module=>this.loader.screen(module)));const mount=document.createElement('div');document.body.append(mount);this.reactRoot=api.createRoot(mount);this.reactRoot.render(api.React.createElement(api.React.Fragment,null,...screens.map((Screen,i)=>api.React.createElement(Screen,{key:i}))));return a.release.id;
 }};
 },data);}
test('actual signed Rspack QR+Help containers render through MF; offline restart, one-remote update and code LKG preserve data reference',async t=>{
 const f=await fixture(t);let page=await f.open();await page.evaluate(async()=>{await globalThis.f.install('one');await globalThis.f.execute();});
 await page.getByText('QR delivery probe 1.0.0',{exact:true}).waitFor();await page.getByText('Help delivery probe 1.0.0',{exact:true}).waitFor();
 await page.evaluate(async()=>{const f=globalThis.f;await f.store.confirmHealthy(await f.store.current('alpha','alice'));});
 await f.close();page=await f.open();await page.evaluate(async()=>{globalThis.f.offline();await globalThis.f.execute();});await page.getByText('QR delivery probe 1.0.0',{exact:true}).waitFor();
 await f.close();page=await f.open();await page.evaluate(async()=>{await globalThis.f.install('two');await globalThis.f.execute();});await page.getByText('QR delivery probe 2.0.0',{exact:true}).waitFor();await page.getByText('Help delivery probe 1.0.0',{exact:true}).waitFor();
 const result=await page.evaluate(async()=>{const f=globalThis.f;const previous=await f.store.lastGood('alpha','alice');const lease={session:{company:'alpha',user:'alice',modules:['qr','help']},online:false,assertCurrent(){}};return f.api.recoverLastHealthy(lease,f.context,{...f.ports,assignedRelease:async()=>{throw Error('Offline');},verifyData:async()=>{}},previous);});assert.equal(result.activation.release.id,'web-1');assert.equal(result.activation.dataGeneration,'stateless');assert.equal(result.restartRequired,true);
 await f.close();page=await f.open();await page.evaluate(async()=>{globalThis.f.offline();await globalThis.f.execute();});await page.getByText('QR delivery probe 1.0.0',{exact:true}).waitFor();
});
test('damaged snapshot and stale lease execute nothing; started set cannot hot replace',async t=>{
 const f=await fixture(t),page=await f.open();const result=await page.evaluate(async()=>{const f=globalThis.f,activation=await f.install('one');let denied=0;
 const run=ports=>f.api.openVerifiedWebFederation(activation,f.context,ports,async()=>{});
 try{await run({...f.ports,storage:{...f.store,cachedFile:async()=>new Uint8Array([1])}});}catch{denied++;}
 try{await run({...f.ports,checkpoint(){throw Error('Session revoked');}});}catch{denied++;}
 const executedBefore=typeof globalThis.lp2_qr;await f.execute();
 try{await f.execute();}catch{denied++;}
 try{await f.loader.screen('stock');}catch{denied++;}
 f.loader.dispose();try{await f.loader.screen('qr');}catch{denied++;}
 return{denied,executedBefore};
 });assert.equal(result.denied,5);assert.equal(result.executedBefore,'undefined');
});
