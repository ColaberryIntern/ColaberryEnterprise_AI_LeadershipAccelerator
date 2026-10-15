# Agent Tool Request → Approval → Create → Register → Grant

**Handoff written 2026-10-15 by session `CC-20260909-m4kt` (Marketing Ops OS tab).**
This is a different workstream from that tab's, so it starts here rather than continuing there.

---

## What Ali asked for

> "Here's what the tool looks like. They need to be able to request a tool which goes to me and
> once approved, use the information gathered to be able to easily create it. Once created,
> register it and give access."

Shown against the live **Tool catalog** at `/admin/tools` — 47 tools, each with purpose,
reads/produces, assigned agents, and a per-agent **Registered / Granted via / Usable now** row.

## The decision Ali has already made

He was given the code-vs-data fork below and chose:

> **Keep registration in code; the app does everything either side of it.**

So: request → approval → scaffold → tracking → grant live in the app. Writing the handler and
deploying it stays a code step. **Do not** start by making the tool registry data-driven — that
option was explicitly considered and declined for now.

---

## What already exists (read this before designing anything)

### 1. The catalog is read-only *on purpose*, and your work is its planned sequel

`backend/src/controllers/agentEffectiveAccessController.ts` says so in its header:

> "No writes: **T11's admin tool registration/assignment surface is explicitly out of scope this
> phase** (see execution-contract.md's 'Explicitly out of scope')."

So this is T11 plus a request/approval step in front. There may be an execution contract from
that mission worth finding before you plan.

| piece | where |
|---|---|
| routes | `backend/src/routes/admin/agentEffectiveAccessRoutes.ts` (12 lines, 2 GETs) |
| controller | `backend/src/controllers/agentEffectiveAccessController.ts` |
| resolver | `backend/src/services/workforce/agentEffectiveAccessService.ts` (468 lines) |
| frontend client | `frontend/src/services/agentEffectiveAccessApi.ts` |

### 2. "Registered" means compiled into the backend. This is the whole constraint.

`registeredHandlerToolNames(agentName)` reads **TypeScript constants** —
`REESE_TOOLS` (`backend/src/services/reese/reeseTools.ts`, 99 lines) and `DARA_TOOLS`. They are
OpenAI tool-schema arrays.

A tool therefore **cannot be created from the UI**. It needs a schema plus a handler in code and
a deploy. Any design that promises otherwise is promising something the runtime cannot do today.

### 3. "Granted" is data, and that half *is* buildable in-app

`agentEffectiveAccessService.ts:249` — `const toolsGranted: string[] = agent.tools_granted ?? [];`

Grants come from the agent row (`tools_granted`) and a `GRANTS` source. `grantedVia` is an array
because a tool can be granted by more than one. **Usable now = registered AND granted AND the
agent is enabled** (`agentEffectiveAccessService.ts:180-192`).

### 4. There is already an approval spine. Do not build a second one.

`backend/src/models/ApprovalRequest.ts` carries: `agent_name`, `action`, `risk_tier`,
`autonomy_level`, `verdict`, `reason_code`, `prepared_action`, plus ticket/work-unit/run/event ids.

Check whether a tool request fits this before inventing a `tool_requests` table. A second
approval system that drifts from the first is the failure mode to avoid — the same session that
wrote this handoff nearly shipped a duplicate `fbclid` extractor beside an existing one, and the
cost of two writers over one concept is that neither number can be trusted afterwards.

Also present and possibly relevant: `Capability.ts`, `CapabilityAgentMap.ts`
(`capability_id`, `agent_name`, `role`, `status`), and a visible
`BposCapabilityTicketAutoResolver` in the live catalog. Worth understanding how capability
tickets relate to tool requests before adding a third concept.

---

## The shape Ali approved

```
REQUEST  →  ALI APPROVES  →  SCAFFOLD  →  deploy  →  GRANT
 (app)        (app)           (app)       (code)     (app)
```

**Approval should emit everything needed to implement the tool**, so the code step is mechanical:

- the tool schema (name, purpose, **reads**, **produces** — the catalog already displays these
  four fields per tool, so the request form should collect exactly them)
- a handler stub and a test file
- a tracked item that stays open until the tool actually appears as `registered`

That last point is the one worth getting right: the catalog can already tell you whether a tool
is registered, granted and usable. **The request is not done when Ali clicks approve — it is done
when the resolver reports the tool usable.** Closing it on approval would hide exactly the gap
this feature exists to close.

---

## Traps this codebase will set for you

Collected from the session that wrote this; all cost real time.

- **Check `gh pr view <n> --json state,mergedAt` before every push.** Pushes to a merged branch
  vanish silently. This happened once in that session.
- **Read tsc's own exit code, not the shell's.** `npx tsc --noEmit; echo $?` inside a background
  task reports the *shell's* status, which is always 0. Same trap with `npx tsc | head`. Twice a
  "clean typecheck" was reported against a failing one.
- **Backticks inside a TS template literal close it.** A SQL or CSS comment containing
  `` `views` `` breaks the file. Hit four times in one session.
- **Bash heredocs collapse `\\` to `\`.** A literal `\n` in a Python patch script becomes a real
  newline and the match silently fails. Prefer line-based edits.
- **Most backend files are CRLF.** A regex anchored on `\n` will not match. Detect the line
  ending and split on it.
- **`npx tsc` can resolve a stale TypeScript 4.9.5.** Confirm `npx tsc --version` is 5.x before
  trusting a local pass. (It was 5.9.3 on 2026-10-15.)
- **Every file under `frontend/src/**/__tests__/` is collected as a Jest suite**, including
  helpers, which then fail the run.
- **An explicit `jest.mock` factory replaces the whole module.** Adding an export to a service
  without adding it to the factory makes it `undefined` and fails *every* test in that file. And
  a `mockResolvedValue` set in the factory does **not** survive `jest.clearAllMocks()` in
  `beforeEach` — set it in `beforeEach`.
- **CI can fail on `npm ECONNRESET` during install**, before any compiler runs. Read the log
  before assuming a code fault; `gh run rerun <id> --failed` is the fix.

## Deploy notes

- Deploy only via `ssh root@95.216.199.47`, `cd /opt/colaberry-accelerator`,
  `./scripts/deploy-prod.sh backend nginx`. It holds a lock and verifies containers come up.
- **Check for an in-flight deploy first** — two concurrent `compose up` runs are the documented
  cause of a Cloudflare 521. This happened three times in one session; each time the correct move
  was to wait, because the other session's deploy already carried the merged code.
- Backend changes need `backend`; anything in `frontend/` needs `nginx` (the frontend is built
  into that image). A backend-only deploy leaves the UI stale.
- A deploy empties the container's `/tmp`, so re-`docker cp` any helper script after one.

## Verification expectation

Prove the thing, not the signal. In that session a pixel was "installed" and sending nothing —
markup correct, `window.fbq` defined, and zero events leaving the browser. The grep passed; only
the network request told the truth.

For this feature the equivalent is: **a request is not satisfied because a row says `approved`.
It is satisfied when `/api/admin/tools` reports that tool `usable: true` for the agent that asked
for it.** Assert that.
