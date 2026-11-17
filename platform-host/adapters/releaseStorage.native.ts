import { NativeModules } from 'react-native';
import type { Activation, ArtifactFile, ReleaseStorage } from '../core/releaseSet';
import { decodeBase64, encodeBase64 } from '../core/bytes.ts';
export type ReleaseStorageBridge = {
  current(company:string,user:string):Promise<string|null>;
  lastGood(company:string,user:string):Promise<string|null>;
  cachedFile(company:string,user:string,digest:string):Promise<string|null>;
  stage(namespace:string,digest:string,encoded:string):Promise<void>;
  discard(namespace:string):Promise<void>;
  confirmHealthy(expected:string):Promise<void>;
  commit(expected:string|null,next:string,namespace:string):Promise<void>;
};
/** Private fork files only. Callers must verify saved signatures before executing cached code. */
export function createNativeReleaseStorage(bridge:ReleaseStorageBridge=NativeModules.LeaderReleaseStorage):ReleaseStorage & {lastGood(company:string,user:string):Promise<Activation|null>} {
  if(!bridge?.confirmHealthy)throw Error('Native release storage unavailable');
  const parse=(raw:string|null,company:string,user:string):Activation|null=>{
    if(raw===null)return null;const activation=JSON.parse(raw) as Activation;
    if(!activation || activation.company!==company || activation.user!==user || activation.release?.company!==company || typeof activation.signed?.payload!=='string' || typeof activation.dataGeneration!=='string')throw Error('Corrupt release namespace');
    return activation;
  };
  return {
    current:async(company,user)=>parse(await bridge.current(company,user),company,user),
    lastGood:async(company,user)=>parse(await bridge.lastGood(company,user),company,user),
    cachedFile:async(company,user,file:ArtifactFile)=>{const raw=await bridge.cachedFile(company,user,file.digest);return raw===null?null:decodeBase64(raw);},
    stage:(namespace,file,bytes)=>bridge.stage(namespace,file.digest,encodeBase64(bytes)),
    confirmHealthy:expected=>bridge.confirmHealthy(JSON.stringify(expected)),
    discard:namespace=>bridge.discard(namespace),
    commit:(expected,next,namespace)=>bridge.commit(expected===null?null:JSON.stringify(expected),JSON.stringify(next),namespace),
  };
}
