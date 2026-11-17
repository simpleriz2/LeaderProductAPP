import {createVerifiedSessionStore,verifyOfflineSession} from '../core/offlineSession.ts';
import {snapshotConfirmedSession} from '../core/confirmedSession.ts';
import type {SignedOfflineSession} from '../core/offlineSession';
import type {ConfirmedSession,SessionCoordinator} from '../core/sessionCoordinator';
import type {Trust} from '../core/releaseSet';
type RecordState={version:1;revision:number;proof:string|null};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
/** Signed rights only, NOT credentials. Locks order: session authority -> account data activation/access. */
export async function openWebSessionStore(trust:Trust,factory:IDBFactory=globalThis.indexedDB,locks:LockManager=globalThis.navigator?.locks){
  if(!factory||!locks)throw Error('Offline rights storage/authority locks unavailable');
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open('lp2-session-proof-v1',1);let blocked=false;request.onupgradeneeded=()=>request.result.createObjectStore('session');request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};request.onerror=()=>reject(request.error);request.onblocked=()=>{blocked=true;reject(Error('Session database blocked'));};});
  db.onversionchange=()=>db.close();
  let closed=false,localTicket=0,expectedRevision:number|null=null,ownedRevision:number|null=null;
  const listeners=new Set<()=>void>();const channel=new BroadcastChannel('lp2-session-authority-v1');
  channel.onmessage=event=>{if(event.data?.type==='changed')for(const listener of listeners)listener();};
  async function lock<T>(mode:LockMode,work:()=>Promise<T>,signal?:AbortSignal):Promise<T>{
    if(closed)throw Error('Session store closed');return locks.request('lp2-session-authority-v1',{mode,...(signal?{signal}:{})},async()=>{if(closed||signal?.aborted)throw Error('Session authority invalidated');return work();});
  }
  function decode(value:unknown):RecordState{
    // Preserve the earlier local signed-proof format; first durable change adds a monotonic revision.
    if(value===undefined)return{version:1,revision:0,proof:null};
    if(typeof value==='string')return{version:1,revision:0,proof:value};
    const state=value as RecordState;
    if(!state||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<1||(state.proof!==null&&typeof state.proof!=='string'))throw Error('Corrupt session authority record');return state;
  }
  async function operation<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore,done:(value:T)=>void,fail:(error:unknown)=>void)=>void):Promise<T>{
    return new Promise((resolve,reject)=>{let value:T,failure:unknown;const tx=db.transaction('session',mode,{durability:'strict'});tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure||tx.error||Error('Session transaction aborted'));tx.onerror=()=>{};
      const fail=(error:unknown)=>{failure=error;tx.abort();};
      if(mode==='readwrite'&&tx.durability!=='strict'){fail(Error('Strict session durability unavailable'));return;}
      try{work(tx.objectStore('session'),next=>{value=next;},fail);}catch(error){fail(error);}
    });
  }
  const read=()=>operation<RecordState>('readonly',(store,done,fail)=>{const query=store.get('last');query.onsuccess=()=>{try{done(decode(query.result));}catch(error){fail(error);}};});
  async function write(proof:string|null,expected:number|null){
    const revision=await operation<number>('readwrite',(store,done,fail)=>{const request=store.get('last');request.onsuccess=()=>{
      try{const previous=decode(request.result);if(expected!==null&&previous.revision!==expected)throw Error('Concurrent session confirmation');if(previous.revision>=Number.MAX_SAFE_INTEGER)throw Error('Session revision exhausted');store.put({version:1,revision:previous.revision+1,proof},'last');done(previous.revision+1);}catch(error){fail(error);}
    };});channel.postMessage({type:'changed'});return revision;
  }
  const verified=createVerifiedSessionStore(trust,{
    read:()=>lock('shared',async()=>(await read()).proof),
    write:value=>{const expected=expectedRevision,ticket=localTicket;expectedRevision=null;if(expected===null)throw Error('Online confirmation ticket required');return lock('exclusive',async()=>{if(ticket!==localTicket)throw Error('Superseded session ticket');ownedRevision=await write(value,expected);});},
    clear:()=>{expectedRevision=null;localTicket++;const owned=ownedRevision;ownedRevision=null;return lock('exclusive',async()=>{if(owned!==null&&(await read()).revision===owned)await write(null,owned);});},
  });
  return{
    /** Coordinator restoration claims this exact revision; UI/broadcast inspection must use peekLastConfirmed. */
    loadLastConfirmed:()=>lock('shared',async()=>{const current=await read();if(current.proof===null){ownedRevision=null;return null;}const session=(await verifyOfflineSession(JSON.parse(current.proof),trust)).session;ownedRevision=current.revision;return session;}),
    peekLastConfirmed:()=>lock('shared',async()=>{const current=await read();return current.proof===null?null:(await verifyOfflineSession(JSON.parse(current.proof),trust)).session;}),
    saveConfirmed:(session:ConfirmedSession)=>verified.saveConfirmed(session),clearSession:()=>verified.clearSession(),
    /** Capture BEFORE the Central request, so a late refresh cannot overwrite another tab's login/logout. */
    async beginOnlineConfirmation(){
      const ticket=++localTicket;expectedRevision=null;const previous=await lock('shared',read);
      return{async acceptOnlineGrant(signed:SignedOfflineSession){if(ticket!==localTicket)throw Error('Superseded session ticket');const session=await verified.acceptOnlineGrant(signed);if(ticket!==localTicket)throw Error('Superseded session ticket');expectedRevision=previous.revision;return session;}};
    },
    /** Hold across protected data/HTTP/outbox work. No stale tab can start work after durable rights replacement. */
    async run<T>(session:ConfirmedSession,signal:AbortSignal,work:()=>Promise<T>):Promise<T>{
      const expected=snapshotConfirmedSession(session);
      return lock('shared',async()=>{const current=await read();if(current.proof===null)throw Error('Session authority changed');const actual=(await verifyOfflineSession(JSON.parse(current.proof),trust)).session;if(!same(actual,expected))throw Error('Session authority changed');if(signal.aborted)throw Error('Session authority invalidated');const result=await work();if(signal.aborted)throw Error('Session authority invalidated');return result;},signal);
    },
    subscribeExternalChange(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
    close(){closed=true;localTicket++;listeners.clear();channel.close();db.close();},
  };
}
/** Auth/host binding; coordinator owns resource teardown, never clears another tab's new saved proof. */
export function bindWebSessionInvalidation(store:Awaited<ReturnType<typeof openWebSessionStore>>,coordinator:SessionCoordinator,onInvalidated:(error?:unknown)=>void){
  let disposed=false;
  const unsubscribe=store.subscribeExternalChange(()=>{void(async()=>{
    if(disposed)return;let lease;try{lease=coordinator.currentLease();}catch{return;}
    let current:ConfirmedSession|null=null,error:unknown;try{current=await store.peekLastConfirmed();}catch(failure){error=failure;}
    try{lease.assertCurrent();}catch{return;}
    if(disposed||(!error&&same(current,lease.session)))return;
    const stopping=coordinator.invalidateExternalSession();onInvalidated(error);
    try{await stopping;}catch(failure){onInvalidated(failure);}
  })().catch(error=>onInvalidated(error));});
  return()=>{disposed=true;unsubscribe();};
}

/** Use on individual bounded IO entrypoints; do not nest this gate around an already guarded operation. */
export function createWebSessionAuthority(store:Awaited<ReturnType<typeof openWebSessionStore>>):import('../core/sessionAuthority').SessionAuthority{
  return{run:(lease,work)=>{lease.assertCurrent();return store.run(lease.session,lease.signal,async()=>{lease.assertCurrent();const result=await work();lease.assertCurrent();return result;});}};
}
