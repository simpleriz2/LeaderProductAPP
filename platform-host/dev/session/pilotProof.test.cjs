const{test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
if(!process.env.LP2_API_PILOT_ROOT)throw Error('Explicit local API fork path LP2_API_PILOT_ROOT required');
const{startPilot}=require(path.join(process.env.LP2_API_PILOT_ROOT,'dev/platform-pilot/pilot.cjs'));const{createWebTrust}=require('../../adapters/trust.web.ts');const{createVerifiedSessionStore}=require('../../core/offlineSession.ts');const{SessionCoordinator}=require('../../core/sessionCoordinator.ts');
test('real Central proof confirms individual rights, restores offline, then removes revoked module on reconnect',async t=>{
 const pilot=await startPilot();t.after(()=>pilot.close());const trust=createWebTrust({'pilot-key':Buffer.from(pilot.publicKey.export({format:'jwk'}).x,'base64url').toString('base64')});let raw=null;
 const store=createVerifiedSessionStore(trust,{read:async()=>raw,write:async value=>{raw=value;},clear:async()=>{raw=null;}}),events=[];
 const modules=['qr','help'].map(id=>({id,requiresOnline:false,async init(lease){events.push(`${lease.session.user}:${id}:${lease.online}`);},async activate(){},async suspend(){},async dispose(){}}));const preparation={async prepare(lease){lease.assertCurrent();}},coordinator=new SessionCoordinator(store,modules,preparation);
 const login=async user=>(await fetch(`${pilot.central.url}/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user,password:'fixture-only'})})).json();
 const discovery=async token=>{const response=await fetch(`${pilot.central.url}/discovery`,{headers:{authorization:`Bearer ${token}`}});assert.equal(response.status,200);return response.json();};
 const {token}=await login('alice');let data=await discovery(token);await coordinator.confirm(await store.acceptOnlineGrant(data.offlineGrant));await coordinator.activate('help');
 const offline=new SessionCoordinator(store,modules,preparation);await offline.restoreOffline();await offline.activate('help');assert.equal(events.at(-1),'alice:help:false');
 pilot.setModules('alice',['qr']);data=await discovery(token);await offline.confirm(await store.acceptOnlineGrant(data.offlineGrant));await assert.rejects(offline.activate('help'),/not entitled/);assert.deepEqual(offline.currentLease().session.modules,['qr']);
 const carol=await login('carol');await offline.confirm(await store.acceptOnlineGrant((await discovery(carol.token)).offlineGrant));await offline.goOffline();assert.equal(offline.currentLease().session.user,'carol');await assert.rejects(offline.activate('help'),/not entitled/);
 const restarted=new SessionCoordinator(store,modules,preparation);await restarted.restoreOffline();assert.equal(restarted.currentLease().session.user,'carol');
 const saved=JSON.parse(raw);saved.payload=saved.payload.replace('carol','alice');raw=JSON.stringify(saved);await assert.rejects(new SessionCoordinator(store,modules,preparation).restoreOffline(),/Untrusted offline proof/);
 await offline.logout();assert.equal(raw,null);
});
