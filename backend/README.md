# Freedom Arena — free backend

Production target: Cloudflare Workers + D1.

- Worker API: `backend/worker.ts`
- D1 bootstrap schema: `backend/schema.sql`
- Incremental world-sync migration: `backend/migrations/002_world_sync.sql`
- Security migration: `backend/migrations/003_fa_world_035_security.sql`
- Authoritative command migration: `backend/migrations/004_fa_world_036_commands.sql`
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
- `POST /world/:zoneId/state`: disabled (403); zone state must be changed by future server-owned reducers.
- `POST /world/:zoneId/command`: accepts only a combat command ID; the Worker computes the outcome and applies XP, victories, resources and threat changes. Repeated command IDs return the original result without applying rewards twice.

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


## FA-WORLD-036 authoritative combat

Apply migration 004 after migrations 002 and 003:

```bash
npx wrangler d1 execute freedom-arena --remote --file=./migrations/004_fa_world_036_commands.sql
```

Authenticated clients call `POST /world/:zoneId/command` with only:

```json
{ "commandId": "client-generated-unique-id-0001", "type": "combat" }
```

The client cannot submit a victory flag, enemy level, XP, resources, or damage. The Worker obtains the authenticated subject, verifies that the player is present in the requested zone, computes the encounter outcome using server-side randomness and the stored player level, then applies the result and records the command in a D1 batch. The command ID is an idempotency key; retries return the stored result. This is a minimal vertical slice, not a complete combat simulation: enemy AI, equipment-derived stats, PvP rules, loot tables and anti-collusion controls remain future work.


## FA-WORLD-037 combat simulation

The combat resolver is a pure server-side module in `combatEngine.ts`. It loads the equipped card from the authenticated player's D1 record; the request body cannot provide combat stats, actions, enemy parameters, rolls or rewards. Card values are bounded before use. The simulation uses server-generated random rolls, speed-based turn order, normal/heavy attacks, a periodic enemy guard, a player skill that exposes the enemy, and a hard 12-round cap. The complete combat log and computed reward are persisted in the existing idempotent command outcome.

Run the backend checks and combat tests from `backend/`:

```bash
npm run check
npm test
```

This remains a PvE prototype. It does not yet implement equipment slots beyond one equipped card, card-specific skill definitions, persistent health, status-effect catalogues, PvP, loot tables, inventory transactions, private-zone ACLs or edge-level DDoS protection. No migration is required for FA-WORLD-037 because the existing `players.cards` / `equipped_card_id` columns and `world_command_log.outcome_json` store the required data.


## FA-WORLD-038 persistent health and recovery

For an existing database, apply migration 005 after migrations 002–004:

```bash
npx wrangler d1 execute freedom-arena --remote --file=./migrations/005_fa_world_038_health.sql
```

Fresh databases receive `players.current_hp` and `world_rest_log` from `schema.sql`. Combat now carries the persisted HP forward and writes remaining HP atomically with XP, victories, resources, threat and the idempotent combat result. A player at zero HP cannot initiate another combat, preventing repeated defeat rewards. Recovery uses `POST /world/:zoneId/rest` with `{ "commandId": "client-generated-unique-id-0002" }`; the server verifies zone presence, charges one world resource, restores HP to the maximum derived from the player's level and equipped card, and records the rest command so retries cannot charge twice. Rest is not available at full health.

The API client must apply migration 005 before using the updated Worker. No remote migration or deployment is performed by this change.


## FA-WORLD-039 card abilities, effects and resistances

For existing D1 databases, apply migration 006 after migration 005:

```bash
npx wrangler d1 execute freedom-arena --remote --file=./migrations/006_fa_world_039_status_effects.sql
```

Fresh databases include `players.status_effects`. Card records may optionally define a bounded `ability` object (`effect`: `burn`, `poison`, `weaken`, `expose`, `shield` or `regeneration`; `potency` is clamped server-side) and a `resistances` array containing supported status identifiers (`burn`, `poison`, `weaken`). The Worker continues to load all card data from the authenticated player's D1 row; clients cannot supply ability parameters or combat rolls to the command endpoint. Burn/poison deal damage over subsequent rounds, weaken reduces enemy attack, expose amplifies the next hit, shield absorbs damage, and regeneration restores health. Enemy heavy attacks can inflict a short burn; equipped-card resistance prevents it. Player status effects are normalized, capped in count/duration/potency and persisted with the combat result. A successful rest clears active negative statuses.

Combat test coverage includes card abilities, resistance and bounded status persistence. Apply migration 006 before deploying this Worker revision. No migration or deployment is executed by this PR.


## FA-WORLD-040 multi-slot equipment

For existing D1 databases, apply migration 007 after migrations 002–006:

```bash
npx wrangler d1 execute freedom-arena --remote --file=./migrations/007_fa_world_040_equipment.sql
```

The player loadout contains four slots: `weapon`, `armor`, `accessory1` and `accessory2`. Each slot references a card already present in the authenticated player's stored inventory. A card cannot occupy two slots simultaneously. If a card declares a `slot`, the server enforces that compatibility; cards without a declared slot remain backward-compatible. Existing `equipped_card_id` values are interpreted as the weapon slot until the new loadout is saved.

Authenticated clients equip or unequip with `POST /world/:zoneId/equip`:

```json
{ "commandId": "equip-command-id-000001", "slot": "armor", "cardId": "card-armor-01", "expectedRevision": 0 }
```

Set `cardId` to `null` to unequip. The server checks ownership, zone presence, slot compatibility, duplicate use and the expected loadout revision. D1 stores the loadout update and idempotency record in one batch. A stale revision returns HTTP 409; clients should reload the loadout and retry with a new command ID. The command never accepts client-supplied stats.

Combat aggregates bounded power, defense and vitality from all equipped cards; the weapon card supplies the active card ability and resistances. Health maximum and recovery use the same aggregate stat builder. Apply migration 007 before deploying this Worker. No remote migration, deployment or merge is performed by this PR.
