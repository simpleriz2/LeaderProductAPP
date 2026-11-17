import { NativeModules } from 'react-native';
import type { ConfirmedSession, SessionStore } from '../core/sessionCoordinator';
type CredentialsBridge = { readSession(): Promise<string | null>; writeSession(value: string): Promise<void>; clearSession(): Promise<void> };
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(v);
export function createSecureSessionStore(bridge: CredentialsBridge = NativeModules.LeaderCredentials): SessionStore {
  if(!bridge) throw Error('Native secure credentials module unavailable');
  const validate = (value: unknown): ConfirmedSession => {
    const session = value as ConfirmedSession;
    if(!session || !identifier(session.company) || !identifier(session.user) || !identifier(session.confirmation) || !Array.isArray(session.modules) || session.modules.length > 128 || !session.modules.every(identifier) || new Set(session.modules).size !== session.modules.length) throw Error('Invalid saved session');
    return { company: session.company, user: session.user, confirmation: session.confirmation, modules: [...session.modules] };
  };
  return {
    loadLastConfirmed: async () => { const raw = await bridge.readSession(); return raw === null ? null : validate(JSON.parse(raw)); },
    saveConfirmed: async session => bridge.writeSession(JSON.stringify(validate(session))),
    clearSession: () => bridge.clearSession(),
  };
}
