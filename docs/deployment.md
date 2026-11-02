# Deployment

Lockstep uses a Cloudflare Worker with D1 and the retained SQL Durable Object, plus
a Next.js frontend. This guide describes how to provision and verify a deployment;
a repository push or a successful local build does not deploy either service.

## Local provider setup before deployment

Follow [the local OpenAI setup](../README.md#enable-openai-responses-locally) to create
an application API key, create the ignored `apps/worker/.dev.vars` only if missing,
and restart the Worker after editing it. Keep any existing file and its other settings.
The `.dev.vars.example` template is public; the real file and key remain private.

Use a non-sensitive sample to check an actual AI-mode response before configuring
production. The **AI configured** badge and `/health` report configuration presence,
not provider authentication or model availability. OpenAI documents
[server-side key handling](https://developers.openai.com/api/reference/overview#authentication).

The deployment steps below configure a separate production secret. Do not copy the
local key file into the frontend or commit it. `NEXT_PUBLIC_WORKER_URL` is public and
must contain only the Worker URL; no browser environment variable needs the API key.

## 1. Provision a separate backend

From the repository root, authenticate and create a new database:

```sh
pnpm --filter @lockstep/worker exec wrangler login
pnpm --filter @lockstep/worker exec wrangler d1 create lockstep-remastered
```

Copy the returned database ID into `apps/worker/wrangler.toml`, replacing the all-zero
placeholder. Keep the binding name `DB`. Choose a distinct Worker/database name if
these names already belong to another app. Do not point the demo at the original
project's database.

Apply all migrations, including the context and conversation tables:

```sh
pnpm --filter @lockstep/worker exec wrangler d1 migrations apply DB --remote
```

Set these optional provider values under `[vars]` in `wrangler.toml`:

```toml
OPENAI_MODEL = "gpt-4.1-mini"
OPENAI_BASE_URL = "https://api.openai.com/v1"
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
```

When you are ready to deploy, store the key as a Worker secret, then publish the Worker:

```sh
pnpm --filter @lockstep/worker exec wrangler secret put OPENAI_API_KEY
pnpm --filter @lockstep/worker exec wrangler deploy
```

The key command accepts the value interactively. The local `.dev.vars` file does
not configure production. Keep `OPENAI_API_KEY` out of committed configuration and
frontend environment variables. Without a key, the deployed app uses deterministic
guidance. Note the HTTPS Worker URL printed by deployment.

Cloudflare documents [secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
and [Worker deployment commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).

## 2. Deploy the frontend

For Vercel, import this repository as a Next.js project, set the Root Directory to
`apps/web`, keep access to workspace source outside that directory enabled, and use
Node.js 24. Keep the pnpm workspace and root lockfile available. Use the app's `build`
script (`next build --webpack`) and `.next` output. The workspace dependency
`@lockstep/shared` must be included in the build; do not upload only `apps/web`.
See the official [monorepo setup](https://vercel.com/docs/monorepos).

Set this environment variable before building:

```dotenv
NEXT_PUBLIC_WORKER_URL=https://your-worker.example.workers.dev
```

Use the actual Worker URL. Keep `OPENAI_API_KEY` exclusively on the Worker; do not add
it to the frontend host. Rebuild the frontend after changing the URL, since Next.js
embeds public environment values at build time. A different Next.js host also works
if it supports the application's Node.js and workspace build requirements.

After obtaining the frontend's HTTPS origin, update the backend's `ALLOWED_ORIGINS`
in `wrangler.toml` and redeploy the Worker. Use an origin with no path or trailing
slash. Multiple explicitly allowed origins are comma-separated. The default local
origin is insufficient for a public frontend. Deployment previews have different
origins and need their own explicit allowance.

## 3. Check the deployed flow

Open the public frontend and verify the backend status. Submit a sample error, ask
a follow-up, add a small context document, and reload the conversation. Check that
the Evidence drawer shows your document and the answer is labelled with its actual response mode.
Use a private browser window to confirm it cannot see the first window's history.
The `/health` endpoint reports whether a key is configured; it does not test model
permissions, billing, or endpoint compatibility. A real AI-mode answer is the live
provider smoke check.

## Optional semantic retrieval

Keyword retrieval and private context work without Vectorize. To enable semantic
ranking, create a 64-dimensional cosine index and add its `VECTORIZE` binding:

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
`OPENAI_EMBEDDING_MODEL` from the shell, not `.dev.vars`, refuses hash embeddings, and will not
overwrite an existing output file. Its output contains only bundled public runbooks.
Keep the binding, model, dimensions, and runbook IDs consistent, then redeploy.

Private documents uploaded after binding the index are indexed automatically in an
owner namespace. Existing keyword-only documents remain searchable; re-upload them
if semantic indexing is needed. Failed indexing leaves keyword fallback usable.
Private vector matches are checked against owned D1 chunks before their text can
be used. D1 deletion remains authoritative even if remote vector cleanup fails.
