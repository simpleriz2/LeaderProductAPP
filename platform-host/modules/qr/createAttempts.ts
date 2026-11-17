import {hasSessionAction} from '../../core/confirmedSession.ts';
import {utf8Size} from '../../core/utf8.ts';
import type {SessionLease} from '../../core/sessionCoordinator';
import type {ModuleDataView} from '../../core/moduleFactory';
import {decodeQrDraft,type QrDraft} from './draftCodec.ts';
import {snapshotQrWrite,decodeQrDocument,type QrWrite,type QrDocument,createQrCompanyClient} from './companyClient.ts';
type CreateAttempt={format:1;draftId:string;operationId:string;payload:QrWrite;status:'pending'|'acknowledged';result:QrDocument|null};
const canonical=(value:unknown)=>JSON.stringify(value,(_,next)=>next&&typeof next==='object'&&!Array.isArray(next)?Object.fromEntries(Object.keys(next).sort().map(key=>[key,next[key]])):next);
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const draftId=(value:unknown):string=>{if(typeof value!=='string'||!value.length||utf8Size(value)>512||/[\u0000-\u001f]/.test(value))throw Error('Invalid QR attempt draft id');return value;};
export function decodeQrCreateAttempt(value:unknown):CreateAttempt{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid QR creation attempt');const row=value as Record<string,unknown>;
 if(Object.keys(row).some(key=>!['format','draftId','operationId','payload','status','result'].includes(key))||row.format!==1||!uuid(row.operationId)||!['pending','acknowledged'].includes(row.status as string))throw Error('Invalid QR creation attempt');
 const payload=snapshotQrWrite(row.payload as QrWrite),result=row.result===null?null:decodeQrDocument(row.result);
 if((row.status==='pending'&&result!==null)||(row.status==='acknowledged'&&(result===null||result.revision!==1||result.status!=='ACTIVE'||result.qrType!==payload.qrType||result.description!==(payload.description??null))))throw Error('Invalid QR creation receipt');
 return{format:1,draftId:draftId(row.draftId),operationId:row.operationId as string,payload,status:row.status as CreateAttempt['status'],result};
}
/** QR schema2. Explicit online commands only: no import-time/background/offline network retries. */
export function createQrCreateAttempts(data:ModuleDataView,lease:SessionLease,createOperationId:()=>string){
 if(data.scope.company!==lease.session.company||data.scope.user!==lease.session.user)throw Error('Wrong QR attempt subject');
 const db=data.module('qr'),attempts=db.collection<CreateAttempt>('create-attempts',{encode:decodeQrCreateAttempt,decode:decodeQrCreateAttempt}),drafts=db.collection<QrDraft>('drafts',{encode:decodeQrDraft,decode:decodeQrDraft});
 const can=(action:string)=>hasSessionAction(lease.session,'qr',action);
 const check=(write=false)=>{lease.assertCurrent();if(write?!can('create_qr'):!can('create_qr')&&!can('view_qr'))throw Error('QR creation access denied');};
 const get=async(id:string)=>{check();const row=await attempts.get(draftId(id));check();if(row&&row.value.draftId!==id)throw Error('QR attempt record mismatch');return row;};
 return Object.freeze({get,
  async prepare(id:string,expectedDraftRevision:number,payload:QrWrite){
   check(true);draftId(id);const snapshot=JSON.parse(canonical(snapshotQrWrite(payload))) as QrWrite;
   const existing=await get(id);if(existing){if(canonical(existing.value.payload)!==canonical(snapshot))throw Error('Resolve existing QR creation before changing submitted payload');return existing;}
   const draft=await drafts.get(id);check(true);if(!draft||draft.revision!==expectedDraftRevision||draft.value.documentId!==null)throw Error('QR creation draft revision conflict');
   const operationId=createOperationId();if(!uuid(operationId))throw Error('Secure QR operation id required');
   const value:CreateAttempt={format:1,draftId:id,operationId,payload:snapshot,status:'pending',result:null};
   try{await db.transaction([attempts.put(id,value,null),drafts.put(id,draft.value,draft.revision)]);check(true);}
   catch(error){check(true);const winner=await get(id);if(!winner||canonical(winner.value.payload)!==canonical(snapshot))throw error;return winner;}
   const saved=await get(id);if(!saved)throw Error('QR attempt not durable');return saved;
  },
  async transmit(id:string,client:Pick<ReturnType<typeof createQrCompanyClient>,'create'>):Promise<QrDocument>{
   check(true);if(!lease.online)throw Error('QR creation requires online confirmation');const attempt=await get(id);if(!attempt)throw Error('No saved QR creation attempt');if(attempt.value.status==='acknowledged')return attempt.value.result!;
   const result=decodeQrDocument(await client.create(attempt.value.operationId,attempt.value.payload));check(true);
   if(result.revision!==1||result.status!=='ACTIVE'||result.qrType!==attempt.value.payload.qrType||result.description!==(attempt.value.payload.description??null))throw Error('QR creation acknowledgement mismatch');
   // A failed acknowledgement write keeps the pending operation identity. Never issue a fresh create on retry.
   for(let retry=0;retry<3;retry++){
    check(true);const current=await get(id);if(!current||current.value.operationId!==attempt.value.operationId)throw Error('QR creation identity changed');
    if(current.value.status==='acknowledged'){if(current.value.result!.id!==result.id)throw Error('QR receipt document mismatch');return current.value.result!;}
    const draft=await drafts.get(id);check(true);if(!draft||(draft.value.documentId!==null&&draft.value.documentId!==result.id))throw Error('QR draft identity changed');
    try{await db.transaction([attempts.put(id,{...current.value,status:'acknowledged',result},current.revision),drafts.put(id,{...draft.value,documentId:result.id},draft.revision)]);check(true);return result;}
    catch(error){check(true);if(retry===2)throw error;}
   }
   throw Error('QR acknowledgement not durable');
  },
 });
}
