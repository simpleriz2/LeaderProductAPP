import { NativeModules } from 'react-native';
import type { Trust } from '../core/releaseSet';
import { copyKeyring, encodeBase64 } from '../core/bytes.ts';
type CryptoBridge={verify(key:string,payload:string,signature:string):Promise<boolean>;sha256(bytes:string):Promise<string>};
export function createNativeTrust(roots:Readonly<Record<string,string>>,bridge:CryptoBridge=NativeModules.LeaderReleaseCrypto):Trust {
  if(!bridge)throw Error('Native release verifier unavailable');const keys=copyKeyring(roots);
  return {
    verifyEd25519:async(id,payload,signature)=>{
      if(!Object.prototype.hasOwnProperty.call(keys,id))return false;
      if(payload.length>256*1024||signature.length>128)throw Error('Invalid signed payload size');
      return bridge.verify(keys[id],payload,signature);
    },
    sha256:bytes=>bridge.sha256(encodeBase64(bytes)),
  };
}
