import {identifier,recordId,validateScope,validateBatch,jsonPayload} from './contracts.ts';
import type {DataDriver,DataScope,DataRow,DataBatch,WriteReceipt} from './contracts';
/** Subject-data backend; bootstrap uses another database and stays available on domain failure. */
export function createIndexedDbDriver(factory:IDBFactory=globalThis.indexedDB):DataDriver{
  if(!factory)throw Error('IndexedDB unavailable');let opened:Promise<IDBDatabase>|null=null;
  const key=(scope:DataScope):IDBValidKey[]=>{validateScope(scope);return[scope.company,scope.user,scope.generation];};
  const range=(prefix:IDBValidKey[],after?:IDBValidKey)=>IDBKeyRange.bound(after===undefined?prefix:[...prefix,after],[...prefix,[]],after!==undefined);
  const encoded=(id:string)=>new TextEncoder().encode(recordId(id));
  const connection=()=>opened||=(new Promise<IDBDatabase>((resolve,reject)=>{const request=factory.open('lp2-domain-data-v1',1);let blocked=false;
    request.onupgradeneeded=()=>{for(const name of ['generations','schemas','rows'])request.result.createObjectStore(name);};
    request.onsuccess=()=>{if(blocked){request.result.close();return;}const db=request.result;db.onversionchange=()=>{db.close();opened=null;};resolve(db);};
    request.onerror=()=>{opened=null;reject(request.error);};request.onblocked=()=>{blocked=true;opened=null;reject(Error('Data database upgrade blocked'));};
  }));
  async function transaction<T>(mode:IDBTransactionMode,work:(tx:IDBTransaction,done:(value:T)=>void,fail:(error:unknown)=>void)=>void):Promise<T>{
    const db=await connection();return new Promise((resolve,reject)=>{let value:T;let failure:unknown;let tx:IDBTransaction;
      try{tx=mode==='readwrite'?db.transaction(['generations','schemas','rows'],mode,{durability:'strict'}):db.transaction(['generations','schemas','rows'],mode);}catch(error){reject(error);return;}
      const fail=(error:unknown)=>{failure=error;try{tx.abort();}catch{reject(error);}};
      tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(failure||tx.error||Error('Data transaction aborted'));tx.onerror=()=>{};
      if(mode==='readwrite'&&tx.durability!=='strict'){fail(Error('Strict data durability unavailable'));return;}
      try{work(tx,next=>{value=next;},fail);}catch(error){fail(error);}
    });
  }
  const request=(store:IDBObjectStore,id:IDBValidKey,then:(value:any)=>void,fail:(error:unknown)=>void)=>{const query=store.get(id);query.onsuccess=()=>{try{then(query.result);}catch(error){fail(error);}};};
  const generation=(tx:IDBTransaction,scope:DataScope,then:()=>void,fail:(error:unknown)=>void)=>request(tx.objectStore('generations'),key(scope),meta=>{if(meta?.physical!==1)throw Error('Missing/unsupported data generation');then();},fail);
  const schema=(tx:IDBTransaction,scope:DataScope,module:string,then:(version:number)=>void,fail:(error:unknown)=>void)=>request(tx.objectStore('schemas'),[...key(scope),identifier(module)],value=>{const version=value??0;if(!Number.isSafeInteger(version)||version<0)throw Error('Corrupt schema');then(version);},fail);
  const versioned=(tx:IDBTransaction,scope:DataScope,module:string,version:number,then:()=>void,fail:(error:unknown)=>void)=>generation(tx,scope,()=>schema(tx,scope,module,current=>{if(current!==version)throw Error('Module schema mismatch');then();},fail),fail);
  const checked=(row:DataRow,id?:string)=>{if(!row||typeof row.id!=='string'||(id!==undefined&&row.id!==id)||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Corrupt data row');recordId(row.id);jsonPayload(row.payload);return row;};
  return{
    close:async scope=>{validateScope(scope);if(opened){const db=await opened;db.close();opened=null;}},
    fork:async(source,target)=>{validateScope(target);if(source){validateScope(source);if(source.company!==target.company||source.user!==target.user)throw Error('Cross-tenant data copy');}
      await transaction<void>('readwrite',(tx,done,fail)=>request(tx.objectStore('generations'),key(target),existing=>{
        if(existing)throw Error('Generation already exists');
        const initialize=()=>{tx.objectStore('generations').put({physical:1},key(target));done();};
        if(!source){initialize();return;}
        generation(tx,source,()=>{
          for(const name of ['schemas','rows']){const store=tx.objectStore(name);const cursor=store.openCursor(range(key(source)));cursor.onsuccess=()=>{try{const current=cursor.result;if(!current)return;const original=current.key as IDBValidKey[];store.put(current.value,[...key(target),...original.slice(3)]);current.continue();}catch(error){fail(error);}};}
          initialize();
        },fail);
      },fail));
    },
    schema:async(scope,module)=>transaction<number>('readonly',(tx,done,fail)=>generation(tx,scope,()=>schema(tx,scope,module,done,fail),fail)),
    read:async(scope,module,version,collection,id)=>{identifier(collection);const rowKey=[...key(scope),identifier(module),collection,encoded(id)];return transaction<DataRow|null>('readonly',(tx,done,fail)=>versioned(tx,scope,module,version,()=>request(tx.objectStore('rows'),rowKey,row=>done(row===undefined?null:checked(row,id)),fail),fail));},
    list:async(scope,module,version,collection,limit,after)=>{identifier(collection);if(!Number.isSafeInteger(limit)||limit<1||limit>256)throw Error('Invalid page size');const prefix=[...key(scope),identifier(module),collection];const bounds=range(prefix,after===undefined?undefined:encoded(after));
      return transaction<DataRow[]>('readonly',(tx,done,fail)=>versioned(tx,scope,module,version,()=>{
        const rows:DataRow[]=[];const query=tx.objectStore('rows').openCursor(bounds);query.onsuccess=()=>{try{const cursor=query.result;if(!cursor||rows.length>=limit){done(rows);return;}rows.push(checked(cursor.value));cursor.continue();}catch(error){fail(error);}};
      },fail));
    },
    write:async(scope,input:DataBatch)=>{const batch=structuredClone(input);validateBatch(batch);key(scope);
      return transaction<WriteReceipt[]>('readwrite',(tx,done,fail)=>versioned(tx,scope,batch.module,batch.expectedSchema,()=>{
        const receipts:WriteReceipt[]=new Array(batch.changes.length);const store=tx.objectStore('rows');
        batch.changes.forEach((change,index)=>{const id=[...key(scope),batch.module,change.collection,encoded(change.id)];request(store,id,previous=>{
          if(previous!==undefined)checked(previous,change.id);if((previous?.revision??null)!==change.expectedRevision)throw Error('Record revision conflict');
          if(change.payload===null){store.delete(id);receipts[index]={collection:change.collection,id:change.id,revision:null};}
          else{const revision=(previous?.revision??0)+1;if(!Number.isSafeInteger(revision))throw Error('Revision overflow');store.put({id:change.id,revision,payload:change.payload},id);receipts[index]={collection:change.collection,id:change.id,revision};}
        },fail);});
        if(batch.targetSchema!==undefined)tx.objectStore('schemas').put(batch.targetSchema,[...key(scope),batch.module]);done(receipts);
      },fail));
    },
    verify:async(scope,schemas)=>transaction<void>('readonly',(tx,done,fail)=>generation(tx,scope,()=>{for(const[module,version]of Object.entries(schemas))schema(tx,scope,module,current=>{if(current!==version)throw Error('Module schema mismatch');},fail);done();},fail)),
  };
}
