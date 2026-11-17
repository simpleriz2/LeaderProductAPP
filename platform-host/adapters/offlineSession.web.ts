import {createVerifiedSessionStore} from '../core/offlineSession.ts';
import type {Trust} from '../core/releaseSet';
/** Saved signed rights only, NOT credentials. Browser origin scripts share trust; no encryption claim. */
export async function openWebSessionStore(trust:Trust,factory:IDBFactory=globalThis.indexedDB){
  if(!factory)throw Error('Offline rights storage unavailable');
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open('lp2-session-proof-v1',1);let blocked=false;request.onupgradeneeded=()=>request.result.createObjectStore('session');request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};request.onerror=()=>reject(request.error);request.onblocked=()=>{blocked=true;reject(Error('Session database blocked'));};});
  db.onversionchange=()=>db.close();
  async function operation<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,done:(value:T)=>void)=>void):Promise<T>{
    return new Promise((resolve,reject)=>{let value:T;const tx=db.transaction('session',mode,{durability:'strict'});tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error||Error('Session transaction aborted'));tx.onerror=()=>{};
      if(mode==='readwrite'&&tx.durability!=='strict'){tx.abort();return;}try{work(tx.objectStore('session'),next=>{value=next;});}catch(error){tx.abort();reject(error);}
    });
  }
  return{...createVerifiedSessionStore(trust,{
    read:()=>operation<string|null>('readonly',(store,done)=>{const query=store.get('last');query.onsuccess=()=>done(query.result===undefined?null:query.result);}),
    write:value=>operation<void>('readwrite',(store,done)=>{store.put(value,'last');done();}),
    clear:()=>operation<void>('readwrite',(store,done)=>{store.delete('last');done();}),
  }),close(){db.close();}};
}
