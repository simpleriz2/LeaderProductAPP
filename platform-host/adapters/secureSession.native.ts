import { NativeModules } from 'react-native';
import {snapshotConfirmedSession} from '../core/confirmedSession.ts';
import type { ConfirmedSession, SessionStore } from '../core/sessionCoordinator';
type CredentialsBridge = { readSession(): Promise<string | null>; writeSession(value: string): Promise<void>; clearSession(): Promise<void> };
export function createSecureSessionStore(bridge: CredentialsBridge = NativeModules.LeaderCredentials): SessionStore {
  if(!bridge) throw Error('Native secure credentials module unavailable');
  const validate = snapshotConfirmedSession;
  return {
    loadLastConfirmed: async () => { const raw = await bridge.readSession(); return raw === null ? null : validate(JSON.parse(raw)); },
    saveConfirmed: async session => bridge.writeSession(JSON.stringify(validate(session))),
    clearSession: () => bridge.clearSession(),
  };
}
