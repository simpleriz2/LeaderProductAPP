const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
for (const dev of ['0', '1']) {
  const config = JSON.parse(execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'public', '--json'], {
    encoding: 'utf8', env: { ...process.env, EXPO_NO_DOTENV: '1', LEADER_DEV_CLIENT: dev,
      EXPO_PUBLIC_UPDATE_CHANNEL: 'prod', EXPO_PUBLIC_OTA_UPDATE_URL: 'https://invalid.example/ota' },
  }));
  assert.equal(config.android.package, 'com.leaderproduct.app.fork');
  assert.equal(config.ios.bundleIdentifier, 'com.leaderproduct.app.fork');
  assert.equal(config.name, 'Leader Product 2.0 Fork');
  assert.equal(config.scheme, 'leaderproduct-fork');
  assert.equal(config.updates.enabled, false);
  assert.equal(config.updates.url, undefined);
  assert.equal(config.updates.checkAutomatically, 'NEVER');
  assert.equal(config.extra.eas, undefined);
  assert.ok(config.runtimeVersion.startsWith('fork-'));
}
console.log('Fork identity and legacy OTA isolation passed in dev/release configs');
