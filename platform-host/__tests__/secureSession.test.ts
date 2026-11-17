import {createSecureSessionStore} from '../adapters/secureSession.native';
import {createWebTrust} from '../adapters/trust.web';
import {generateKeyPairSync,sign,webcrypto} from 'node:crypto';
const session={company:'alpha',user:'alice',modules:['qr'],confirmation:'central-1'};
const pair=generateKeyPairSync('ed25519'),root=Buffer.from(pair.publicKey.export({format:'jwk'}).x!,'base64url').toString('base64');
const trust=createWebTrust({root},webcrypto.subtle as unknown as SubtleCrypto);
const grant=(value:unknown=session,purpose='lp2-offline-session')=>{const payload=JSON.stringify({format:1,purpose,issuedAt:Date.now(),session:value});return{keyId:'root',payload,signature:sign(null,Buffer.from(payload),pair.privateKey).toString('base64')};};
test('persists ONLY a matching signed Central grant inside native encryption',async()=>{
 const signed=grant(),bridge={readSession:jest.fn(async()=>JSON.stringify(signed)),writeSession:jest.fn(async(_value:string)=>{}),clearSession:jest.fn(async()=>{})},store=createSecureSessionStore(trust,bridge);
 expect(await store.loadLastConfirmed()).toEqual(session);await expect(store.saveConfirmed(session)).rejects.toThrow('matching online');
 expect(await store.acceptOnlineGrant(signed)).toEqual(session);await store.saveConfirmed(session);expect(JSON.parse(bridge.writeSession.mock.calls[0][0])).toEqual(signed);
 await store.clearSession();await expect(store.saveConfirmed(session)).rejects.toThrow('matching online');expect(bridge.clearSession).toHaveBeenCalledTimes(1);
});
test('secure read/write failure propagates without plaintext fallback or data clearing',async()=>{
 const bridge={readSession:jest.fn(async()=>{throw Error('Keystore unavailable');}),writeSession:jest.fn(async()=>{throw Error('Disk error');}),clearSession:jest.fn(async()=>{})},store=createSecureSessionStore(trust,bridge);
 await expect(store.loadLastConfirmed()).rejects.toThrow('Keystore unavailable');await store.acceptOnlineGrant(grant());await expect(store.saveConfirmed(session)).rejects.toThrow('Disk error');expect(bridge.clearSession).not.toHaveBeenCalled();
});
test('unsigned/tampered/wrong-purpose or malformed scoped rights cannot restore or be saved',async()=>{
 let raw=JSON.stringify(session);const bridge={readSession:async()=>raw,writeSession:jest.fn(async()=>{}),clearSession:async()=>{}},store=createSecureSessionStore(trust,bridge);
 await expect(store.loadLastConfirmed()).rejects.toThrow('envelope');
 const signed=grant();raw=JSON.stringify({...signed,payload:signed.payload.replace('alice','carol')});await expect(store.loadLastConfirmed()).rejects.toThrow('Untrusted');
 await expect(store.acceptOnlineGrant(grant(session,'release'))).rejects.toThrow('purpose');
 await expect(store.acceptOnlineGrant(grant({...session,company:'../beta'}))).rejects.toThrow('Invalid confirmed');
 await expect(store.acceptOnlineGrant(grant({...session,modules:['qr','qr']}))).rejects.toThrow('Invalid confirmed');
 await store.acceptOnlineGrant(signed);await expect(store.saveConfirmed({...session,user:'carol'})).rejects.toThrow('matching online');expect(bridge.writeSession).not.toHaveBeenCalled();
});
test('logout during pending signature verification cannot resurrect an accepted online proof',async()=>{
 let release!:()=>void;const blocked=new Promise<void>(resolve=>{release=resolve;});
 const delayed={...trust,verifyEd25519:async(...args:Parameters<typeof trust.verifyEd25519>)=>{await blocked;return trust.verifyEd25519(...args);}};
 const store=createSecureSessionStore(delayed,{readSession:async()=>null,writeSession:async()=>{},clearSession:async()=>{}});
 const pending=store.acceptOnlineGrant(grant());await store.clearSession();release();await expect(pending).rejects.toThrow('Superseded');await expect(store.saveConfirmed(session)).rejects.toThrow('matching online');
});
test('native host ticket captures before request; late acceptance after newer login/logout cannot be persisted',async()=>{
 const{createNativeHostSessionStore}=require('../adapters/hostSession.native');let raw:string|null=null;const store=createNativeHostSessionStore(createSecureSessionStore(trust,{readSession:async()=>raw,writeSession:async value=>{raw=value;},clearSession:async()=>{raw=null;}}));
 const old=await store.beginOnlineConfirmation(),current=await store.beginOnlineConfirmation();await expect(old.acceptOnlineGrant(grant())).rejects.toThrow('Superseded');await store.saveConfirmed(await current.acceptOnlineGrant(grant()));expect(await store.peekLastConfirmed()).toEqual(session);
 const stale=await store.beginOnlineConfirmation();await store.clearSession();await expect(stale.acceptOnlineGrant(grant())).rejects.toThrow('Superseded');expect(await store.loadLastConfirmed()).toBeNull();await expect(store.saveConfirmed(session)).rejects.toThrow('ticket');
});
test('native host serializes an in-flight proof write before logout and keeps business data outside credential cleanup',async()=>{
 const{createNativeHostSessionStore}=require('../adapters/hostSession.native');let raw:string|null=null,release!:()=>void,entered!:()=>void;const starting=new Promise<void>(resolve=>{entered=resolve;}),blocked=new Promise<void>(resolve=>{release=resolve;});const store=createNativeHostSessionStore(createSecureSessionStore(trust,{readSession:async()=>raw,writeSession:async value=>{entered();await blocked;raw=value;},clearSession:async()=>{raw=null;}}));
 const ticket=await store.beginOnlineConfirmation(),confirmed=await ticket.acceptOnlineGrant(grant());const saving=store.saveConfirmed(confirmed);await starting;const clearing=store.clearSession();release();await expect(saving).rejects.toThrow('Superseded');await clearing;expect(raw).toBeNull();store.close();await expect(store.peekLastConfirmed()).rejects.toThrow('closed');
});
