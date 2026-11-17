# Parity register — source scenarios, not acceptance claims

Baseline is origin/dev; source existence and passing mocks do not prove runtime integration. New host currently shows bootstrap only. Every migrated scenario must keep Android and Web evidence distinct. No row below is accepted as migrated.

| Area | Verified source entry/evidence | Required parity acceptance |
| --- | --- | --- |
| Auth/profile/permissions | app/index.tsx, context/AuthContext.tsx, profile routes; refresh-token API units | Online login, cached offline restore, refresh/revoke/logout/account switch; separate tenant/user data; role/module rights |
| QR | services/qrcodes index/form/analytics, components/QRcodes, utils/qrService.ts, API src/routes/qr.ts | List/detail/create/edit/delete, analytics, generated image saving/sharing, errors/permissions; navigation/files/media/icon replacement |
| Transport tasks | services/transport_tasks/index.tsx, src/features/transportTasks | Task list, route editing/sorting, map and assignments; disabled tasks card is not removal evidence |
| Appeals | services/appeals routes, components/Appeals, API src/routes/appeals.ts | List/create/detail/chat/files/participants/status/labor/analytics, authorized object subscriptions |
| Tracking/maps | tracking route, utils/trackingV2Service.ts and native tracking plugin | Foreground/background ingestion, permissions/restarts/legacy encrypted queue drain/migration, map replay; actual device required |
| Stock | services/stock_balances, src/features/stockBalances/StockProductsScreen.tsx | Products/filter/search/gallery/stock; remove verified imports from clientOrders internals before independent delivery |
| Catalog/orders/1C | src/features/productCatalog, clientOrders/offline, utils/clientOrdersService.ts; API submission/export modules | Offline datasets/drafts/deliveries/revisions/hash/retry/receipt matching/legacy recovery/idempotency. 1C fixture only here; real export investigation belongs to parent |
| Help/AI | src/features/help, modules/leader-help-input/android; API src/modules/help | Chat/history/files/voice/input geometry/AI/cursors/drafts/outbox/replay; delegated company API access; native Kotlin migration required |
| Notifications/files | NotificationHost, utils/pushNotifications.ts; API pushService.ts, routes/notifications.ts/files.ts | Both-side transport registration, foreground/background/cold start, permission/revoke/account switch, protected download/upload |
| Admin | app/(main)/admin + src/features/admin | User/role/service/department administration; release-set administration replaces old OTA/APK protocol with exact company assignments |
| Personal 1C/mail | API src/modules/onec-personal exists; src/modules/personal-mail is ABSENT on current dev (historical main audit had it) | Investigate dev/main history and original route reachability as an explicit feature gap; no automatic main merge or assumption that mail is dead. Exercise fixture contracts before parity; never call production |
| Public order | public-order standalone source | Public link entry, catalog/order payload, files, location/delivery, backend validation and access limits, isolated Web build |

Detailed static route/Expo-package inventory: expo-and-routes.md; import evidence: module-graph.json. Every inherited Expo SDK component has explicit legacy/pending status; target host currently has none. Zero static JS imports does not prove a native/config-plugin package dead. Recovery/migration histories remain protected until replacement evidence exists.

Next sequence: integrate secure session and service routing; durable native/Web storage/crypto/bootstrap adapters; trusted remote execution and update/recovery; move QR using platform navigation/files/media ports; then graph-driven independent areas. Existing source is retained until parity evidence. Stage 2 device profiling and Stage 3 external acceptance remain unfulfilled; no performance numbers or external SaaS readiness claimed.
