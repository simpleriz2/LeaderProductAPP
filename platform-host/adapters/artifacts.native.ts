import { NativeModules } from 'react-native';
import type { ServiceRoutingPorts } from '../core/serviceRouter';
import { decodeBase64 } from '../core/bytes.ts';
type Bridge={requestBytes(id:string,url:string,token:string):Promise<{status:number;body:string}>;cancel(id:string):void};
let sequence=0;
export function createNativeArtifactTransport(bridge:Bridge=NativeModules.LeaderHttp):ServiceRoutingPorts['send'] {
  if(!bridge?.requestBytes)throw Error('Native artifact transport unavailable');
  return async request=>{
    if(request.signal.aborted)throw Error('Request aborted');
    if(request.redirect!=='error'||request.method!=='GET'||request.body!==undefined)throw Error('Artifact GET required');
    const id=`artifact-${Date.now()}-${++sequence}`;const cancel=()=>bridge.cancel(id);
    request.signal.addEventListener('abort',cancel,{once:true});
    try {
      const response=await bridge.requestBytes(id,request.url,request.token);
      if(request.signal.aborted)throw Error('Request aborted');
      if(response.status>=300&&response.status<400)throw Error('Redirect refused');
      return {status:response.status,body:response.status===200?decodeBase64(response.body):null};
    }finally{request.signal.removeEventListener('abort',cancel);}
  };
}
