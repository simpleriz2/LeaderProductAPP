import { createSecureSessionStore } from './secureSession.native';
import type { HostSessionStore } from '../host/ports';
import type { Trust } from '../core/releaseSet';
import type { SignedOfflineSession } from '../core/offlineSession';
/** One native RN host only. This is NOT cross-process/worker authority fencing. */
export function createNativeHostSessionStore(
  base: ReturnType<typeof createSecureSessionStore>,
): HostSessionStore & { close(): void } {
  let epoch = 0,
    accepted: number | null = null,
    closed = false,
    tail: Promise<unknown> = Promise.resolve();
  const check = () => {
    if (closed) throw Error('Native session store closed');
  };
  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = tail.then(work);
    tail = next.catch(() => undefined);
    return next;
  }
  const read = async () => {
    check();
    const value = await base.loadLastConfirmed();
    check();
    return value;
  };
  return {
    loadLastConfirmed: read,
    peekLastConfirmed: read,
    async beginOnlineConfirmation() {
      check();
      const revision = ++epoch;
      accepted = null;
      return {
        async acceptOnlineGrant(signed: SignedOfflineSession) {
          check();
          if (revision !== epoch) throw Error('Superseded native confirmation');
          const session = await base.acceptOnlineGrant(signed);
          check();
          if (revision !== epoch) throw Error('Superseded native confirmation');
          accepted = revision;
          return session;
        },
      };
    },
    saveConfirmed(session) {
      check();
      const revision = accepted;
      return serialize(async () => {
        check();
        if (revision === null || revision !== epoch || accepted !== revision)
          throw Error('Native online confirmation ticket required');
        await base.saveConfirmed(session);
        check();
        if (revision !== epoch) throw Error('Superseded native confirmation');
      });
    },
    clearSession() {
      check();
      epoch++;
      accepted = null;
      return serialize(async () => {
        check();
        await base.clearSession();
      });
    },
    close() {
      closed = true;
      epoch++;
      accepted = null;
    },
  };
}
