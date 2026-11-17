import { NativeModules } from 'react-native';
import {createVerifiedSessionStore} from '../core/offlineSession.ts';
import type {Trust} from '../core/releaseSet';
type CredentialsBridge = { readSession(): Promise<string | null>; writeSession(value: string): Promise<void>; clearSession(): Promise<void> };
/** Mandatory pinned signature trust plus native encrypted storage. No unsigned session/plaintext fallback. */
export function createSecureSessionStore(trust:Trust,bridge: CredentialsBridge = NativeModules.LeaderCredentials){
  if(!bridge) throw Error('Native secure credentials module unavailable');
  return createVerifiedSessionStore(trust,{read:()=>bridge.readSession(),write:value=>bridge.writeSession(value),clear:()=>bridge.clearSession()});
}
