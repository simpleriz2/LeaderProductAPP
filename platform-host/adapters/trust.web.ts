import type { Trust } from '../core/releaseSet';
import { copyKeyring, decodeBase64 } from '../core/bytes.ts';
export function createWebTrust(roots:Readonly<Record<string,string>>,subtle:SubtleCrypto=globalThis.crypto?.subtle):Trust {
  if(!subtle)throw Error('Secure signature verification unavailable');const keys=copyKeyring(roots);
  return {
    verifyEd25519:async(id,payload,signature)=>{
      if(!Object.prototype.hasOwnProperty.call(keys,id))return false;
      const bytes=new TextEncoder().encode(payload);if(bytes.length>256*1024||signature.length>128)throw Error('Invalid signed payload size');
      const key=await subtle.importKey('raw',new Uint8Array(decodeBase64(keys[id])).buffer,{name:'Ed25519'},false,['verify']);
      const sig=decodeBase64(signature);if(sig.length!==64)return false;
      return subtle.verify('Ed25519',key,new Uint8Array(sig).buffer,bytes.buffer);
    },
    sha256:async bytes=>{
      if(bytes.length>12*1024*1024)throw Error('Byte bridge limit exceeded');
      const hash=await subtle.digest('SHA-256',new Uint8Array(bytes).buffer);
      return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
    },
  };
}
