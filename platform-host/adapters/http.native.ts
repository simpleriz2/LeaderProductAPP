import {NativeModules} from 'react-native';
import type {ServiceRoutingPorts} from '../core/serviceRouter';
import {withRequestDeadline} from './requestDeadline.ts';
import {runNativeRequest} from './nativeRequest.ts';
type Response={status:number;body:string};
type Bridge={request(id:string,url:string,method:string,token:string,body:string|null):Promise<Response>;cancel(id:string):void};
type PublicBridge={requestPublic(id:string,url:string,method:string,body:string|null):Promise<Response>;cancel(id:string):void};
type PublicRequest=Omit<Parameters<ServiceRoutingPorts['send']>[0],'token'>;
let sequence=0;
function decode(response:Response){if(response.status>=300&&response.status<400)throw Error('Redirect refused');return{status:response.status,body:response.body?JSON.parse(response.body):null};}
/** Scoped services still require a token; unauthenticated Central login has a distinct explicit port. */
export function createNativeHttpTransport(bridge:Bridge=NativeModules.LeaderHttp,timeoutMs=15000):ServiceRoutingPorts['send']{
 if(!bridge?.request)throw Error('Native HTTP transport unavailable');
 return async request=>{
  if(request.redirect!=='error')throw Error('Redirect policy required');const id=`http-${Date.now()}-${++sequence}`;
  return withRequestDeadline(request.signal,timeoutMs,async signal=>decode(await runNativeRequest(signal,()=>bridge.request(id,request.url,request.method,request.token,request.body??null),()=>bridge.cancel(id))));
 };
}
export function createNativePublicHttpTransport(bridge:PublicBridge=NativeModules.LeaderHttp,timeoutMs=15000):(request:PublicRequest)=>Promise<{status:number;body:unknown}>{
 if(!bridge?.requestPublic)throw Error('Native public HTTP transport unavailable');
 return async request=>{
  if(request.redirect!=='error')throw Error('Redirect policy required');const id=`public-${Date.now()}-${++sequence}`;
  return withRequestDeadline(request.signal,timeoutMs,async signal=>decode(await runNativeRequest(signal,()=>bridge.requestPublic(id,request.url,request.method,request.body??null),()=>bridge.cancel(id))));
 };
}
