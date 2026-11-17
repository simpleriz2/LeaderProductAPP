import {utf8Size} from './utf8.ts';
export type CentralPath='/login'|'/discovery'|'/tokens';
export type CentralExchange=(request:{url:string;method:'GET'|'POST';body?:string;token:string|null;signal:AbortSignal;redirect:'error'})=>Promise<{status:number;body:string}>;
export class CentralDenied extends Error{}
/** Universal credentials belong ONLY to this pinned Central origin and fixed auth/discovery paths. */
export function createCentralClient(origin:string,exchange:CentralExchange,accessToken:()=>string|null){
 const endpoint=new URL(origin);if(endpoint.origin!==origin||endpoint.username||endpoint.password||!['https:','http:'].includes(endpoint.protocol)||(endpoint.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)))throw Error('Untrusted Central origin');
 return async(path:CentralPath,body:unknown,signal:AbortSignal)=>{
  if(!['/login','/discovery','/tokens'].includes(path))throw Error('Untrusted Central path');
  if(signal.aborted)throw Error('Central request aborted');const token=path==='/login'?null:accessToken();
  if(token!==null&&(typeof token!=='string'||!/^[A-Za-z0-9._~=-]{1,8192}$/.test(token)))throw Error('Invalid Central credential');
  const serialized=body===undefined?undefined:JSON.stringify(body);if(serialized!==undefined&&utf8Size(serialized)>256*1024)throw Error('Central command too large');
  const response=await exchange({url:origin+path,method:body===undefined?'GET':'POST',body:serialized,token,signal,redirect:'error'});
  if(signal.aborted)throw Error('Central request aborted');if(typeof response.body!=='string'||utf8Size(response.body)>256*1024)throw Error('Central response too large');
  if(response.status!==200)throw response.status===401&&path!=='/login'?new CentralDenied():Error('Central request failed');
  return JSON.parse(response.body);
 };
}
