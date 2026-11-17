import { SessionCoordinator, type ConfirmedSession, type ModuleLifecycle, type SessionLease } from '../core/sessionCoordinator';
const alice: ConfirmedSession = { company: 'alpha', user: 'alice', modules: ['qr','outbox'], confirmation: 'central-1' };
const bob: ConfirmedSession = { company: 'beta', user: 'bob', modules: ['qr'], confirmation: 'central-2' };
let saved: ConfirmedSession | null, events: string[], leases: SessionLease[], coordinator: SessionCoordinator, qr: ModuleLifecycle, outbox: ModuleLifecycle;
beforeEach(() => {
  saved = null; events = []; leases = [];
  const module = (id: string, requiresOnline: boolean): ModuleLifecycle => ({ id, requiresOnline,
    init: async lease => { events.push(`${id}:init:${lease.session.user}:${lease.online}`); leases.push(lease); },
    activate: async () => { events.push(`${id}:activate`); },
    suspend: async reason => { events.push(`${id}:suspend:${reason}`); },
    dispose: async () => { events.push(`${id}:dispose`); },
  });
  qr = module('qr', false); outbox = module('outbox', true);
  coordinator = new SessionCoordinator({ loadLastConfirmed: async () => saved, saveConfirmed: async s => { saved = s; }, clearSession: async () => { saved = null; } }, [qr,outbox], {prepare:async()=>{}});
});
test('first offline login is impossible; confirming permissions does not start all modules', async () => {
  await expect(coordinator.restoreOffline()).rejects.toThrow('requires Central');
  await coordinator.confirm(alice); expect(events).toEqual([]);
  await coordinator.activate('qr'); expect(events).toEqual(['qr:init:alice:true','qr:activate']);
});
test('offline retains confirmed identity, suspends online workers, restores without new login', async () => {
  await coordinator.confirm(alice); await coordinator.activate('qr'); await coordinator.activate('outbox');
  const old = leases[0]; await coordinator.goOffline();
  expect(() => old.assertCurrent()).toThrow('Stale'); expect(saved?.user).toBe('alice');
  expect(events.filter(e => e === 'outbox:activate')).toHaveLength(1);
  expect(events).toContain('qr:init:alice:false');
  await coordinator.restoreOffline(); await coordinator.activate('qr'); expect(leases.at(-1)?.session.user).toBe('alice');
});
test('account switch cleans old resources before any new activation and invalidates in-flight leases immediately', async () => {
  await coordinator.confirm(alice); await coordinator.activate('outbox'); const old = leases[0];
  const transition = coordinator.confirm(bob); expect(old.signal.aborted).toBe(true); await transition;
  expect(events).toContain('outbox:dispose'); expect(events).not.toContain('qr:init:bob:true');
  await coordinator.activate('qr'); expect(events.indexOf('outbox:dispose')).toBeLessThan(events.indexOf('qr:init:bob:true'));
  await expect(coordinator.activate('outbox')).rejects.toThrow('not entitled');
});
test('reconfirmation applies revoked module rights and logout clears persisted authorization', async () => {
  await coordinator.confirm(alice); await coordinator.activate('outbox');
  await coordinator.confirm({ ...alice, modules: ['qr'], confirmation: 'central-3' });
  await expect(coordinator.activate('outbox')).rejects.toThrow('not entitled');
  await coordinator.logout('revoked'); expect(saved).toBeNull();
  await expect(coordinator.restoreOffline()).rejects.toThrow('requires Central');
});
test('cleanup failure blocks switching accounts and does not enable the new identity', async () => {
  await coordinator.confirm(alice); await coordinator.activate('outbox'); outbox.suspend = async () => { throw Error('native worker refused'); };
  await expect(coordinator.confirm(bob)).rejects.toThrow('cleanup incomplete');
  await expect(coordinator.activate('qr')).rejects.toThrow('No usable session'); expect(saved?.user).toBe('alice');
  await expect(coordinator.logout('revoked')).rejects.toThrow(); expect(saved).toBeNull();
});
test('queued outdated login cannot activate after a newer logout', async () => {
  const login = coordinator.confirm(alice); const logout = coordinator.logout();
  await expect(login).rejects.toThrow('Superseded'); await logout;
  expect(saved).toBeNull(); expect(events).toEqual([]);
});
test('failed credential invalidation cannot restore old rights in the same coordinator', async () => {
  const broken = new SessionCoordinator({ loadLastConfirmed: async () => alice, saveConfirmed: async () => undefined, clearSession: async () => { throw Error('Secure storage unavailable'); } }, [], {prepare:async()=>{}});
  await broken.confirm(alice); await expect(broken.logout('revoked')).rejects.toThrow('Secure storage unavailable');
  await expect(broken.restoreOffline()).rejects.toThrow('Authorization invalidated');
});

