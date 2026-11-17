import type {CentralExchange} from '../core/centralClient';
import {withRequestDeadline} from './requestDeadline.ts';
import {readResponseBytes} from './httpBytes.web.ts';
export function createWebCentralExchange(fetcher:typeof fetch=fetch):CentralExchange{
 return request=>withRequestDeadline(request.signal,15000,async signal=>{
  const response=await fetcher(request.url,{method:request.method,body:request.body,headers:{Accept:'application/json',...(request.body===undefined?{}:{'Content-Type':'application/json'}),...(request.token===null?{}:{Authorization:`Bearer ${request.token}`})},signal,redirect:'error',credentials:'omit',cache:'no-store'});
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw Error('Central redirect refused');}
  const bytes=await readResponseBytes(response,signal,256*1024);return{status:response.status,body:new TextDecoder().decode(bytes)};
 });
}
