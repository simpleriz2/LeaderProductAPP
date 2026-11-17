// Compile-only: shared host + native adapters. No claim of device execution from this bundle.
import { createNativeHost } from '../../host/nativeHost';
Object.assign(globalThis, { LP2NativeHostAcceptance: createNativeHost });
