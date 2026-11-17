import { createPlatformHost, type LocalHostProfile } from './platformHost';
import {
  openWebSessionStore,
  createWebSessionAuthority,
  bindWebSessionInvalidation,
} from '../adapters/offlineSession.web';
import { openWebReleaseStorage } from '../adapters/releaseStorage.web';
import { openVerifiedWebFederation } from '../adapters/federation.web';
import { createWebTrust } from '../adapters/trust.web';
import { createWebHttpTransport } from '../adapters/http.web';
import { createWebArtifactTransport } from '../adapters/artifacts.web';
import { createWebCentralExchange } from '../adapters/central.web';
import { createIndexedDbDriver } from '../database/indexedDbDriver.web';
import { createWebGenerationLock } from '../database/generationLock.web';
import runtime from '../host.runtime.json';
export type LocalWebProfile = LocalHostProfile;
export type { PlatformHostState as WebHostState } from './platformHost';
/** Browser implementation of the same host/session/release coordinator used by native. */
export async function createWebHost(profile: LocalWebProfile) {
  const trust = createWebTrust(profile.roots),
    sessionStore = await openWebSessionStore(trust);
  let storage;
  try {
    storage = await openWebReleaseStorage(trust);
  } catch (error) {
    sessionStore.close();
    throw error;
  }
  try {
    return await createPlatformHost(profile, {
      identity: {
        platform: 'web',
        host: runtime.web.version,
        runtime: runtime.web.runtime,
        capabilities: { http: [1, 2, 3] },
      },
      trust,
      sessionStore,
      storage,
      driver: createIndexedDbDriver(),
      authority: createWebSessionAuthority(sessionStore),
      generationLock: createWebGenerationLock(),
      centralExchange: createWebCentralExchange(),
      http: createWebHttpTransport(),
      artifacts: createWebArtifactTransport(),
      openFederation: openVerifiedWebFederation,
      createOperationId: () => crypto.randomUUID(),
      bindSessionInvalidation: (coordinator, onInvalidated) =>
        bindWebSessionInvalidation(sessionStore, coordinator, onInvalidated),
      close() {
        storage.close();
        sessionStore.close();
      },
    });
  } catch (error) {
    storage.close();
    sessionStore.close();
    throw error;
  }
}
