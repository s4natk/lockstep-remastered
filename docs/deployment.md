# Deployment

Lockstep runs as two services: a Cloudflare Worker backed by D1, and a Next.js
frontend. This guide uses Vercel for the frontend. A repository push does not deploy
the Worker; provision and deploy each service before testing the public application.

## Prerequisites

- Node.js 24 or later and pnpm 11.9.0.
- Cloudflare and Vercel accounts with access to the deployment repository.
- An OpenAI API key for model-generated responses. Deterministic guidance works
  without a provider key. Vectorize is optional.

Run terminal commands from the repository root. On Windows PowerShell, use
`pnpm.cmd` wherever this guide shows `pnpm`.

```sh
pnpm install --frozen-lockfile
```

Keep credentials out of source control. The public `.example` files describe variable
names; real `.dev.vars` and `.env.local` files are ignored. Local provider setup is
covered in [the README](../README.md#enable-openai-responses-locally).

## 1. Provision the backend database

Authenticate with Cloudflare and create a database for this deployment:

```sh
pnpm --filter @lockstep/worker exec wrangler login
pnpm --filter @lockstep/worker exec wrangler d1 create lockstep-remastered
```

Use a different database name if that name is already in use. In
`apps/worker/wrangler.toml`, set `database_name` and `database_id` to the values for
this database. Preserve the `DB` binding name, because the Worker uses `env.DB`.
A database UUID identifies the resource; it is not an API credential.

Apply every pending migration:

```sh
pnpm --filter @lockstep/worker exec wrangler d1 migrations apply DB --remote
```

The migrations create investigation history, document storage, and conversations.
Keep the `ReviewSession` Durable Object binding and its `v1` SQLite migration in the
configuration. Worker deployment applies that Durable Object migration separately.
See [Cloudflare's D1 migration reference](https://developers.cloudflare.com/d1/reference/migrations/).

## 2. Deploy the Worker and configure OpenAI

Deploy the backend:

```sh
pnpm --filter @lockstep/worker exec wrangler deploy
```

Record the HTTPS Worker origin printed by deployment. Examples below use
`https://your-worker.example.workers.dev`; replace it with that actual origin.

To enable OpenAI, run this command exactly as written:

```sh
pnpm --filter @lockstep/worker exec wrangler secret put OPENAI_API_KEY
```

`OPENAI_API_KEY` is the literal variable name. Paste the actual API key only when
Wrangler prompts for the secret's value. The command publishes an updated Worker
version. Keep the key out of `wrangler.toml`, Git, and frontend environment variables.
The ignored local `.dev.vars` file does not configure deployed Workers.
See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Optional provider settings belong under the existing `[vars]` table in
`apps/worker/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "http://localhost:3000"
OPENAI_MODEL = "gpt-4.1-mini"
OPENAI_BASE_URL = "https://api.openai.com/v1"
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
```

These model names are the application defaults; select models available to the
configured provider account. Run `wrangler deploy` again after changing this file.
For a custom endpoint, follow the compatibility requirements in the README.

Open `https://your-worker.example.workers.dev/health`. `ok: true` confirms the Worker
responds. `openai.configured: true` means a nonempty `OPENAI_API_KEY` is present; it
does not verify model access, provider authentication, or available API credit.

## 3. Deploy the frontend

In Vercel, import the entire GitHub repository as a new project and use these settings:

| Setting                                     | Value                            |
| ------------------------------------------- | -------------------------------- |
| Framework preset                            | Next.js                          |
| Root Directory                              | `apps/web`                       |
| Include source files outside Root Directory | Enabled                          |
| Node.js version                             | `24.x`                           |
| Install Command                             | `pnpm install --frozen-lockfile` |
| Build Command                               | `pnpm run build`                 |
| Output Directory                            | Framework default, `.next`       |

The shared workspace package lives outside `apps/web`; keep the root lockfile and
workspace source available. The app's build script uses `next build --webpack` for
its shared TypeScript extension aliases. No Rust rebuild is needed for deployment.
See [Vercel's monorepo documentation](https://vercel.com/docs/monorepos/monorepo-faq).

Before deploying, add these Vercel environment variables to the Production environment:

```dotenv
ENABLE_EXPERIMENTAL_COREPACK=1
NEXT_PUBLIC_WORKER_URL=https://your-worker.example.workers.dev
```

Corepack selects the repository's pinned `pnpm@11.9.0`. Add the same settings to
Preview only if preview deployments should use this backend. `NEXT_PUBLIC_WORKER_URL`
contains only the Worker origin, without `/health` or `/api`. Do not add the OpenAI
key to Vercel. See [Vercel's Corepack configuration](https://vercel.com/docs/builds/configure-a-build#corepack).

Deploy and copy the stable production frontend origin, such as
`https://your-project.vercel.app`. A preview deployment has a different origin.

## 4. Allow the public frontend to contact the backend

Open `apps/worker/wrangler.toml`. Under its existing `[vars]` table, replace or extend
`ALLOWED_ORIGINS` with the exact production frontend origin:

```toml
[vars]
ALLOWED_ORIGINS = "https://your-project.vercel.app"
```

Keep any other variables already in that table. Use the Vercel frontend origin here,
not the Cloudflare backend origin. An origin includes the scheme and hostname, with
no path. Multiple allowed origins are comma-separated:

```toml
ALLOWED_ORIGINS = "https://your-project.vercel.app,https://app.example.com"
```

Do not use `*` or a wildcard preview hostname. Each preview origin must be explicitly
allowed if it needs access. The Worker also permits the local development origins.

Publish the updated backend configuration:

```sh
pnpm --filter @lockstep/worker exec wrangler deploy
```

In Vercel, confirm `NEXT_PUBLIC_WORKER_URL` matches this Worker. If that value changes,
redeploy the frontend: Next.js embeds public variables during the build, so updating
the setting alone does not update an existing deployment.

Commit reviewed database identifiers, origins, and other non-secret deployment
configuration when maintaining a deployment from this repository. Keep provider
keys in Cloudflare secrets. Non-secret variables changed only in the Cloudflare
dashboard can be overwritten by a later configuration deployment.

## 5. Verify the deployed application

Open the production frontend and check the following:

1. Submit a sample error. A completed **AI investigation** response verifies a live
   provider request; **AI configured** alone does not. Deterministic guidance is
   expected when no provider is configured or a response fails validation.
2. Ask a follow-up, reload, and reopen the same conversation from history.
3. Save and pin a small UTF-8 context document. Submit a related question and inspect
   its source in the Evidence drawer.
4. Open a private browser window and confirm it cannot see the original window's
   conversations or context.

This is a deployment smoke check. The repository's automated tests run locally with
controlled provider responses and do not establish the state of a cloud account.

## Troubleshooting

| Symptom                                                      | Check                                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The frontend says the service is offline                     | Verify the deployed `NEXT_PUBLIC_WORKER_URL`, the Worker `/health` response, and the browser Network tab. Redeploy Vercel after changing its public URL setting.                                                                            |
| Browser requests fail with a CORS error                      | Set `ALLOWED_ORIGINS` to the exact frontend origin currently in the address bar, then redeploy the Worker. Production and preview domains are separate.                                                                                     |
| `/health` reports `openai.configured: false`                 | Add a nonempty secret with the literal name `OPENAI_API_KEY` to the same Worker/environment whose URL is being checked. A production secret does not configure localhost.                                                                   |
| A secret was accidentally named with the key value           | Delete that incorrectly named entry under Worker Settings → Variables and Secrets. Replace the exposed provider key, then add the new value under `OPENAI_API_KEY`. Do not share screenshots or secret-list output containing the old name. |
| The key is configured but replies use deterministic guidance | Check the selected model, API account access, provider limits, and billing. Configuration presence is not a successful model call.                                                                                                          |
| The Vercel build cannot find the shared package              | Enable source files outside the Root Directory and keep the workspace files. Use Node.js 24 and the pinned pnpm version through Corepack.                                                                                                   |
| Database requests fail                                       | Confirm the deployed `DB` binding points to the intended database and apply all remote migrations. Local D1 data is separate.                                                                                                               |

## Optional semantic retrieval

Keyword retrieval and private context work without Vectorize. For semantic ranking,
create a 64-dimensional cosine index and add its `VECTORIZE` binding:

```sh
pnpm --filter @lockstep/worker exec wrangler vectorize create lockstep-remastered-runbooks --dimensions 64 --metric cosine --binding VECTORIZE --update-config
```

For bundled public runbooks, set `OPENAI_API_KEY` in the invoking shell environment,
then export and upload the vectors:

```sh
pnpm --filter @lockstep/worker vector:export
pnpm --filter @lockstep/worker exec wrangler vectorize upsert lockstep-remastered-runbooks --file runbook-vectors.ndjson
```

The export command reads `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and
`OPENAI_EMBEDDING_MODEL` from the shell, not `.dev.vars`. It refuses hash embeddings
and will not overwrite an existing output file. The output contains only bundled
public runbooks. Keep the binding, model, dimensions, and corpus IDs consistent,
then redeploy the Worker.

New private documents are indexed in owner namespaces when the index is configured.
Existing keyword-only documents remain searchable; re-upload them if semantic
indexing is needed. Failed indexing leaves keyword fallback usable. Matches resolve
through owned, existing D1 chunks before their text is used; D1 deletion remains
authoritative even if remote vector cleanup fails.
