import { NativeModules } from 'react-native';
import { getHostIdentity } from './host.native';
/** Promise confirms scheduling, not completion: the old VM is destroyed by reload. */
export async function restartNativeHost(dispose: () => Promise<void>) {
  const identity = getHostIdentity();
  if (
    !identity.capabilities.hostReload?.includes(1) ||
    typeof NativeModules.LeaderHostInfo?.reload !== 'function'
  )
    throw Error('Matching restart-capable fork APK required');
  await dispose();
  await NativeModules.LeaderHostInfo.reload();
}
