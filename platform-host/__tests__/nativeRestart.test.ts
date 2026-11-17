import { NativeModules } from 'react-native';
import metadata from '../host.runtime.json';
import { restartNativeHost } from '../adapters/restart.native';
const identity = {
  runtime: metadata.android.runtime,
  nativeFingerprint: metadata.android.nativeFingerprint,
  hostVersion: metadata.android.version,
  capabilitiesJson: JSON.stringify(metadata.android.capabilities),
};
test('native restart awaits resource disposal before scheduling VM replacement', async () => {
  const events: string[] = [];
  let finish!: () => void;
  NativeModules.LeaderHostInfo = {
    ...identity,
    reload: jest.fn(async () => {
      events.push('reload');
    }),
  };
  const pending = restartNativeHost(
    () =>
      new Promise<void>(resolve => {
        events.push('dispose');
        finish = resolve;
      }),
  );
  expect(events).toEqual(['dispose']);
  finish();
  await pending;
  expect(events).toEqual(['dispose', 'reload']);
});
test('cleanup failure or mismatched APK never schedules a runtime restart', async () => {
  const reload = jest.fn();
  NativeModules.LeaderHostInfo = { ...identity, reload };
  await expect(
    restartNativeHost(async () => {
      throw Error('cleanup failed');
    }),
  ).rejects.toThrow('cleanup failed');
  expect(reload).not.toHaveBeenCalled();
  NativeModules.LeaderHostInfo = {
    ...identity,
    nativeFingerprint: 'old',
    reload,
  };
  const dispose = jest.fn();
  await expect(restartNativeHost(dispose)).rejects.toThrow('mismatch');
  expect(dispose).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});
