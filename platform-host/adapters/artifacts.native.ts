import {withRequestDeadline} from './requestDeadline.ts';
import {runNativeRequest} from './nativeRequest.ts';
import { NativeModules } from 'react-native';
import type { ServiceRoutingPorts } from '../core/serviceRouter';
import { decodeBase64 } from '../core/bytes.ts';
type Bridge={requestBytes(id:string,url:string,token:string):Promise<{status:number;body:string}>;cancel(id:string):void};
let sequence=0;
export function createNativeArtifactTransport(bridge:Bridge=NativeModules.LeaderHttp,timeoutMs=60000):ServiceRoutingPorts['send'] {
  if(!bridge?.requestBytes)throw Error('Native artifact transport unavailable');
  return async request=>{
    if(request.signal.aborted)throw Error('Request aborted');
    if(request.redirect!=='error'||request.method!=='GET'||request.body!==undefined)throw Error('Artifact GET required');
    const id=`artifact-${Date.now()}-${++sequence}`;
    return withRequestDeadline(request.signal,timeoutMs,async signal=>{
      const response=await runNativeRequest(signal,()=>bridge.requestBytes(id,request.url,request.token),()=>bridge.cancel(id));
      if(request.signal.aborted)throw Error('Request aborted');
      if(response.status>=300&&response.status<400)throw Error('Redirect refused');
      return {status:response.status,body:response.status===200?decodeBase64(response.body):null};
    });
  };
}
