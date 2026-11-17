import {hasSessionAction} from '../../core/confirmedSession.ts';
import {decodeQrDraft,type QrDraft} from './draftCodec.ts';
import {decodeQrCreateAttempt} from './createAttempts.ts';
export {decodeQrDraft,type QrDraft,type QrFormFields} from './draftCodec.ts';
import type {SessionLease} from '../../core/sessionCoordinator';
import type {DatabaseSession} from '../../database/moduleDatabase';

export {qrTypes,type QrType} from './contracts.ts';
const codec={encode:decodeQrDraft,decode:decodeQrDraft};
/** No legacy QR queue exists to import; never read original application's database/storage. */
export {qrSchemaOwner} from './schema.ts';
export function createQrDraftRepository(database:Pick<DatabaseSession,'scope'|'module'>,lease:SessionLease){
  if(database.scope.company!==lease.session.company||database.scope.user!==lease.session.user)throw Error('Wrong QR data subject');
  const db=database.module('qr'),drafts=db.collection<QrDraft>('drafts',codec),attempts=db.collection<ReturnType<typeof decodeQrCreateAttempt>>('create-attempts',{encode:decodeQrCreateAttempt,decode:decodeQrCreateAttempt});
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
      const attempt=await attempts.get(id);checkpoint();if(attempt?.value.status==='pending')throw Error('Resolve pending QR creation before discarding draft');
      await db.transaction([drafts.remove(id,expectedRevision)]);checkpoint();
    },
  });
}
