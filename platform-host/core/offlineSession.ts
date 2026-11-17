import {snapshotConfirmedSession} from './confirmedSession.ts';
import type {ConfirmedSession,SessionStore} from './sessionCoordinator';
import type {Trust} from './releaseSet';
export type SignedOfflineSession={keyId:string;payload:string;signature:string};
export type OfflineProofStorage={read():Promise<string|null>;write(value:string):Promise<void>;clear():Promise<void>};
export async function verifyOfflineSession(value:unknown,trust:Trust):Promise<{signed:SignedOfflineSession;session:ConfirmedSession}>{
  const input=value as SignedOfflineSession;
  if(!input||typeof input.keyId!=='string'||input.keyId.length>128||typeof input.payload!=='string'||input.payload.length>64*1024||typeof input.signature!=='string'||input.signature.length>128)throw Error('Invalid offline proof envelope');
  const signed=Object.freeze({keyId:input.keyId,payload:input.payload,signature:input.signature});
  if(!await trust.verifyEd25519(signed.keyId,signed.payload,signed.signature))throw Error('Untrusted offline proof');
  const grant=JSON.parse(signed.payload);
  if(grant?.format!==1||grant.purpose!=='lp2-offline-session'||!Number.isSafeInteger(grant.issuedAt)||grant.issuedAt<0)throw Error('Invalid offline proof purpose/format');
  // Deliberately no offline expiry: owner's accepted policy retains last confirmed rights until reconnection.
  return{signed,session:snapshotConfirmedSession(grant.session)};
}
/** Persists signed RIGHTS, never an access/refresh token. Auth must accept a verified online Central grant first. */
export function createVerifiedSessionStore(trust:Trust,storage:OfflineProofStorage):SessionStore&{acceptOnlineGrant(signed:SignedOfflineSession):Promise<ConfirmedSession>}{
  let accepted:Awaited<ReturnType<typeof verifyOfflineSession>>|null=null;let epoch=0;
  return{
    async acceptOnlineGrant(signed){const revision=++epoch;accepted=null;const verified=await verifyOfflineSession(signed,trust);if(revision!==epoch)throw Error('Superseded online proof');accepted=verified;return verified.session;},
    async loadLastConfirmed(){const raw=await storage.read();if(raw===null)return null;if(raw.length>96*1024)throw Error('Stored offline proof too large');return(await verifyOfflineSession(JSON.parse(raw),trust)).session;},
    async saveConfirmed(value){const session=snapshotConfirmedSession(value),proof=accepted;if(!proof||JSON.stringify(proof.session)!==JSON.stringify(session))throw Error('No matching online Central proof');await storage.write(JSON.stringify(proof.signed));},
    async clearSession(){epoch++;accepted=null;await storage.clear();},
  };
}
