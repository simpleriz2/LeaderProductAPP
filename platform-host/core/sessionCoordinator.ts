import {snapshotConfirmedSession} from './confirmedSession.ts';
/** Auth reports confirmed identity; modules own business work. No business imports. */
export type ConfirmedSession = { company: string; user: string; modules: readonly string[]; confirmation: string };
export type SessionLease = { session: ConfirmedSession; online: boolean; signal: AbortSignal; assertCurrent(): void };
export interface SessionStore {
  loadLastConfirmed(): Promise<ConfirmedSession | null>;
  saveConfirmed(session: ConfirmedSession): Promise<void>;
  /** Clears credentials/rights only. Must never delete drafts, outbox, data or cursors. */
  clearSession(): Promise<void>;
}
export interface ModuleLifecycle {
  id: string;
  requiresOnline: boolean;
  init(lease: SessionLease): Promise<void>;
  activate(): Promise<void>;
  suspend(reason: string): Promise<void>;
  dispose(): Promise<void>;
}
export interface SessionPreparation {
  /** Verify/prepare the assigned or offline installed release BEFORE any business module init. */
  prepare(lease: SessionLease): Promise<void>;
}
export class SessionCoordinator {
  private session: ConfirmedSession | null = null;
  private online = false;
  private prepared = false;
  private authorizationInvalidated = false;
  private blocked = false;
  private epoch = 0;
  private controller = new AbortController();
  private running = new Map<string, ModuleLifecycle>();
  private desired = new Set<string>();
  private queue: Promise<unknown> = Promise.resolve();
  private readonly store: SessionStore;
  private readonly modules: readonly ModuleLifecycle[];
  private readonly preparation: SessionPreparation;
  constructor(store: SessionStore, modules: readonly ModuleLifecycle[], preparation: SessionPreparation) {
    this.store=store;this.modules=modules;this.preparation=preparation;
    if(!preparation?.prepare)throw Error('Session release preparation is required');
    if(new Set(modules.map(m => m.id)).size !== modules.length) throw Error('Duplicate module');
  }
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work); this.queue = next.catch(() => undefined); return next;
  }
  private invalidate() { this.prepared=false;this.epoch++; this.controller.abort(); return this.epoch; }
  private async stop(reason: string) {
    const errors: unknown[] = [];
    for(const [id, module] of [...this.running].reverse()) {
      try { await module.suspend(reason); await module.dispose(); this.running.delete(id); }
      catch(error) { errors.push(error); }
    }
    this.session = null;
    this.blocked = errors.length > 0;
    if(errors.length) throw Error('Module cleanup incomplete; account access blocked');
  }
  private lease(): SessionLease {
    if(!this.session || this.blocked) throw Error('No usable session');
    const epoch = this.epoch, signal = this.controller.signal;
    return { session: this.session, online: this.online, signal, assertCurrent: () => {
      if(signal.aborted || epoch !== this.epoch || this.blocked) throw Error('Stale session lease');
    } };
  }
  /** Available to host preparation/recovery; does not authorize business module startup itself. */
  currentLease(): SessionLease { return this.lease(); }
  private async prepare() {
    const lease=this.lease();
    await this.preparation.prepare(lease);lease.assertCurrent();this.prepared=true;
  }
  private async start(id: string) {
    const lease = this.lease();
    if(!this.prepared)throw Error('Session release is not ready');
    if(!lease.session.modules.includes(id)) throw Error('Module not entitled');
    const module = this.modules.find(m => m.id === id);
    if(!module) throw Error('Unknown module');
    if(module.requiresOnline && !this.online) return;
    if(this.running.has(id)) return;
    // Track before init: partial initialization also requires cleanup on failure.
    this.running.set(id, module);
    try { await module.init(lease); lease.assertCurrent(); await module.activate(); lease.assertCurrent(); }
    catch(error) { this.invalidate(); await this.stop('activation-failed'); throw error; }
  }
  /** Called only after online Central confirmation. No offline login method exists. */
  confirm(confirmed: ConfirmedSession): Promise<void> {
    const session = snapshotConfirmedSession(confirmed);
    const revision = this.invalidate();
    return this.serialize(async () => {
      if(revision !== this.epoch) throw Error('Superseded session transition');
      const sameUser = this.session?.company === session.company && this.session?.user === session.user;
      await this.stop('confirmation');
      if(revision !== this.epoch) throw Error('Superseded session transition');
      if(!sameUser) this.desired.clear();
      await this.store.saveConfirmed(session);
      if(revision !== this.epoch) throw Error('Superseded session transition');
      this.authorizationInvalidated = false;
      this.session = session; this.online = true; this.controller = new AbortController();
      await this.prepare();
      for(const id of [...this.desired]) if(session.modules.includes(id)) await this.start(id); else this.desired.delete(id);
    });
  }
  /** Offline restoration reads only the last saved confirmed identity, never entered credentials. */
  restoreOffline(): Promise<void> {
    const revision = this.invalidate();
    return this.serialize(async () => {
      if(revision !== this.epoch) throw Error('Superseded session transition');
      await this.stop('offline-restore'); this.desired.clear();
      if(this.authorizationInvalidated) throw Error('Authorization invalidated; login requires Central confirmation');
      const saved = await this.store.loadLastConfirmed();
      if(revision !== this.epoch) throw Error('Superseded session transition');
      if(!saved) throw Error('First login requires Central connection');
      this.session = snapshotConfirmedSession(saved); this.online = false; this.controller = new AbortController();
      await this.prepare();
    });
  }
  goOffline(): Promise<void> {
    const revision = this.invalidate();
    return this.serialize(async () => {
      if(revision !== this.epoch) throw Error('Superseded session transition');
      const previous = this.session;
      await this.stop('offline');
      if(revision !== this.epoch) throw Error('Superseded session transition');
      if(!previous) return;
      this.session = previous; this.online = false; this.controller = new AbortController();
      await this.prepare();
      for(const id of this.desired) await this.start(id);
    });
  }
  activate(id: string): Promise<void> { return this.serialize(async () => { await this.start(id); this.desired.add(id); }); }
  logout(reason: 'logout' | 'revoked' = 'logout'): Promise<void> {
    this.authorizationInvalidated = true;
    this.invalidate();
    return this.serialize(async () => {
      this.desired.clear();
      // Invalidate persisted authorization even if a broken module refuses cleanup.
      try { await this.store.clearSession(); } finally { await this.stop(reason); }
    });
  }
}
