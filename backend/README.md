# Freedom Arena — free backend

The production target is a free-tier backend using Cloudflare Workers + D1.

- Worker API: `backend/worker.ts`
- D1 schema: `backend/schema.sql`
- The browser must never receive a Cloudflare secret.
- Authentication/session validation should be added before exposing player writes publicly.

Deployment requires a Cloudflare account and Wrangler credentials; those credentials are intentionally not stored in Git.
