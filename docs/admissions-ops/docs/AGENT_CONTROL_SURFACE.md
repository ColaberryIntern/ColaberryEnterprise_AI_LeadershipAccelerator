# Agent control surface

Taiwo is building an AI agent that will eventually control and navigate the Command Center. In the
demo it is called AURA (Admissions Unified Reporting and Automation), her proposed name.

This document describes what the application must provide so that agent can plug in. The
application owns the screens, the actions, the permissions and the log. The agent owns reasoning
and language. The line between them is this surface.

## 1. Principles

1. **Same doors as a person.** The agent navigates the same routes and calls the same actions the UI calls. There is no hidden agent-only API that bypasses a screen's rules.
2. **Published, not scraped.** Every screen declares what it is and what can be done on it. The agent reads that declaration. It does not read the DOM or click pixels.
3. **Acts as someone.** Every agent call runs on behalf of a signed-in staff member and can never do more than that person can.
4. **Prepares, never decides.** The agent cannot approve anything, including its own work.
5. **Visible.** When the agent moves the screen or prepares something, the person sees it happen and can stop it.
6. **Logged.** Every call is recorded with the records it read.
7. **Replaceable.** Model, framework and transport can change without touching a screen.

## 2. What the person sees

### 2.1 The dock (every screen)

A dark bar under the section bar. Demo: any screen, for example `demo/index.html`.

- Status dot, agent name, current mode, and "sees this screen".
- A text box: "Tell AURA what to do or where to take you".
- Three suggestions that fit the current screen. In the demo each one navigates, to show the agent taking the person somewhere.
- A link to the full workspace.

The dock lives in the workspace layout, not in each page, so a new screen gets it by being routed
there.

### 2.2 The workspace (Ask AURA)

Demo: `demo/Agent.html`. Request library, conversation with a visible investigation, mode selector,
last run as a trail of screens, permission levels, and what was done today.

### 2.3 Modes

| Mode | What the agent may do to the screen | Default |
|---|---|---|
| Answer | Nothing. It replies in its own panel. | Phase 0 and 1 |
| Guide | Navigate, filter, scroll to and highlight. It changes no data. | Phase 2 |
| Operate | Everything in Guide, plus fill forms and call actions up to level 4. It stops at every approval. | Phase 4, after sign-off |

The mode is per person, visible in the dock, and changeable in one click. Setting a mode above
Answer is itself a permission.

## 3. Screen registry

Each screen registers a manifest when it mounts. Proposed shape:

```ts
interface ScreenManifest {
  id: string;                 // 'students', 'student360', 'payments.tfcAudit'
  route: string;              // '/admin/admissions-ops/students/:ref'
  title: string;
  description: string;        // one sentence the agent can read
  context: () => ScreenContext;   // what is on screen right now
  actions: AgentAction[];
}

interface ScreenContext {
  subject?: { type: 'student' | 'cohort' | 'ticket' | 'report'; ref: string };
  filters?: Record<string, string>;
  selection?: string[];
  sources: { name: string; syncedAt: string | null; status: 'ok' | 'stale' | 'down' }[];
}

interface AgentAction {
  id: string;                 // 'students.search', 'student360.addNote'
  label: string;
  level: 1 | 2 | 3 | 4 | 5;   // see section 5
  kind: 'navigate' | 'view' | 'prepare' | 'execute';
  params: ZodSchema;          // validated on the server too
  confirm?: string;           // shown to the person in Operate mode before it runs
}
```

Notes:

- The manifest is data. Handlers stay in the screen and on the server.
- `context()` returns references and filters, not record contents. The agent fetches records through the read actions, which go through the same gate as any request.
- A frontend hook (for example `useAgentSurface(manifest)`) registers on mount and unregisters on unmount, so the registry always matches what is on screen.
- The full static list of manifests is also served by the backend so the agent can plan before a screen is open.

## 4. What the agent can ask the application to do

Three kinds of request. All are validated, gated, and logged.

| Request | Meaning | Example |
|---|---|---|
| `navigate` | Go to a route, optionally with filters or a subject. | Open the TFC audit filtered to exceptions. |
| `invoke` | Call a declared action on a screen. | `student360.draftMessage` for a student. |
| `annotate` | Point at something without changing it. | Highlight the contract status card. |

