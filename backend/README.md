# Freedom Arena — free backend

Production target: Cloudflare Workers + D1.

- Worker API: `backend/worker.ts`
- D1 schema: `backend/schema.sql`
- Wrangler config: `backend/wrangler.toml`
- The browser must never receive a Cloudflare secret.
- Authentication/session validation should be added before exposing player writes publicly.

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
currently submit arbitrary player state. Before treating the API as production
multiplayer infrastructure, add authenticated sessions and server-side validation
of gameplay mutations.
