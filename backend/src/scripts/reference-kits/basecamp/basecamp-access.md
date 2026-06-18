# Basecamp Access Kit — see what CB System sees, from any project

Self-contained reference kit. Drop it into any Claude Code project and that
project gets the exact same Basecamp visibility CB System has. No shared file
access required: download the attached files, run `setup.sh`, done.

---

## The one thing to understand

**CB System has no special "admin" view of Basecamp.** It is an OAuth integration
that calls Basecamp account `3945211` with an access token. In Basecamp 3, a
token sees exactly the projects that its **authorizing person** is a member of,
nothing more.

So there are two distinct questions, and they have different answers:

| Question | Answer |
|---|---|
| How do I let a **code project** see what CB System sees? | Use the **same token**, against the **same account** (`3945211`). That is what this kit packages. |
| How do I make a **Basecamp project** visible to CB System? | Add CB System's **token owner** to that project as a member: `grantProjectAccess(projectId, tokenOwnerId)`. |

Run `whoAmI()` (or `./bc-exec.sh GET /my/profile.json`) to see who the token
authenticates as. That person IS CB System's Basecamp identity. Whatever they
cannot see, CB System cannot see.

---

## The token is not a static secret

The Basecamp token **rotates roughly every 2 weeks**. The source of truth is the
CCPP database table `Basecamp_AuthInfo` (`SELECT TOP 1 AccessToken ... WHERE
IsActive = 1 ORDER BY BasecampAuthInfoID DESC`). Hardcoding a token guarantees a
401 within two weeks. This kit resolves the token the same way CB System does:

1. `BASECAMP_ACCESS_TOKEN` env if set (the path you use locally and in CI).
2. Otherwise, if `MSSQL_*` (CCPP) env is present, pull the live token from CCPP.
3. Otherwise, throw.

CCPP is only reachable from inside the prod VPS network, so the CCPP path only
works on prod (or over an SSH tunnel). Locally, you pass a token directly.

### Getting a live token to run locally

On the prod box, the repo already ships a printer:

```bash
ssh root@95.216.199.47
docker exec colaberry-accelerator-backend-1 node backend/src/scripts/lib/printBasecampToken.js
```

Copy that value and export it locally:

```bash
export BASECAMP_ACCESS_TOKEN=<paste>
```

(If you also have the CCPP access kit installed, `getLatestBasecampToken()` does
the same thing programmatically.)

---

## Install

```bash
cd ~/path/to/extracted/kit
bash setup.sh /path/to/your/project
```

This drops three files into the target project:

| File | Lands at | Purpose |
|---|---|---|
| `basecampClient.js` | `backend/src/scripts/lib/basecampClient.js` | The helper. Token resolve + `bc/bcGet/bcPost/bcPut/bcGetAll` + the visibility surface. |
| `bc-exec.sh` | `scripts/bc-exec.sh` (chmod +x) | One-off API calls from the terminal. |
| `sample-basecamp.js` | `backend/src/scripts/sampleBasecamp.js` | Read-only smoke test. |

The CCPP token path needs `mssql`; the installer tells you if it is missing. If
you always pass `BASECAMP_ACCESS_TOKEN`, you do not need it.

---

## Smoke test

```bash
export BASECAMP_ACCESS_TOKEN=...                  # or run on prod with CCPP env
node backend/src/scripts/sampleBasecamp.js
```

Expected: it prints `whoAmI`, then every project the token can see, then drills
into one project's lists / to-dos / people. If you see projects, you see what
CB System sees.

---

## Use in code

```js
const {
  whoAmI, listProjects, listTodolists, listTodos, listPeople,
  grantProjectAccess, bcGet, bcPost,
} = require('./lib/basecampClient');

// Who am I (== CB System's identity)?
const me = await whoAmI();

// Everything CB System can see:
const projects = await listProjects();

// Drill into one:
const lists = await listTodolists(projectId);
const todos = await listTodos(projectId, lists[0].id);

// Make a project visible to CB System (add the token owner as a member):
await grantProjectAccess(projectId, me.id);

// Anything else the BC API exposes:
const card = await bcGet(`/buckets/${bucketId}/todos/${todoId}.json`);
await bcPost(`/buckets/${bucketId}/recordings/${todoId}/comments.json`, { content: '<p>hi</p>' });
```

---

## Governance rules

1. **Reads are free; writes are deliberate.** `grantProjectAccess`,
   `revokeProjectAccess`, and any `bcPost`/`bcPut` change live Basecamp data on
   the real Colaberry account. Treat them like production writes.
2. **Never log the token.** The helper never prints it; keep it that way.
3. **Idempotency.** Granting an existing member is a no-op. Before creating a
   todo or comment, check whether the equivalent already exists (CB System's own
   sync dedupes the same way).
4. **The token rotates.** Do not cache it across processes or commit it. Resolve
   it fresh from CCPP/env each run; the helper self-heals on a 401.
5. **Same scope as CB System, no more.** This kit grants no extra power. If the
   token owner cannot see a project, neither can you. To widen scope, add the
   token owner to the project (see above), do not look for a back door.

---

## Key ids

| Thing | Value |
|---|---|
| Basecamp account | `3945211` |
| API base | `https://3.basecampapi.com/3945211` |
| User-Agent | `Colaberry AI Ops Command Center (ali@colaberry.com)` |
| Token source of truth | CCPP `Basecamp_AuthInfo` (active row) |
| CB System code | `backend/src/services/ops/basecampClient.ts`, `bcSyncService.ts` |
| Projects CB System ignores | name matches `center of excellence|rmg mortgage` (its sync excludes them; the raw API still returns them) |

See `cb-system-visibility.md` for the visibility model and the add-a-project
recipe in full.
