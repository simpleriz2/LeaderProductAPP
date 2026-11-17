const{test}=require('node:test');const assert=require('node:assert/strict');const{generateKeyPairSync,sign}=require('node:crypto');const{browserFixture}=require('./browserFixture.cjs');
function protocol(){const pair=generateKeyPairSync('ed25519');const grant=(user,modules)=>{const payload=JSON.stringify({format:1,purpose:'lp2-offline-session',issuedAt:0,session:{company:'alpha',user,modules,confirmation:`confirmed-${user}`}});return{keyId:'root',payload,signature:sign(null,Buffer.from(payload),pair.privateKey).toString('base64')};};return{roots:{root:Buffer.from(pair.publicKey.export({format:'jwk'}).x,'base64url').toString('base64')},alice:grant('alice',['qr','help']),carol:grant('carol',['qr'])};}
async function fixture(t){return browserFixture(t,async data=>{
 const api=globalThis.LP2,trust=api.createWebTrust(data.roots),store=await api.openWebSessionStore(trust);const starts=[];
 const modules=['qr','help'].map(id=>({id,requiresOnline:false,async init(lease){lease.assertCurrent();starts.push(`${lease.session.user}:${id}:${lease.online}`);},async activate(){},async suspend(){},async dispose(){}}));
 const coordinator=new api.SessionCoordinator(store,modules,{async prepare(lease){lease.assertCurrent();}});
 globalThis.s={api,data,store,coordinator,starts,async confirm(user){await coordinator.confirm(await store.acceptOnlineGrant(data[user]));}};
 },protocol());}
test('actual browser persists only signed last-user rights; offline restore cannot activate another user or unauthorized module',async t=>{
 const f=await fixture(t);let page=await f.open();await page.evaluate(async()=>{const s=globalThis.s;await s.confirm('alice');await s.coordinator.activate('help');await s.confirm('carol');});
 await f.close();page=await f.open();const result=await page.evaluate(async()=>{const s=globalThis.s;await s.coordinator.restoreOffline();await s.coordinator.activate('qr');let denied=0;try{await s.coordinator.activate('help');}catch{denied++;}try{await s.store.saveConfirmed({...s.coordinator.currentLease().session,user:'alice'});}catch{denied++;}return{session:s.coordinator.currentLease().session,starts:s.starts,denied};});assert.equal(result.session.user,'carol');assert.deepEqual(result.starts,['carol:qr:false']);assert.equal(result.denied,2);
});
test('tampered signed browser rights fail restoration; logout deletes proof while subject draft remains',async t=>{
 const f=await fixture(t),page=await f.open();const result=await page.evaluate(async()=>{const s=globalThis.s;await s.confirm('alice');
 const driver=s.api.createIndexedDbDriver(),scope={company:'alpha',user:'alice',generation:'data-1'};await driver.fork(null,scope);await driver.write(scope,{module:'orders',expectedSchema:0,targetSchema:1,changes:[{collection:'drafts',id:'pending',expectedRevision:null,payload:'{"text":"unsent"}'}]});
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('lp2-session-proof-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const invalid={...s.data.alice,payload:s.data.alice.payload.replace('alice','carol')};await new Promise((resolve,reject)=>{const tx=db.transaction('session','readwrite',{durability:'strict'});tx.objectStore('session').put(JSON.stringify(invalid),'last');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});db.close();
 let denied=false;try{await s.store.loadLastConfirmed();}catch(error){denied=error.message.includes('Untrusted');}
 await s.coordinator.logout();const saved=await s.store.loadLastConfirmed(),draft=await driver.read(scope,'orders',1,'drafts','pending');await driver.close(scope);return{denied,saved,draft};
 });assert.equal(result.denied,true);assert.equal(result.saved,null);assert.equal(JSON.parse(result.draft.payload).text,'unsent');
});
