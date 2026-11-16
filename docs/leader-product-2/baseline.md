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
