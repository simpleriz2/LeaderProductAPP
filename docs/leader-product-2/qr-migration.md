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
