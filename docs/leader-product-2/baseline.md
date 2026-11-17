# Dev baseline — 2026-11-16

Environment/method: see README.md. Local logs for this run: /tmp/lp2-baseline (ephemeral, not a portable artifact). No application server, production resource, migration or external 1C operation was run.

| Check | APP | API |
| --- | --- | --- |
| npm ci from dev lockfile | exit 0, штатный postinstall patches | exit 0 |
| Prisma generate, fixture loopback DATABASE_URL | n/a | exit 0, Prisma 7.8.0; no DB connection/migration |
| TypeScript | npx tsc --noEmit, exit 0 | npm run type-check, exit 0 |
| Jest | npm run test:unit -- --runInBand: 292 suites, 2769 tests passed, 47.659s | 8 suites, 100 tests passed, 11.469s |
| Native release/device | NOT RUN: local Java/SDK unavailable; identity still legacy | n/a |

API Jest paths: clientOrderSubmissions, clientOrderSubmissionWorker, legacyOrderSubmission, orderIntegrity, clientOrdersExportIntegrity, trackingV2.ingest, auth.refresh-token-service, pushService (all __tests__/*.unit.test.ts).
APP full run includes both configured projects. Historical main responsive mock failures did not occur on this dev revision. Do not compare raw counts as coverage parity: dev differs substantially from main.

CI verification: both active workflow YAML files parsed with installed yaml library; exactly fork-checks.yml per repo, contents: read, only checkout/setup-node actions, no secrets, SSH, publishing, deployment, self-hosted runner, workflow_call/dispatch or scheduled trigger. Archived 7 APP + 6 API workflows compared byte-for-byte with base HEAD using git show. git diff --check clean. Hosted GitHub Actions execution is separate from these local checks.

Legacy Web: `EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL_DEV=http://127.0.0.1:3000 NODE_OPTIONS=--max-old-space-size=4096 npm run build:web -- --max-workers 2` — exit 0. Expo Router package-exports warnings use file-based resolution. This is the inherited Expo/Metro baseline, not the target Re.Pack acceptance.

## 2026-11-17 — fork identity / legacy update quarantine
Accepted identity: Leader Product 2.0 Fork, com.leaderproduct.app.fork (both dev/release), leaderproduct-fork. Separate fork Firebase file and package validation; original EAS project removed. Expo native OTA disabled with no URL, fork runtime prefix. Compile-time policy blocks startup/background/manual legacy OTA and APK check/telemetry regardless of environment overrides. Existing recovery implementation remains for review; its unit fixtures explicitly enable the legacy policy to keep verifying its behavior. This does not implement the replacement release-set updater.

`node scripts/checkForkIdentity.cjs`: passed dev/release with hostile prod channel/OTA URL overrides. Added to fork CI. `npx tsc --noEmit`: exit 0. Full APP Jest: 293 suites / 2770 tests passed (32.815s), including real fork-policy test asserting no legacy APK network requests. Initial run exposed one stale original-identity expectation in metadata CLI test; corrected to fork identity. No native artifact installed, no original app modified. Native generated manifest and release checks remain pending.

Toolchain installed outside repository at ~/.local/share/lp2-toolchain: Temurin JDK 17.0.21+9, Android command-line tools (archive SHA1 verified against Google's repository XML). New CLI bootstrap initially failed with connection refused; explicit curl download succeeded. SDK packages installation in progress; platform 37 name resolution needs follow-up. RAM available 21 GiB, disk 78 GiB at start; JS heap 4 GiB and serial tests.

## 2026-11-17 — standalone host / Re.Pack proof
New platform-host has independent package-lock (RN 0.88.1, React 19.3.0, Re.Pack 5.4.4, Rspack 1.7.12); no Expo runtime dependency. Native source tracked separately from legacy generated Android. Host and two independent Module Federation container builds succeeded; fixture remotes have no business parity claim and are not yet executed. Shared versions strict; host has no remote URLs before trust/activation integration. Web built independently through Rspack + RN Web. Read platform-host/README.md for reproducible commands and scope.

Local JDK 21 + SDK/NDK/CMake installed in ~/.local/share/lp2-toolchain; isolated Gradle cache; HTTP proxy configured only there after first run waited on network. assembleRelease x86_64: BUILD SUCCESSFUL in 5m18s, 153 tasks. Gradle createBundleReleaseJsAndAssets log explicitly confirms Rspack 1.7.12. APK has com.leaderproduct.app.fork, Leader Product 2.0 Fork, x86_64; apksigner v2 verified. SHA256 599d68b884130298667f7cd9391f9de1d7c7f46ec97bb4b58d76fb7ca6ca3b44. Artifact: release-artifacts/lp2-host-x86_64-release-local.apk (ignored local output). Local debug signing, not a publishable production release.

Host TypeScript passed; host Jest 2 suites / 15 tests passed. Includes actual Ed25519 signature verification, tampering/untrusted keys, company/host/runtime/API/entitlement rejection before download, two company pinned releases, path/duplicate-module rejection, digest/download/storage/migration/commit failure preserving active pointer. Storage is an in-memory unit adapter; native/Web crash persistence, DB migration, rollback and remote execution remain unproved.

Device list now reports no devices; open leader-126-qa2/emulator-5556 returned "No device emulator-5556 ... Call device_list for current ids". Followed advice once: devices still empty. No installation/UI/device QA. No /dev/kvm locally, so no local accelerated emulator assumed. Continue independent local tasks; device acceptance is pending.

AST inventory: scripts/audit/moduleGraph.cjs => 757 files / 3836 import edges / 75 cross-feature imports, report module-graph.json. Static, normalized paths with extensions/index/platform unresolved; not runtime reachability proof. Further native/SDK/route parity inventory remains pending.

## 2026-11-17 — Session/Module coordinator contract
core/sessionCoordinator.ts adds serialized confirm/restoreOffline/goOffline/activate/logout transitions, invalidatable leases/AbortSignal, module init/activate/suspend/dispose and a credential-only persistence port. No business imports and no automatic activation from entitlements. Account switches clean old resources before enabling a new identity; cleanup failure blocks access. Rights reconfirmation removes revoked modules; cached offline restoration is available only from last-confirmed storage. Logout/revoke clears stored authorization; persistence port has no business-data deletion API. Partial module init is tracked for cleanup. Superseded queued login is rejected after newer logout.

Host Jest 3 suites / 21 tests and TypeScript pass. These are coordinator/in-memory credential-port tests, not proof of native worker termination, secure credential storage or preservation of existing SQLite data. Coordinator is not yet wired into legacy AuthProvider; existing recovery remains unchanged. Pending adapter integration and native/background/device evidence.

GitHub Actions confirmed success for APP b72204c4a83bfbb8b5480fb660a1ef091753da8f (run 44024524231) and API 53d3c2eab8b2c437d69684e3db113c83e83bb6f9 (read via gh run list); former fork identity and quarantine pushes also passed.

## 2026-11-17 — durable local recovery proof
platform-host/dev/recovery uses real Node SQLite 3.53.4, immutable disk blobs, fsync+rename staging and SQLite FULL/WAL transaction for current/LKG code+data pointers. Bootstrap metadata DB is separate from data generations. Migration prepares a SQLite backup into a new generation; fixture drafts/outbox receipt/Help cursor survive migration and injected failure. Original databases are never opened.

`npm run test:recovery`: 5 integration tests passed (1.442s). Child process exits abruptly before/after commit, then reopened metadata + signature/digest/data checks prove one complete set. Updating QR keeps Help digest unchanged. Corrupt cached bytes are rejected. Compatible code rollback preserves CURRENT data generation, including a draft created after update; rollback across incompatible schema is denied without deleting data. Existing domain migration history/idempotency protocols are not replaced by harness fixture tables. Signed payload is now retained in activation metadata for boot verification.

`npm test -- --runInBand`: 3 host suites / 21 tests pass; TypeScript passes. CI includes recovery harness. This is disk/process-crash proof on local Linux, not Android/Web filesystem/DB adapters, power-loss proof, actual RN remote execution or production recovery. Native/Web platform bindings, GC/retention, signed kill switch/key rotation and bootstrap recovery screen remain pending. APP lifecycle CI c066a7c also confirmed successful.
