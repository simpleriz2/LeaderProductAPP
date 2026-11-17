# Leader Product 2.0 standalone host

Incremental Android/Web platform PoC; legacy product is preserved in the parent directory. No Expo runtime/Router/Updates/config plugins in this host. React Native 0.88.1 / React 19.3.0, Re.Pack 5.4.4 / Rspack 1.7.12. Independent lockfile: run `npm ci` here.

- `npm start -- --port 8091`: Re.Pack development server. Original application's port 8081 is not used.
- `npm run bundle:android`: production JS through Re.Pack/Rspack, never Metro.
- `npm run build:web`: separate Rspack + React Native Web build, common App/semantic core. No storage parity claimed yet.
- `npm test -- --runInBand`, `npx tsc --noEmit`: mock/render and signed-release contract tests.
- Remote fixture builds: `LP2_REMOTE=qr npx react-native bundle --config rspack.remote.cjs --platform android --dev false --entry-file remotes/entry.js --bundle-output build/remotes/qr/index.bundle --assets-dest build/remotes/qr`; repeat with help in env and paths. Independent federation containers; no business parity claim.
- Native: set JAVA_HOME (JDK 21), ANDROID_HOME, optionally isolated GRADLE_USER_HOME; `node scripts/local-keystore.cjs`; then in android run `./gradlew :app:assembleRelease --no-daemon --max-workers=2 -PreactNativeArchitectures=x86_64` (emulator) or arm64-v8a for a physical Android target. Release-mode APK uses local debug signing ONLY, no publishing.

Identity is com.leaderproduct.app.fork / leaderproduct-fork. Verify APK badging before every install. No original package, Firebase registration, external endpoint or update channel. No emulator lifecycle/UI through adb. Only T3 device tools/agent-device.

No remotes are executed yet: host has federation shared libraries but no URLs until trusted artifact storage, native verification and activation/recovery are integrated. core/releaseSet.ts defines verification/activation ports, validated with real Node Ed25519 and in-memory storage/failure injection. It is not a native crypto/filesystem/database implementation. prepareData must isolate a data generation; commit must atomically switch code+data pointers and preserve LKG; discard must never delete committed artifacts. Code rollback cannot destructively roll back a database.

Sources: [Re.Pack migration](https://re-pack.dev/docs/migration-guides/metro), [Module Federation](https://re-pack.dev/docs/features/module-federation), [Android CLI](https://developer.android.com/tools/agents/android-cli). Exact versions are pinned in the lockfile. iOS acceptance is deferred.
