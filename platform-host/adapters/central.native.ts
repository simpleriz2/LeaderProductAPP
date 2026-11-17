import {NativeModules} from 'react-native';
import type {CentralExchange} from '../core/centralClient';
import {utf8Size} from '../core/utf8.ts';
import {withRequestDeadline} from './requestDeadline.ts';
import {runNativeRequest} from './nativeRequest.ts';
type Bridge={request(id:string,url:string,method:string,token:string,body:string|null):Promise<{status:number;body:string}>;requestPublic(id:string,url:string,method:string,body:string|null):Promise<{status:number;body:string}>;cancel(id:string):void};
let sequence=0;
export function createNativeCentralExchange(bridge:Bridge=NativeModules.LeaderHttp):CentralExchange{
 if(!bridge?.requestPublic||!bridge.request)throw Error('Native Central HTTP revision3 required');
 return request=>withRequestDeadline(request.signal,15000,async signal=>{
  const id=`central-${Date.now()}-${++sequence}`;
  const result=await runNativeRequest(signal,()=>request.token===null?bridge.requestPublic(id,request.url,request.method,request.body??null):bridge.request(id,request.url,request.method,request.token,request.body??null),()=>bridge.cancel(id));
  if(result.status>=300&&result.status<400)throw Error('Central redirect refused');if(typeof result.body!=='string'||utf8Size(result.body)>256*1024)throw Error('Central response too large');return result;
 });
}
