# Leader Product 2.0 standalone host

Incremental Android/Web platform PoC; legacy product is preserved in the parent directory. No Expo runtime/Router/Updates/config plugins in this host. React Native 0.88.1 / React 19.3.0, Re.Pack 5.4.4 / Rspack 1.7.12. Independent lockfile: run `npm ci` here.

- `npm start -- --port 8091`: Re.Pack development server. Original application's port 8081 is not used.
- `npm run bundle:android`: production JS through Re.Pack/Rspack, never Metro.
- `npm run build:web`: separate Rspack + React Native Web build, common App/semantic core. No storage parity claimed yet.
- `npm test -- --runInBand`, `npx tsc --noEmit`: mock/render and signed-release contract tests.
- Remote fixture builds: `LP2_REMOTE=qr npx react-native bundle --config rspack.remote.cjs --platform android --dev false --entry-file remotes/entry.js --bundle-output build/remotes/qr/index.bundle --assets-dest build/remotes/qr`; repeat with help in env and paths. Independent federation containers; no business parity claim.
- Native: set JAVA_HOME (JDK 21), ANDROID_HOME, optionally isolated GRADLE_USER_HOME; `node scripts/local-keystore.cjs`; then in android run `./gradlew :app:assembleRelease --no-daemon --max-workers=2 -PreactNativeArchitectures=x86_64` (emulator) or arm64-v8a for a physical Android target. Release-mode APK uses local debug signing ONLY, no publishing.

Identity is com.leaderproduct.app.fork / leaderproduct-fork. Verify APK badging before every install. No original package, Firebase registration, external endpoint or update channel. No emulator lifecycle/UI through adb. Only T3 device tools/agent-device.

Current acceptance: the Web host verifies and executes two real MF delivery containers, with signed private artifacts, account-scoped IndexedDB, coherent update/restart/LKG and offline restoration. Native trust/cache/SQLite/verified-file loader compile to fork APK version9, but native App remains a bootstrap probe: actual Android remote/UI/background acceptance is blocked by unavailable KVM/device. QR Company client/drafts and protected PG backend have separate contract evidence; QR/Help business screens are not migrated. See [current roadmap/evidence](../docs/leader-product-2/README.md) and [local Web pilot](../docs/leader-product-2/web-host-pilot.md).

Core recovery is independent of business DB initialization. Code rollback uses compatible CURRENT data, never silently restores an older DB. No business migration/recovery source is removed merely because it is old.

Sources: [Re.Pack migration](https://re-pack.dev/docs/migration-guides/metro), [Module Federation](https://re-pack.dev/docs/features/module-federation), [Android CLI](https://developer.android.com/tools/agents/android-cli). Exact versions are pinned in the lockfile. iOS acceptance is deferred.

Build immutable probe packages with `node scripts/packRemote.cjs qr 1.0.0` and `node scripts/packRemote.cjs help 1.0.0`; review build/inventories and build/immutable. `npm run test:remote-packages` exercises both builds, a one-remote update, host build isolation and corrupt-chunk rejection against real local storage. These directories are ignored build artifacts. The release-set schema has explicit format/platform and complete file inventory; API pilot uses the same shape. Runtime/native ABI gates are enforced. Actual verified browser execution is tested separately; native device execution remains pending.
