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
