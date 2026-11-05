# CC-20261105-t9w3 — per-client service tokens, so Cora cannot dial anybody

Follows [CC-20261105-t9w3](CC-20261105-t9w3.md). Ali chose this over reusing the shared token
after being shown what the shared token opens.

- [x] Scope the v1 service routes per client
  - Date: 2026-11-05
  - Session: CC-20261105-t9w3
  - What changed: `serviceAuthMiddleware` replaces `requireServiceToken` with a
    `requireServiceClient(...clients)` factory over a `ServiceClient` union; `CORA_SERVICE_TOKEN`
    added to `config/env`, `backend/.env.example` and `docker-compose.production.yml`; the five
    guarded v1 routes now name their client, with the outreach feed scoped to `cora` alone;
    `routes/README.md` rewritten (it still described "two endpoints").
  - Verification: 20 new tests in a new middleware suite; 49 green across the three affected
    suites; backend typecheck clean on tsc 5.9.3; route-auth and Explorer copy lints OK.
    7/7 mutations killed, restores byte-identical.
  - Notes: below.

## What the shared token actually opened

Measured on production 2026-11-05 by reading the compiled route table out of the running
container, not the source: `ENTERPRISE_CRM_TOKEN` guarded **five** routes, and three are writes.

| Route | |
|---|---|
| `POST /api/v1/leads` | creates a lead |
| `POST /api/v1/request-callback` | **asks Synthflow to dial a person** |
| `POST /api/v1/open-house/register` | creates an account and emails a login link |
| `GET /api/v1/enrollments/lookup` | read |
| `GET /api/v1/explorer-growth/outreach` | read, the new feed |

Handing that to a nightly read-only tagging job would have given the recap engine the ability to
place phone calls. The second problem was rotation: one value is held by this backend, by Sai's
Cloud Run for training.colaberry.com, and by Repo2Reputation, so rotating it means changing three
systems in the same minute or breaking lead capture — which is why it had not been rotated since
it was provisioned on 2026-06-10.

## Why the rename was the safe way to do it

`requireServiceToken` was passed to Express **directly**. The replacement is a factory, and a
factory passed without being called does not error: Express calls it with `(req, res, next)` as
its client list and treats the returned function as the response, so the route hangs forever.
Renaming it to `requireServiceClient` makes every un-migrated call site a **compile error** on a
gate that already runs, instead of a route that silently stops answering. The old name is gone
rather than deprecated, for the same reason.

`CLIENT_TOKENS` is a `Record<ServiceClient, () => string>`, so adding a client to the union
without giving it a token source does not compile either. Tokens are read through a function
rather than captured at module load, so no value is copied into a second place that could outlive
a rotation.

## The route is now scoped to `cora` alone, which REMOVES access that worked today

Before this change I verified the feed answering **200** on production with the shared token.
After it, that token gets 401 there and the route answers 401 to everybody until
`CORA_SERVICE_TOKEN` is placed. That is deliberate and it is the correct state for a route whose
only consumer is not provisioned — but it is a real behaviour change on a live endpoint, not a
no-op, so it is stated here rather than buried. Nothing is currently calling it: Cora reads a
fixture file and has no HTTP client (see below).

## The one paste that would undo all of this

Setting `CORA_SERVICE_TOKEN` to the enterprise value gives Cora the three writes back with
nothing anywhere saying so. `duplicateClientTokens()` detects it and the backend logs
`service_client_tokens_not_distinct` at **error** level on boot, naming the clients.

It logs and does not throw. A misconfiguration here grants more access than intended, which is
serious, but throwing at import would refuse to start the backend and turn a paste mistake into
an outage. The detector is keyed on a SHA-256 digest rather than on the secret, so no secret is
ever used as a map key, and a test proves it fires — plus one proving it does **not** fire when
both clients are unset, because empty is absence, not a shared secret.

## Still blocked on Kes, and it is his step by his own design

Cora has nowhere to put a token yet. `/opt/cora-recap-engine/.env` line 279 reads
`EXPLORER_QUEUE_FEED_PATH=/app/execution/fixtures/explorer_queue_test_feed.json`, and
`build_feed()` has exactly one implementation — a JSON file reader whose docstring says "used
until the live feed exists". His settings class declares no accelerator base URL and no token
field, and his module header states the plan: "a service-token read later. Swapping in the live
feed means adding one class with the same `fetch` signature."

So the order is: Kes adds `LiveHttpFeed` reading a base URL and a token, then the token is minted
and placed in two environments. Placing it before that class exists would change nothing.

## Feed health, measured while verifying

At the 200-row cap: `lead_id` present on 200 of 200, `ghl_url` present on **193 of 200 (97%)**.
Cora joins on `ghl_url` alone, so 7 rows are unjoinable — and the top two rows of the ranking are
among them, so the sync job must skip an unjoinable row rather than fail on the first one. An
earlier 2-row sample showed 0 of 2 joinable, which read as a total failure and was sampling.
