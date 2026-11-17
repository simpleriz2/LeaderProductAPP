import { createPlatformHost, type LocalHostProfile } from './platformHost';
import { getHostIdentity } from '../adapters/host.native';
import { createNativeTrust } from '../adapters/trust.native';
import { createSecureSessionStore } from '../adapters/secureSession.native';
import { createNativeHostSessionStore } from '../adapters/hostSession.native';
import { createNativeReleaseStorage } from '../adapters/releaseStorage.native';
import { createNativeSessionAuthority } from '../adapters/sessionAuthority.native';
import { createNativeSqliteDriver } from '../database/sqliteDriver.native';
import { createSerialGenerationLock } from '../database/generationFence';
import { createNativeCentralExchange } from '../adapters/central.native';
import { createNativeHttpTransport } from '../adapters/http.native';
import { createNativeArtifactTransport } from '../adapters/artifacts.native';
import { createNativeOperationId } from '../adapters/operationId.native';
/** No Expo/browser storage/fetch/Metro fallback. Native process/worker authority is a separate acceptance boundary. */
export async function createNativeHost(profile: LocalHostProfile) {
  const identity = getHostIdentity();
  if (
    !identity.capabilities.http.includes(3) ||
    !identity.capabilities.operationIds.includes(1)
  )
    throw Error('Native host revision10 required');
  const trust = createNativeTrust(profile.roots),
    sessionStore = createNativeHostSessionStore(
      createSecureSessionStore(trust),
    );
  try {
    return await createPlatformHost(profile, {
      identity,
      trust,
      sessionStore,
      storage: createNativeReleaseStorage(),
      driver: createNativeSqliteDriver(),
      authority: createNativeSessionAuthority(),
      generationLock: createSerialGenerationLock(),
      centralExchange: createNativeCentralExchange(),
      http: createNativeHttpTransport(),
      artifacts: createNativeArtifactTransport(),
      openFederation: (...args) => {
        const { openVerifiedNativeFederation } =
          require('../adapters/federation.native') as typeof import('../adapters/federation.native');
        return openVerifiedNativeFederation(...args);
      },
      createOperationId: createNativeOperationId(),
      bindSessionInvalidation: () => () => {},
      close: () => sessionStore.close(),
    });
  } catch (error) {
    sessionStore.close();
    throw error;
  }
}