Proposed endpoints, under the workspace prefix so the section gate covers them:

| Method and path | Purpose |
|---|---|
| `GET /api/admin/admissions-ops/agent/manifest` | All screens and their actions. |
| `POST /api/admin/admissions-ops/agent/intents` | Submit a navigate, invoke or annotate request. Returns a result, or an approval reference when the level requires one. |
| `GET /api/admin/admissions-ops/agent/session` | Mode, who the agent is acting for, what it may do. |
| `GET /api/admin/admissions-ops/agent/log` | The audit log, filterable. |
| A server-to-browser channel (SSE or WebSocket) | Delivers navigate and annotate commands to the open workspace in Guide and Operate modes. |

Transport for the agent itself is open. The repo already has `backend/src/mcp/`, so exposing the
manifest actions as MCP tools is one option, and plain HTTP is another. Keep the transport behind
one interface and ask Ali and Taiwo which they want before building either.

## 5. Permission levels

From the blueprint, section VI. Enforced on the server for every action, whoever calls it.

| Level | Name | Examples | Agent may |
|---|---|---|---|
| 1 | Retrieve | Search records, emails, payments, progress, documents within authorized access | Run on its own |
| 2 | Analyze | Summaries, report comparisons, discrepancy alerts, follow-up priorities | Run on its own |
| 3 | Prepare for approval | Draft emails, texts, reports, enrollment decisions, proposed updates | Create the draft. A person sends or applies it. |
| 4 | Authorized routine actions | Create tasks, add approved notes, generate reports, other specifically permitted actions | Run on its own once that action is authorized, with a log entry |
| 5 | Mandatory human approval | Refunds, contract recalls, payment adjustments, suspensions, balance forgiveness, bulk communications, sensitive changes | Prepare only. Never execute. |

Hard rules, as server-side checks with tests:

- An agent-originated request for a level 5 action always produces an approval item and never executes.
- The agent cannot call any approve or decline endpoint.
- "Bulk" means more than one recipient. Fourteen personal emails are one bulk send.
- The agent must not invent a policy, promise a refund, release a contract, change a tuition obligation or make an unapproved commitment. Drafts that touch those subjects carry a visible note saying what they do not promise.
- Approved answers come from the Knowledge base at its current version. Historical email does not override it.

## 6. Approvals and the log

**Approvals.** Anything at level 3 or 5 lands in Approvals with: what, why, the records behind it,
the screen it came from, and who or what prepared it. A decision records the person and the time.
Demo: `demo/Approvals.html`.

**Audit log.** Append only. One row per agent request:

| Field | Notes |
|---|---|
| When | Stored in UTC, shown in Central |
| Actor | Agent identifier and version |
| On behalf of | The staff member |
| Mode | Answer, Guide or Operate |
| Screen and action | From the registry |
| Parameters | With sensitive values redacted |
| Sources read | System and record reference |
| Outcome | Done, drafted, sent to approval, refused, failed, with reason |

**Stop control.** One control in the dock stops the current run and drops the mode to Answer. A
global switch in Setup turns the agent off for everyone.

## 7. Phase 0 cut

Enough to prove the shape without connecting a model:

1. The manifest type and the registration hook.
2. A manifest for each of the 16 screens. Placeholders declare the actions they will have and mark them unavailable.
3. `GET .../agent/manifest`, gated by the workspace section.
4. The dock in the layout, in Answer mode, showing the current screen's suggestions from its manifest.
5. The audit log table and a write path, exercised by navigation events from the dock.
6. Tests: level 5 never executes for an agent actor, and the agent actor cannot approve.

Not in Phase 0: a model, the push channel, Guide or Operate mode, any external write.

## 8. Questions for Taiwo and Ali

1. What is the agent built on, and where does it run?
2. How does it authenticate to Enterprise? It needs a company-managed identity, not a personal session.
3. HTTP, MCP, or both?
4. Does it keep its own memory of investigations, or should saved findings in Enterprise be the only memory?
5. Which level 4 actions are authorized on day one? The blueprint names tasks, approved notes and report generation.
6. Who are the leadership approvers for level 5?
7. Is "AURA" the name?
