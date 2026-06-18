# CB System Basecamp visibility — the model, and how to change it

Companion cookbook to `basecamp-access.md`. This file answers, precisely: what
does CB System see, why, and how do you change what it sees.

---

## The visibility model

CB System is the AI Ops engine in `backend/src/services/ops/`. It is not a human
account and not a Basecamp admin. It is an OAuth integration that calls account
`3945211` with an access token.

```
CB System  ──(Bearer token)──>  Basecamp account 3945211
                                  returns only the projects the token's
                                  AUTHORIZING PERSON is a member of
```

Concretely, every ~2 minutes `bcSyncService.ts` calls `GET /projects.json`. That
endpoint returns the set of projects the token owner belongs to. CB System
upserts each into `ops_bc_projects`, then syncs each project's to-dos. So:

> **CB System sees a project if, and only if, the token owner is a member of it
> (and the project name does not match the sync's exclude filter).**

The exclude filter is `center of excellence|rmg mortgage` (case-insensitive),
configurable via `OPS_SYNC_EXCLUDE_NAME_RE`. Those projects are intentionally
skipped by the sync even though the raw API would return them.

### Who is the token owner?

Run:

```bash
./scripts/bc-exec.sh GET /my/profile.json
# or
node -e "require('./backend/src/scripts/lib/basecampClient').whoAmI().then(p=>console.log(p.id,p.name,p.email_address))"
```

The `id`, `name`, and `email_address` returned describe CB System's effective
Basecamp identity. That is the person whose membership defines CB System's view.

---

## Recipe A — give a *code project* the same view as CB System

This is the kit's main job. Install it (`setup.sh`), then resolve a token the
same way CB System does (env or CCPP). Now `listProjects()` returns the same set
CB System works from. See `basecamp-access.md`.

Nothing about the target project's identity matters: it borrows CB System's
token, so it inherits CB System's exact scope. No more, no less.

---

## Recipe B — make a *Basecamp project* visible to CB System

A project shows up in CB System's view the moment the **token owner** is a member
of it. So adding it is a single grant:

```js
const { whoAmI, grantProjectAccess, listPeople } = require('./lib/basecampClient');

const me = await whoAmI();                          // CB System's identity
const PROJECT_ID = 12345678;                         // the project to expose

// Idempotency: only grant if not already a member.
const people = await listPeople(PROJECT_ID);
if (!people.some((p) => p.id === me.id)) {
  await grantProjectAccess(PROJECT_ID, me.id);
}
```

Or from the terminal:

```bash
# 1. find the token owner's id
./scripts/bc-exec.sh GET /my/profile.json          # note the "id"

# 2. grant that id access to the project
./scripts/bc-exec.sh PUT /projects/12345678/people/users.json '{"grant":[<ID>]}'
```

The underlying API is `PUT /projects/{id}/people/users.json` with a body of
`{"grant":[personId, ...]}` (and `{"revoke":[...]}` to remove). This is exactly
the pattern `backend/src/scripts/addDheeToPartnerOnboarding.js` uses to add a
person to a project.

After the grant, CB System picks the project up on its next 2-minute sync tick:
it appears in `ops_bc_projects` and its to-dos begin mirroring into
`ops_bc_todos`. No redeploy, no config change.

### Caveat: the exclude filter

If the project's name matches `center of excellence|rmg mortgage`, the sync will
still skip it even after the grant. Rename it, or adjust
`OPS_SYNC_EXCLUDE_NAME_RE`, if you actually want CB System to track it.

### Caveat: you can only grant from inside the account

You can only grant project access to people who are already in the Basecamp
account (`3945211`). The token owner already is, so Recipe B always works for
exposing an existing project to CB System.

---

## Recipe C — give *another person or integration* CB System's scope

If you want a different human or a separate integration to see the same projects
(rather than borrowing the token), they each need to be added to those projects
individually. Membership is per-project; there is no "copy all my projects to
this person" call. Loop the grant:

```js
const mine = await listProjects();
for (const p of mine) {
  await grantProjectAccess(p.id, OTHER_PERSON_ID);   // skip if already a member
}
```

For an integration, the cleaner answer is usually Recipe A: let it use the
existing token rather than minting a parallel identity that you then have to keep
in sync.

---

## Quick reference

| Action | Call |
|---|---|
| Who is the token owner / CB System | `GET /my/profile.json` |
| What CB System can see | `GET /projects.json` (paginated) |
| Lists in a project | `GET /projects/{id}.json` -> dock `todoset` -> `GET /buckets/{id}/todosets/{tsid}/todolists.json` |
| To-dos in a list | `GET /buckets/{id}/todolists/{lid}/todos.json` |
| People on a project | `GET /projects/{id}/people.json` |
| Expose a project to CB System | `PUT /projects/{id}/people/users.json` `{"grant":[ownerId]}` |
| Remove access | `PUT /projects/{id}/people/users.json` `{"revoke":[id]}` |

Account `3945211`. Sync cadence ~2 min. Token rotates ~2 weeks (CCPP
`Basecamp_AuthInfo`).
