# FA-WORLD-033 — Server-side world synchronization foundation

Status: implementation committed; CI validation pending.
Runtime: Cloudflare Workers + D1.
Activation: opt-in; `VITE_WORLD_SYNC_ENABLED` defaults to disabled.

## 1. D1 persistence model

Migration: `backend/migrations/002_world_sync.sql`.

- `world_player_presence`: one current row per player, zone, tile, revision and heartbeat timestamp.
- `world_zone_state`: JSON zone snapshot with monotonic revision.
- `world_event_log`: append-only movement event records.
- `backend/schema.sql` includes these tables for fresh database bootstrap.

## 2. Worker API

| Route | Purpose |
|---|---|
| `GET /world/:zoneId/snapshot` | Current zone state, recent active presence and last 50 events |
| `POST /world/:zoneId/join` | Create presence or restore existing same-zone server position |
| `POST /world/:zoneId/move` | Revision-checked cardinal step and movement event |
| `POST /world/:zoneId/heartbeat` | Refresh 90-second presence expiry |
| `POST /world/:zoneId/state` | Compare-and-swap zone JSON state, 32 KiB maximum |

Movement is committed using a D1 batch: the player row updates only when player ID, zone, source tile and expected revision all match; the event insert is conditioned on the resulting revision. Stale concurrent movement returns HTTP 409 and the current server presence.

Zone state uses a compare-and-swap revision. Competing writers cannot silently overwrite a newer revision.

## 3. Browser integration

- `web/src/lib/worldSync.ts` serializes client requests per player.
- A zone join restores the server tile when an existing same-zone presence is available.
- Consecutive local tile changes are queued, revisioned and sent in order.
- A 409 conflict is surfaced to the UI and is not retried by overwriting server state.
- Heartbeats run every 15 seconds.
- The existing Supabase Realtime presence remains available for live display.
- API sync is opt-in until D1 migration and Worker deployment have been completed.

## 4. CI and rollout

- Backend TypeScript check: GitHub Actions workflow `Backend check`.
- Web tests/build: GitHub Actions workflow `Web build`.
- Migration must be applied to the existing D1 database before enabling the feature.
- Deploy the Worker before setting `VITE_WORLD_SYNC_ENABLED=true`.
- The current pull request workflows do not deploy production.

## 5. Security and authority limits

This is a persistence and concurrency foundation, not a complete authoritative MMO simulation.

- Player IDs are browser-generated and are not authenticated.
- Movement validates 64×64 bounds, cardinal adjacency, source coordinates and optimistic revision; it does not yet validate generated terrain, bridge links, zone access, movement speed or combat state.
- Zone JSON writes are not yet restricted by server-side schema, roles or domain-specific authorization.
- CORS is permissive; rate limiting, abuse controls and authenticated sessions remain required.
- No client should treat a successful write as proof that gameplay rules have been fully enforced.

## 6. Next

FA-WORLD-034: authoritative terrain/bridge validation, authenticated identity, zone-state schemas and rate limiting; then add remote snapshot subscription and reconciliation.