test('initial confirmation and refresh cannot start desired modules before release preparation',async()=>{
  let release=()=>{};let entered=()=>{};const preparing=new Promise<void>(resolve=>{entered=resolve;});
  let gateCalls=0;const gate={prepare:jest.fn(async()=>{if(++gateCalls===2){entered();await new Promise<void>(resolve=>{release=resolve;});}})};
  coordinator=new SessionCoordinator({loadLastConfirmed:async()=>saved,saveConfirmed:async s=>{saved=s;},clearSession:async()=>{saved=null;}},[qr,outbox],gate);
  await coordinator.confirm(alice);await coordinator.activate('outbox');const first=leases[0];events=[];
  const refresh=coordinator.confirm({...alice,confirmation:'central-2'});await preparing;
  expect(first.signal.aborted).toBe(true);expect(events).toEqual(['outbox:suspend:confirmation','outbox:dispose']);expect(coordinator.currentLease().session.confirmation).toBe('central-2');
  release();await refresh;expect(events).toContain('outbox:init:alice:true');expect(events.at(-1)).toBe('outbox:activate');
});
test('preparation failure permits recovery but blocks business startup; offline preparation still uses only saved identity',async()=>{
  const prepare=jest.fn(async(lease:SessionLease)=>{if(lease.online)throw Error('No coherent release');});
  coordinator=new SessionCoordinator({loadLastConfirmed:async()=>saved,saveConfirmed:async s=>{saved=s;},clearSession:async()=>{saved=null;}},[qr,outbox],{prepare});
  await expect(coordinator.confirm(alice)).rejects.toThrow('No coherent release');expect(saved?.user).toBe('alice');
  await expect(coordinator.activate('qr')).rejects.toThrow('not ready');expect(events).toEqual([]);
  await coordinator.restoreOffline();await coordinator.activate('qr');expect(leases.at(-1)?.online).toBe(false);expect(Object.isFrozen(coordinator.currentLease().session.modules)).toBe(true);
});
test('logout during preparation invalidates the lease and never starts a module afterwards',async()=>{
  let finish=()=>{};let entered=()=>{};const started=new Promise<void>(resolve=>{entered=resolve;});
  const gate={prepare:async()=>{entered();await new Promise<void>(resolve=>{finish=resolve;});}};
  coordinator=new SessionCoordinator({loadLastConfirmed:async()=>saved,saveConfirmed:async s=>{saved=s;},clearSession:async()=>{saved=null;}},[qr],gate);
  const confirmation=coordinator.confirm(alice);await started;const old=coordinator.currentLease();const logout=coordinator.logout();expect(old.signal.aborted).toBe(true);
  finish();await expect(confirmation).rejects.toThrow('Stale');await logout;expect(events).toEqual([]);expect(saved).toBeNull();
});
test('invalid central/saved identity cannot mutate permissions or enter module startup',async()=>{
  expect(()=>coordinator.confirm({...alice,modules:['qr','qr']})).toThrow('Invalid confirmed');
  saved={...alice,company:'../other-company'};await expect(coordinator.restoreOffline()).rejects.toThrow('Invalid confirmed');expect(events).toEqual([]);
});
test('external authority change invalidates local work immediately and preserves the other session proof',async()=>{
 await coordinator.confirm(alice);await coordinator.activate('qr');const old=coordinator.currentLease();saved=bob;
 const stopping=coordinator.invalidateExternalSession();expect(()=>old.assertCurrent()).toThrow('Stale');await stopping;
 expect(saved).toEqual(bob);expect(events).toContain('qr:suspend:external-session-change');expect(events).toContain('qr:dispose');
 await expect(coordinator.restoreOffline()).rejects.toThrow('Authorization invalidated');expect(saved).toEqual(bob);
 await coordinator.confirm(bob);expect(coordinator.currentLease().session.user).toBe('bob');
});
