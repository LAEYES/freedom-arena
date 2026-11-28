# FA-WORLD-035 — Authenticated world API boundary

## Authentication
The Worker validates Supabase asymmetric JWTs (ES256 or RS256) against the project's JWKS endpoint. Configure both Worker variables:
- `SUPABASE_URL`: exact project URL, e.g. `https://<project-ref>.supabase.co`
- `SUPABASE_JWT_ISSUER`: exact issuer, `<SUPABASE_URL>/auth/v1`

The issuer must match the configured project URL. Tokens must have `aud=authenticated`, a valid signature, a non-expired `exp`, and a subject. Legacy HS256 JWT secrets are deliberately unsupported: do not put signing secrets in Worker vars or browser bundles. Configure an asymmetric signing key in Supabase before enabling protected API calls.

## Identity and API behavior
All player and world endpoints require a verified bearer token. The player identifier in a request must equal the JWT `sub`; clients cannot choose another player's identity. Snapshot reads are authenticated. A zone slug is syntactically validated; finer private-zone ACLs are not implemented in this lot.

Client-originated full player-state writes and arbitrary zone-state writes are disabled (403) pending server-owned command/reducer APIs. This intentionally prevents clients from minting XP, currency, inventory, combat outcomes, or authoritative zone state. Read access to `/player?id=<subject>` is owner-only.

## Rate limits
D1 minute buckets limit each authenticated subject to 60 requests/minute per route family. Apply migration `003_fa_world_035_security.sql` before deployment. This is a coarse per-subject application limit, not a global edge DDoS shield.

## Deployment gate
Apply the migration, configure the two non-secret Worker variables, verify Supabase asymmetric JWT signing, then deploy. If auth configuration or JWKS verification is unavailable, protected routes fail closed with 503/401. No production deployment is performed by this change.
