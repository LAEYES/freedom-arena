# Freedom Arena — free backend

Production target: Cloudflare Workers + D1.

- Worker API: `backend/worker.ts`
- D1 bootstrap schema: `backend/schema.sql`
- Incremental world-sync migration: `backend/migrations/002_world_sync.sql`
- Wrangler config: `backend/wrangler.toml`
- The browser must never receive a Cloudflare secret.
- Protected API routes require Supabase asymmetric JWT verification and the FA-WORLD-035 D1 rate-limit migration.

## First deployment

From `backend/`:

```bash
npx wrangler login
npx wrangler d1 create freedom-arena
```

Copy the returned database UUID into `wrangler.toml` in place of
`REPLACE_WITH_D1_DATABASE_ID`.

Then initialize the remote schema and deploy:

```bash
npx wrangler d1 execute freedom-arena --remote --file=./schema.sql
npx wrangler deploy
```

For an existing database that already has the `players` table, apply only the new world-sync migration:

```bash
npx wrangler d1 execute freedom-arena --remote --file=./migrations/002_world_sync.sql
```

The migration adds:

- `world_player_presence`: per-player zone, tile, heartbeat and optimistic revision;
- `world_zone_state`: revisioned JSON snapshot for zone-owned state;
- `world_event_log`: append-only movement event records.

## World synchronization API

- `GET /world/:zoneId/snapshot`: zone state, recent player presence and the last 50 world events.
- `POST /world/:zoneId/join`: initialize or refresh a player's zone presence.
- `POST /world/:zoneId/move`: cardinal adjacent movement guarded by source coordinates and expected player revision; updates presence and appends a movement event in one D1 batch.
- `POST /world/:zoneId/heartbeat`: refresh presence expiry.
- `POST /world/:zoneId/state`: compare-and-swap zone JSON state, capped at 32 KiB.

The web client keeps this integration disabled by default. After applying the schema and deploying the Worker, enable it in the Vite build with `VITE_WORLD_SYNC_ENABLED=true` and set `VITE_API_URL` to the Worker URL.

The movement endpoint validates sector bounds, cardinal adjacency, source tile and revision, and recomputes terrain walkability plus the deterministic one-cell bridge rule on the Worker. Client/server terrain parity is tested across all 4096 cells. FA-WORLD-035 now validates Supabase ES256/RS256 bearer JWTs against the configured project JWKS, binds player IDs to JWT subjects, and rate-limits each authenticated subject to 60 requests/minute per route family. The new migration `003_fa_world_035_security.sql` is mandatory; throttling fails closed if it is absent. Configure Worker vars `SUPABASE_URL` and `SUPABASE_JWT_ISSUER` (exactly `${'${SUPABASE_URL}'}/auth/v1`) and use an asymmetric Supabase signing key. Legacy HS256 signing secrets are unsupported and must never be placed in browser code or Worker vars.

Full client writes to `/player` and `/world/:zoneId/state` now return 403 until server-owned command/reducer endpoints exist. Player reads are owner-only. World snapshots are readable by authenticated users; private-zone ACLs are not yet implemented. This reduces client-side state forgery but is not complete production anti-cheat infrastructure.

Cloudflare documents `d1 create`, remote `d1 execute`, and `wrangler deploy` as the standard commands for this flow.

## GitHub Actions

For CI/CD, Cloudflare's official GitHub Actions flow uses the repository secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then runs
`cloudflare/wrangler-action@v3`.

Do not commit either credential to Git.

After the Worker is deployed, set the GitHub repository variable
`VITE_API_URL` to its public Worker URL. The Pages workflow already passes that
variable into the Vite build.

## Security

The current API uses a browser-generated player ID and is suitable for development
and prototype persistence. It is **not anti-cheat authentication**: a client can
currently submit arbitrary player state or zone JSON. Before treating the API as
production multiplayer infrastructure, add authenticated sessions, server-side
terrain/bridge validation, schema validation for zone mutations, rate limits and
abuse controls. Presence records expire from snapshots after 90 seconds without a heartbeat.


## FA-WORLD-035 security rollout

Apply the security migration before deploying the Worker:

```bash
npx wrangler d1 execute freedom-arena --remote --file=./migrations/003_fa_world_035_security.sql
```

Set Worker variables in the Cloudflare dashboard (or via Wrangler vars) without exposing signing secrets:

- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_JWT_ISSUER`: exact value `SUPABASE_URL/auth/v1`.

Supabase must issue asymmetric ES256 or RS256 access tokens and publish the corresponding public JWK set at `/.well-known/jwks.json`. The Worker fails closed if configuration, JWKS retrieval, signature, issuer, audience, or expiry validation fails. No deployment is performed by this PR.
