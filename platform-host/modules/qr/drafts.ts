import {hasSessionAction} from '../../core/confirmedSession.ts';
import {utf8Size} from '../../core/utf8.ts';
import type {SessionLease} from '../../core/sessionCoordinator';
import type {DatabaseSession} from '../../database/moduleDatabase';
import type {SchemaOwner} from '../../database/migrations';

import {qrTypes,type QrType} from './contracts.ts';
export {qrTypes,type QrType} from './contracts.ts';
const fields=['phone','url','email','subject','body','text','message','username','firstname','lastname','org','website','contactAddress','note'] as const;
export type QrFormFields=Partial<Record<typeof fields[number],string>>;
/** Raw incomplete form values; submission validation/normalization belongs to QR's online command. */
export type QrDraft={format:1;documentId:string|null;qrType:QrType;description:string;values:QrFormFields};
function bounded(value:unknown,limit:number):string{
  if(typeof value!=='string'||value.length>limit||utf8Size(value)>limit)throw Error('Invalid QR draft field');return value;
}
function exact(value:unknown,keys:readonly string[]):asserts value is Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw Error('Invalid QR draft shape');
}
export function decodeQrDraft(value:unknown):QrDraft{
  exact(value,['format','documentId','qrType','description','values']);
  if(value.format!==1||!qrTypes.includes(value.qrType as QrType))throw Error('Unknown QR draft format/type');
  if(value.documentId!==null&&!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(bounded(value.documentId,128)))throw Error('Invalid QR document id');
  exact(value.values,fields);const values:QrFormFields={};
  for(const field of fields)if(Object.hasOwn(value.values,field))values[field]=bounded(value.values[field],65536);
  if(utf8Size(JSON.stringify(values))>128*1024)throw Error('QR draft too large');
  return{format:1,documentId:value.documentId as string|null,qrType:value.qrType as QrType,description:bounded(value.description,8192),values};
}
const codec={encode:decodeQrDraft,decode:decodeQrDraft};
/** No legacy QR queue exists to import; never read original application's database/storage. */
export const qrSchemaOwner:SchemaOwner={module:'qr',base:1,initialize:async()=>{},migrations:[]};
export function createQrDraftRepository(database:DatabaseSession,lease:SessionLease){
  if(database.scope.company!==lease.session.company||database.scope.user!==lease.session.user)throw Error('Wrong QR data subject');
  const db=database.module('qr'),drafts=db.collection<QrDraft>('drafts',codec);
  const action=(name:string)=>hasSessionAction(lease.session,'qr',name);
  const checkpoint=()=>{lease.assertCurrent();if(!action('create_qr')&&!action('update_qr')&&!action('view_qr'))throw Error('QR draft access denied');};
  const editable=(draft:QrDraft)=>{checkpoint();if(!action(draft.documentId===null?'create_qr':'update_qr'))throw Error('QR draft edit denied');};
  const readable=(draft:QrDraft)=>action('view_qr')||action(draft.documentId===null?'create_qr':'update_qr');
  return Object.freeze({
    async get(id:string){checkpoint();const row=await drafts.get(id);checkpoint();if(row&&!readable(row.value))throw Error('QR draft access denied');return row;},
    async list(limit=100,after?:string){checkpoint();const rows=await drafts.list(limit,after);checkpoint();return{items:rows.filter(row=>readable(row.value)),nextAfter:rows.length===limit?rows[rows.length-1]?.id:undefined};},
    async save(id:string,draft:QrDraft,expectedRevision:number|null){
      const snapshot=decodeQrDraft(draft);editable(snapshot);const previous=await drafts.get(id);editable(snapshot);if(previous)editable(previous.value);
      if((previous?.revision??null)!==expectedRevision)throw Error('QR draft revision conflict');
      const receipts=await db.transaction([drafts.put(id,snapshot,expectedRevision)]);checkpoint();return receipts[0].revision!;
    },
    async remove(id:string,expectedRevision:number){
      checkpoint();const previous=await drafts.get(id);if(!previous)throw Error('QR draft missing');editable(previous.value);
      await db.transaction([drafts.remove(id,expectedRevision)]);checkpoint();
    },
  });
}
