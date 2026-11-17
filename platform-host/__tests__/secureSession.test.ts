import { createSecureSessionStore } from '../adapters/secureSession.native';
const session = { company: 'alpha', user: 'alice', modules: ['qr'], confirmation: 'central-1' };
test('validates scoped session shape and preserves only allowed fields before native encryption', async () => {
  const bridge = { readSession: jest.fn(async () => JSON.stringify(session)), writeSession: jest.fn(async (_value: string) => undefined), clearSession: jest.fn(async () => undefined) };
  const store = createSecureSessionStore(bridge);
  expect(await store.loadLastConfirmed()).toEqual(session);
  await store.saveConfirmed(session); expect(JSON.parse(bridge.writeSession.mock.calls[0][0])).toEqual(session);
  await store.clearSession(); expect(bridge.clearSession).toHaveBeenCalledTimes(1);
});
test('secure read/write failure propagates without plaintext fallback or data clearing', async () => {
  const bridge = { readSession: jest.fn(async () => { throw Error('Keystore unavailable'); }), writeSession: jest.fn(async () => { throw Error('Disk error'); }), clearSession: jest.fn(async () => undefined) };
  const store = createSecureSessionStore(bridge);
  await expect(store.loadLastConfirmed()).rejects.toThrow('Keystore unavailable');
  await expect(store.saveConfirmed(session)).rejects.toThrow('Disk error'); expect(bridge.clearSession).not.toHaveBeenCalled();
});
test('corrupt namespace and duplicate module rights are rejected', async () => {
  const bridge = { readSession: async () => JSON.stringify({...session,company:'../beta'}),writeSession:jest.fn(async()=>undefined),clearSession:async()=>undefined };
  const store=createSecureSessionStore(bridge);await expect(store.loadLastConfirmed()).rejects.toThrow('Invalid saved');
  await expect(store.saveConfirmed({...session,modules:['qr','qr']})).rejects.toThrow('Invalid saved');expect(bridge.writeSession).not.toHaveBeenCalled();
});
