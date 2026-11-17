# QR migration evidence and next cuts

Inspected APP256a73d / APIfa02b0c source. Existing implementation is retained. Public scanner/auth QR flows are separate from the QR management area. Delivery probes in platform-host/remotes are not a substitute for this feature.

## Working surface to port

- Native list/refresh/item actions/detail/create/edit/delete, server-generated scan-URL PNG and gallery saving. Web has dedicated list/form/analytics panels.
- Current form selects PHONE/LINK/TEXT/WHATSAPP/TELEGRAM/CONTACT; EMAIL exists on API but is disabled in UI. WIFI/SMS/GEO/BITCOIN are only advertised/disabled and rejected by API.
- API actual statuses ACTIVE/PAUSED/DELETED; client status type INACTIVE/EXPIRED is stale.
- Analytics periods/custom range, device timezone, hour/day/month series, QR/device/browser/location filters, zoom, calendars/heatmaps, scan feed; API CSV/stats/restore. Preset items are local component state, not durable saved server presets.
- Public scan URL controls pause/delete and analytics, then action-specific redirect/text/vCard. PNG must encode that URL, not silently bypass it by encoding raw payload. Separate loopback public URL is required until owner provides external resources.

## Verified source defects / constraints

- updateQRCode uses PATCH; API qrRouter registers only PUT for partial update. deleteQRCode uses that mismatched status helper. No method rewrite/alias found. Correct transport in fork with tests.
- CONTACT form submits firstName/lastName/contactAddress; API normalization reads name/address. Fix names/address preservation and escaping with typed payload tests; do not claim dropped data preserved.
- Detail Redis cache ran before ownership check and omitted actor. API7ee7399 now checks authoritative object before cache and separates actor/role keys. Public TEXT stored HTML is escaped with CSP. Legacy JWT/global ADMIN/absence of tenancy is still unsuitable for the target Company boundary.
- Image options lack effective bounds before PNG allocation; enforce before adopting the generator.
- QR AsyncStorage cache reads/writes are commented out. Do not claim old QR offline queue support; target drafts/cache must use scoped typed DB SDK.
- Replacements needed for Expo Router/tabs/icons, legacy file-system/media-gallery permissions, gradient/animation/skeleton dependencies; source source paths are inventoried in parity.md/module-graph.json. Android gallery and native navigation require device acceptance.

## Ordered implementation cuts

1. Bound PNG options and fix verified update/contact defects with real local tests.
2. Define exact typed QR payload/status/action/analytics contracts, current action rights and Company object policy. Keep business logic in QR repositories, not Core; no arbitrary cross-module SQL.
3. Fixture Company persistence + scoped CRUD/public scan/analytics and Central introspection for every protected online access; retain API compatibility windows.
4. QR factory/lifecycle remote with typed Company/DB/media/navigation ports, schema-owned drafts/cache and saved-rights offline behavior.
5. Compare native/Web scenarios, actual PNG/gallery/export/scan analytics/permissions/errors; remove replaced legacy only after parity/recovery evidence.

## Implemented compatibility corrections
Client now uses existing dev PUT for partial edit/status soft-delete. QR-owned pure vCard parser handles both legacy flat FN/ADR and structured/escaped N/ADR, folded lines and parameterized properties, preserving full names and URL colons. API counterpart retains existing stored VCard strings unchanged; new/current form fields firstName/lastName/contactAddress are represented. This is a correction to retained legacy feature paths, not migrated QR remote/business parity. Unknown legacy contact fields/complete editor round-trip still require target-module acceptance.

## Target QR schema1 draft repository (first domain slice)
platform-host/modules/qr owns the schema1 history and typed draft collection. Stores raw INCOMPLETE values for the seven verified server QR types; field/format/UTF-8 bounds reject malformed records, while incomplete phone/contact inputs remain intact. No old QR queue is invented/imported. Host must supply the same confirmed subject's DatabaseSession/lease; database scope is frozen/read-only metadata, not a SQL escape hatch.
Draft edits/discard require confirmed create_qr or update_qr based on stored document identity. Viewing uses confirmed view_qr or the corresponding edit action; module entitlement alone grants nothing. Changing an existing edit draft to a new-create draft cannot bypass its original update permission. Logout/revocation closes access without deleting bytes. CAS protects concurrent editor/discard. Filtered pages include a raw nextAfter cursor even if all rows on that page are unauthorized, preventing pagination loops.
4 actual SQLite scenario tests cover close/reopen, subject/company isolation, CAS conflicts, logout, rights narrowing/restore, invalid payloads and hidden-page cursor. This repository has no React/Expo/navigation/other business-module internals and does not enqueue an online submission. Native/Web QR remote screens, Company persistence/CRUD/public scan/analytics, galleries and full parity remain unfinished. It is not wired into the current delivery-probe host.

