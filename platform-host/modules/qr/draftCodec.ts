import {utf8Size} from '../../core/utf8.ts';
import {qrTypes,type QrType} from './contracts.ts';
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
