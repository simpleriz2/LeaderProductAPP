// Bundle-only acceptance entry: exercises native adapter dependency resolution, not device execution.
import {openVerifiedNativeFederation} from '../../adapters/federation.native';
Object.assign(globalThis,{LP2NativeLoaderAcceptance:openVerifiedNativeFederation});
