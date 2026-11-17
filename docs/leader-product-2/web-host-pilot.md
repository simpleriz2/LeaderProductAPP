# Local Web host pilot

This is stage1 platform acceptance with QR/Help delivery probes, not working QR management/Help business parity or deployed SaaS. It uses only temporary loopback Central/Company/artifact servers, generated fixture identities/keys, separate browser data and local immutable build files.

From LeaderProductAPP/platform-host:

```sh
LP2_API_PILOT_ROOT=/home/extectick/.t3/projects/lp-ms-f/LeaderProductAPI npm run dev:pilot-web
```

The launcher prints its own loopback Web URL. Fixture users: alice (alpha, QR+Help), carol (alpha, QR), bob (beta, QR). Fixture password: fixture-only. There are no production credentials. Alpha starts QR1/Help1; Beta QR2. Open each permitted probe to confirm the set healthy.

Launcher stdin commands:

- update: assign Alpha QR2/Help1; use Check updates, restart, then explicit saved offline session or sign-in.
- bad: assign signed QR3/Help1 with deliberate React startup failure; recovery restores last explicitly healthy code, retaining current data generation; restart and choose saved offline session.
- restore: assign Alpha QR1/Help1.
- central-offline: stop ONLY this fixture Central; already saved browser account can open its verified cached set.
- quit / Ctrl+C: stop owned servers and delete the launcher's own temporary build/profile directory. Immutable probe build files remain in ignored platform-host/build.

A launcher restart creates new ephemeral signing keys/endpoints; it is not a persistent Central recovery test. Browser origin/storage lifetime and offline HTML shell are separate requirements. The default `npm run build:web` has no local profile or network endpoints. LP2_HOST_PROFILE accepts only a validated local profile; LP2_WEB_OUTPUT is an explicit build-tool output override, never a product endpoint setting.

Automated acceptance:

```sh
LP2_API_PILOT_ROOT=/home/extectick/.t3/projects/lp-ms-f/LeaderProductAPI npm run test:web-host
```

The runner uses its bundled Playwright Chromium, private temporary persistent profiles, loopback-only request routing and disabled core dumps. CI installs the pinned browser; locally set PLAYWRIGHT_BROWSERS_PATH and the isolated Linux library prefix when using this workspace's owned toolchain. No preview tab, existing browser session or device is reused. The six acceptance cases cover real UI startup/update/React failure rollback/account switch/offline restart, paused/corrupt download, profile rejection/default no-network state, confirmed revocation and revocation during download.

Remaining before business adoption: native UI/device execution, complete platform adapters, actual QR CRUD/generation/analytics and Help/tracking/orders parity, persistent identity/keys/licenses/company release variants/API compatibility, secure online refresh, production artifact/key operations and external acceptance after owner provisions resources. No publishing/deployment workflow is enabled.