## Typed QR Company client
Target QR owns pure DTO/type/Company-port contracts and a bounded runtime decoder. Host injects only the Company client bound to its verified ACTIVE release; domain API has no URL, universal credential or SQL parameter. Supports actual JSON create(operationId), partial PUT(expectedRevision), status/delete/restore/get and bounded cursor pages. Rejects malformed commands before IO and invalid/duplicate/backward cursor/record responses before domain use; authorization/conflict/API-retirement/unavailable responses retain typed HTTP status. Contact input remains object-capable; server owns canonical normalization.
Actual cross-fork test uses APP ServiceRouter/Web HTTP/QR client against local Central/Company servers and PostgreSQL, including stable create receipt, null description, stale409, pause/delete/restore and two-page cursor. API fork owns that PG CI harness and pins the APP source; no peer app installation required. This is client/repository evidence, not native/Web screen or full QR parity. New contract extraction initially failed Node's extension-required runtime export; corrected and QR storage scenarios rerun.

## Client schema2: durable explicit create attempts
QR DB history retains base1 drafts and adds schema2 create-attempt collection without deleting/changing existing draft payloads. Before any create HTTP, canonical raw command+UUID operationId are committed locally with a draft revision assertion. Concurrent prepare converges on one identity; changed pending payload is sealed until reconciliation. No import-time worker, new offline login or background/offline submission is introduced.
A lost response/failed local acknowledgement leaves that identity pending. Retry uses the exact stored request; server's transaction receipt returns the original document. Acknowledgement and draft documentId update share one SDK transaction; latest local form edits survive. Unmatched status/type/revision/description cannot mark delivered. Pending create blocks draft discard; concurrent prepare/discard CAS cannot orphan the attempt. Permission narrowing/logout/offline block transmission without erasing pending data. Receipts remain even after local draft discard.
10 actual SQLite scenarios (including base1->2 copy, competing preparation/discard, disk-full acknowledgement, mismatch, lost reply/reopen and rights changes) pass. Actual cross-fork test also creates in PostgreSQL through APP client, intentionally loses response after commit, closes/reopens local SQLite and retries to the same single server document. These are storage/HTTP tests, not a browser/native UI/outbox scheduler claim. Schema2 rollback must respect current data compatibility; never restore old DB just to run schema1 code.

## First QR business factory/artifact (not yet host-wired)
QR contract2/schema2 factory and common RN Screen are implemented for the first subset: own list/status/pause/delete/independent restore plus explicit TEXT draft/create/retry. Factory construction/init does not start sync; activate starts bounded owned work, suspend aborts/awaits it, dispose clears observers without closing another feature's DB. Denial notifies host through a non-awaited callback to avoid lifecycle/coordinator deadlock. Missing host ports fail before create.
Business packaging is explicit profile=business, separate from delivery probes, exposes ./Module and requires minHost5/http2/moduleHost1/authActions1. Web is one154KiB immutable container; Android uses the complete verified28-file inventory. Package metadata/profile mismatch cannot relabel an old probe as business code. Existing default probe packages remain supported. This step proves compilation/contract/controller behavior, NOT actual business factory MF execution, screen host wiring or device QA.
The current screen subset does not replace retained full QR. Remaining: native/Web host adoption, actual browser/UI/API evidence, full create/edit forms/types/vCard preservation, PNG/public scan/gallery, analytics/stats/export/filters and measured UI acceptance. Non-TEXT drafts remain persisted/read-only; no fabricated controls/PNG/analytics. New local text form requires explicit draft save; this is not a claim that every unsaved keystroke survives process death.
