# Plugging an agent into the Admissions & Ops workspace

Release 1 contract (AO2.3). The full guide, generated from the request and response schemas, lands with Release 4
(AO9.2). The rules are enforced on the server, with one limit stated plainly in the next section.

## How the agent connects (today)

The agent acts **through a signed-in staff member's session**: it calls the same API that person can call, with that
person's admin token, and can never do more than that person can. A company-managed identity of its own is a later
decision (milestone M4). Until then, **every request the agent sends must carry these headers**:

| Header | Value |
|---|---|
| `X-Ops-Actor` | `agent` |
| `X-Ops-Agent-Id` | a short stable name, for example `aura` (64 characters at most) |
| `X-Ops-Agent-Version` | the agent's version (32 characters at most) |

A request without `X-Ops-Actor: agent` is recorded as the person's own.

**The limit, until the agent has its own identity (milestone M4).** Because the agent uses the person's session, the
server can only recognise it by that header. Rules 1, 4 and 5 below bind everyone, person or agent, so they hold no
matter what. Rules 2 and 3 (no deciding approvals, nothing moved in Answer mode) hold only for requests that carry
`X-Ops-Actor: agent`: an agent that leaves the header off is indistinguishable from the staff member whose session it
uses, and could approve what that person may approve. Every agent client we connect must send the header; a
company-managed machine identity at M4 removes the dependence on it.

## Endpoints (all under `/api/admin/admissions-ops`, all need the `admissions_ops` section)

| Method and path | Purpose |
|---|---|
| `GET /agent/manifest` | All 16 screens: route, description, declared actions (id, label, level 1 to 5, kind, available, params) and suggestions. |
| `POST /agent/intents` | `{ request_id, type: navigate \| invoke \| annotate, screen, action?, params? }`. Params are validated against the action's declared params; anything undeclared is a 400. |
| `POST /approvals/:id/decide` | People only: `{ decision: approve \| hold }`. |
| `GET /approvals/count` | `{ open }`. |

`request_id` (8 to 64 letters, digits or dashes) makes a request idempotent: sending the same one again returns the
first result and records nothing new.

## The rules

1. A level-5 action (refunds, recalls, payment adjustments, suspensions, forgiveness, bulk sends) **always** becomes an
   Approvals item (HTTP 202) and **never** executes.
2. The agent cannot approve or decline anything: `POST /approvals/:id/decide` with `X-Ops-Actor: agent` is a 403, and
   the refusal is logged. A level-5 item can only be decided by leadership (today: the owner).
3. The workspace runs in **Answer** mode: the agent's `navigate` and `annotate` requests are refused and logged. Guide
   mode arrives in Release 4.
4. An action marked `available: false` in the manifest is refused, not attempted. No level-4 action is authorized yet,
   so each one is prepared for a person like a level-3 draft.
5. Every request is written to an append-only audit log (the database refuses updates and deletes), with sensitive
   parameters redacted.
