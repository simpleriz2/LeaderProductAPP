import {utf8Size} from '../../core/utf8.ts';
import {qrTypes,type QrType,type QrStatus,type QrDocument,type QrWrite,type QrCompanyPort} from './contracts.ts';
export type {QrStatus,QrDocument,QrWrite,QrCompanyPort} from './contracts';
export class QrCompanyError extends Error{constructor(readonly status:number,message:string){super(message);}}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const documentId=(value:string)=>{if(!uuid(value))throw Error('Invalid QR document id');return value.toLowerCase();};
const revision=(value:number)=>{if(!Number.isSafeInteger(value)||value<1)throw Error('Invalid QR revision');return value;};
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid QR response');return value as Record<string,unknown>;};
export function decodeQrDocument(value:unknown):QrDocument{
 const row=object(value);
 if(!uuid(row.id)||!qrTypes.includes(row.qrType as QrType)||typeof row.qrData!=='string'||utf8Size(row.qrData)>131072||(row.description!==null&&(typeof row.description!=='string'||utf8Size(row.description)>8192))||!['ACTIVE','PAUSED','DELETED'].includes(row.status as string))throw Error('Invalid QR document response');
 return{id:row.id,qrType:row.qrType as QrType,qrData:row.qrData,description:row.description as string|null,status:row.status as QrStatus,revision:revision(row.revision as number)};
}
function write(value:Partial<QrWrite>,partial=false):Partial<QrWrite>{
 const input=object(value);if(Object.keys(input).some(key=>!['qrType','qrData','description'].includes(key))||!Object.keys(input).length)throw Error('Invalid QR write');
 if((!partial||Object.hasOwn(input,'qrType'))&&!qrTypes.includes(input.qrType as QrType))throw Error('Invalid QR type');
 if((!partial||Object.hasOwn(input,'qrData'))&&(typeof input.qrData!=='string'&&(!input.qrData||typeof input.qrData!=='object'||Array.isArray(input.qrData))))throw Error('Invalid QR data');
 if(Object.hasOwn(input,'description')&&input.description!==null&&(typeof input.description!=='string'||utf8Size(input.description)>8192))throw Error('Invalid QR description');
 const serialized=JSON.stringify(input,(_,next)=>{if(typeof next==='undefined'||typeof next==='function'||typeof next==='symbol'||typeof next==='bigint'||(typeof next==='number'&&!Number.isFinite(next)))throw Error('Invalid QR JSON');return next;});
 if(utf8Size(serialized)>192*1024)throw Error('QR command too large');return JSON.parse(serialized);
}
export function createQrCompanyClient(port:QrCompanyPort){
 async function request(path:string,method:'GET'|'POST'|'PUT'|'DELETE',body?:unknown){
  const response=await port.execute(path,{method,body});
  if(response.status<200||response.status>=300){const error=typeof response.body==='object'&&response.body!==null?(response.body as Record<string,unknown>).error:undefined;throw new QrCompanyError(response.status,typeof error==='string'&&error.length<=256?error:'QR request failed');}
  return object(response.body);
 }
 const command=async(path:string,method:'POST'|'PUT'|'DELETE',body:unknown)=>decodeQrDocument((await request(path,method,body)).document);
 return Object.freeze({
  async get(id:string){return decodeQrDocument((await request('/qr/'+documentId(id),'GET')).document);},
  async list(limit=100,after?:string){
   if(!Number.isSafeInteger(limit)||limit<1||limit>256)throw Error('Invalid QR page');
   const cursor=after===undefined?undefined:documentId(after);
   const path=`/qr?limit=${limit}${cursor===undefined?'':'&after='+cursor}`;const page=await request(path,'GET');
   if(!Array.isArray(page.items)||page.items.length>limit||(page.nextAfter!==null&&!uuid(page.nextAfter)))throw Error('Invalid QR page response');
   const items=page.items.map(decodeQrDocument);if(new Set(items.map(item=>item.id)).size!==items.length||items.some((item,index)=>index>0&&items[index-1].id>=item.id)||(cursor!==undefined&&items.some(item=>item.id<=cursor))||(page.nextAfter!==null&&page.nextAfter!==items[items.length-1]?.id))throw Error('Invalid QR page cursor');
   return{items,nextAfter:page.nextAfter as string|null};
  },
  async create(operationId:string,input:QrWrite){if(!uuid(operationId))throw Error('QR operation id required');return command('/qr','POST',{...write(input),operationId});},
  async update(id:string,expectedRevision:number,patch:Partial<QrWrite>){return command('/qr/'+documentId(id),'PUT',{...write(patch,true),expectedRevision:revision(expectedRevision)});},
  async remove(id:string,expectedRevision:number){return command('/qr/'+documentId(id),'DELETE',{expectedRevision:revision(expectedRevision)});},
  async restore(id:string,expectedRevision:number){return command('/qr/'+documentId(id)+'/restore','PUT',{expectedRevision:revision(expectedRevision)});},
  async setStatus(id:string,expectedRevision:number,status:'ACTIVE'|'PAUSED'){if(!['ACTIVE','PAUSED'].includes(status))throw Error('Invalid QR status');return command('/qr/'+documentId(id)+'/status','PUT',{expectedRevision:revision(expectedRevision),status});},
 });
}
