import {artifactFiles} from '../core/releaseSet.ts';
import type {Activation,ArtifactFile,ReleaseStorage,Trust} from '../core/releaseSet';
const part=(value:string)=>{if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value))throw Error('Invalid namespace');return value;};
const digest=(value:string)=>{if(!/^[a-f0-9]{64}$/.test(value))throw Error('Invalid digest');return value;};
const nsParts=(value:string)=>{const parts=value.split('/');if(parts.length!==4)throw Error('Invalid staging namespace');parts.forEach(part);return parts;};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
type Pointer={current:Activation;lkg:Activation|null};
/** Independent bootstrap IDB. It never opens/migrates a business database or falls back to localStorage. */
export async function openWebReleaseStorage(trust:Pick<Trust,'sha256'>,factory:IDBFactory=globalThis.indexedDB):Promise<ReleaseStorage&{close():void}>{
  if(!factory)throw Error('IndexedDB unavailable');
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=factory.open('lp2-release-bootstrap-v2',1);
    request.onupgradeneeded=()=>{for(const name of ['blobs','staging','pointers'])request.result.createObjectStore(name);};
    let blocked=false;
    request.onsuccess=()=>{if(blocked)request.result.close();else resolve(request.result);};request.onerror=()=>reject(request.error);
    request.onblocked=()=>{blocked=true;reject(Error('Bootstrap database upgrade blocked'));};
  });
  db.onversionchange=()=>db.close();
  function transaction<T>(stores:string[],mode:IDBTransactionMode,work:(tx:IDBTransaction,result:(value:T)=>void,fail:(error:unknown)=>void)=>void):Promise<T>{
    return new Promise((resolve,reject)=>{
      let value:T;let failure:unknown;
      let tx:IDBTransaction;
      try{tx=mode==='readwrite'?db.transaction(stores,mode,{durability:'strict'}):db.transaction(stores,mode);}
      catch(error){reject(error);return;}
      const fail=(error:unknown)=>{failure=error;try{tx.abort();}catch{reject(error);}};
      tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure||tx.error||Error('Bootstrap transaction aborted'));tx.onerror=()=>{};
      if(mode==='readwrite'&&tx.durability!=='strict'){fail(Error('Strict IndexedDB durability unavailable'));return;}
      try{work(tx,next=>{value=next;},fail);}catch(error){fail(error);}
    });
  }
  const read=<T>(store:string,key:IDBValidKey):Promise<T|undefined>=>transaction([store],'readonly',(tx,result)=>{
    const request=tx.objectStore(store).get(key);request.onsuccess=()=>result(request.result as T|undefined);
  });
  const key=(company:string,user:string):IDBValidKey=>[part(company),part(user)];
  const cached=async(company:string,user:string,file:ArtifactFile)=>{
    const bytes=await read<Uint8Array>('blobs',[part(company),part(user),digest(file.digest)]);
    if(bytes===undefined)return null;
    if(!(bytes instanceof Uint8Array)||bytes.length!==file.size||await trust.sha256(bytes)!==file.digest)return null;
    return bytes;
  };
  return {
    current:async(company,user)=>(await read<Pointer>('pointers',key(company,user)))?.current||null,
    lastGood:async(company,user)=>(await read<Pointer>('pointers',key(company,user)))?.lkg||null,
    confirmHealthy:async expected=>{
      const snapshot=structuredClone(expected);
      await transaction<void>(['pointers'],'readwrite',(tx,done,fail)=>{
        const store=tx.objectStore('pointers');const request=store.get(key(snapshot.company,snapshot.user));
        request.onsuccess=()=>{try{if(!same(request.result?.current,snapshot)){fail(Error('Concurrent health confirmation'));return;}store.put({current:snapshot,lkg:snapshot},key(snapshot.company,snapshot.user));done();}catch(error){fail(error);}};
      });
    },
    cachedFile:cached,
    stage:async(namespace,file,input)=>{
      nsParts(namespace);digest(file.digest);const bytes=new Uint8Array(input);
      if(bytes.length>12*1024*1024||bytes.length!==file.size||await trust.sha256(bytes)!==file.digest)throw Error('Staged digest/size mismatch');
      await transaction<void>(['staging'],'readwrite',(tx,done)=>{tx.objectStore('staging').put(bytes,[namespace,file.digest]);done();});
    },
    discard:async namespace=>{
      nsParts(namespace);
      await transaction<void>(['staging'],'readwrite',(tx,done)=>{tx.objectStore('staging').delete(IDBKeyRange.bound([namespace,''],[namespace,'\uffff']));done();});
    },
    commit:async(expected,next,namespace)=>{
      const snapshot=structuredClone(next);const expectedSnapshot=structuredClone(expected);const parts=nsParts(namespace);
      if(!same(parts.slice(0,3),[snapshot.company,snapshot.user,snapshot.release.id])||snapshot.release.company!==snapshot.company)throw Error('Cross-namespace commit');
      part(snapshot.dataGeneration);
      const files=artifactFiles(snapshot.release);if(files.length>4096)throw Error('Inventory too large');
      const captured=await transaction<Map<string,Uint8Array>>(['staging'],'readonly',(tx,done)=>{
        const bytes=new Map<string,Uint8Array>();const store=tx.objectStore('staging');
        for(const file of files){const request=store.get([namespace,digest(file.digest)]);request.onsuccess=()=>bytes.set(file.digest,request.result);}
        done(bytes);
      });
      // WebCrypto runs OUTSIDE the IDB transaction. The final transaction copies these verified snapshots.
      for(const file of files){const bytes=captured.get(file.digest);if(!(bytes instanceof Uint8Array)||bytes.length!==file.size||await trust.sha256(bytes)!==file.digest)throw Error('Incomplete staged inventory');}
      await transaction<void>(['staging','blobs','pointers'],'readwrite',(tx,done,fail)=>{
        const pointers=tx.objectStore('pointers');const request=pointers.get(key(snapshot.company,snapshot.user));
        request.onsuccess=()=>{try{
          const previous=request.result as Pointer|undefined;
          if(!same(previous?.current||null,expectedSnapshot)){fail(Error('Concurrent activation'));return;}
          for(const file of files)tx.objectStore('blobs').put(captured.get(file.digest),[snapshot.company,snapshot.user,file.digest]);
          pointers.put({current:snapshot,lkg:previous?.lkg||null},key(snapshot.company,snapshot.user));
          tx.objectStore('staging').delete(IDBKeyRange.bound([namespace,''],[namespace,'\uffff']));done();
        }catch(error){fail(error);}};
      });
    },
    close:()=>db.close(),
  };
}
