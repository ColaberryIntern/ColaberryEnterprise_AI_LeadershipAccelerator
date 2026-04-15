# Per-User Project Preview Stacks Directive

**Status:** Decisions D1–D5 approved (2026-04-15). Open Questions resolved inline below. Ready for Phase 1 implementation.

## Goal

Every user added to the Accelerator has one or more projects. Each project is a full-stack application the user is building (frontend + backend + data). The Accelerator Portal must show the user's **own running application** inside BP preview iframes — not the Colaberry Accelerator's own UI, not demo data, not a shared sandbox.

"Preview" = a live, isolated instance of the user's project, booted from their uploaded GitHub repo and configured by their requirements document, reachable from the portal via a stable URL.

The target state mirrors today's Dev 1 / Dev 2 / ShipCES / LandJet setup, but automated and scaled so every user gets the same thing without manual VPS work per user.

## Non-Goals

- Running any user code outside an isolated container boundary.
- Providing demo or synthetic data. Data comes from what the project's repo defines (migrations, seeds) or what the user enters during use.
- A general-purpose PaaS for arbitrary workloads. This is scoped to projects following the Accelerator's expected shape (see Repo Contract).

## Decision Points (require sign-off before build)

These five choices determine the architecture. Recommendation shown after each; mark each one ✅ Approved / ❌ Change to: … .

### D1. Orchestration platform
How project stacks are booted, supervised, and torn down.

- **(a)** Docker Compose + a provisioning service on the current VPS. Simple, single-host, easy to operate. Caps scaling at ~the RAM/CPU of one VPS.
- **(b)** Docker Swarm or Kubernetes on multiple nodes. Scales horizontally. Significant operational overhead.
- **(c)** External PaaS (Fly.io, Railway, Render). Offloads infra. Predictable per-stack billing. Vendor lock-in, cost visibility matters.

**Approved:** ✅ (a) for Phase 1–2; migrate to (b) or (c) when concurrent active stacks > ~20 or VPS CPU/RAM hits 70% sustained.

### D2. Routing
How users reach their running stack from the portal.

- **(a)** Path-based: `https://enterprise.colaberry.ai/preview/{project-slug}/` — matches today's ShipCES/LandJet pattern, one TLS cert, nginx reload per provision.
- **(b)** Subdomain: `https://{project-slug}.preview.colaberry.ai` — cleaner, no path rewrites (avoids the sub_filter/asset-path hacks in current nginx), but requires wildcard TLS + DNS automation (Cloudflare API or ACME DNS-01).

**Approved:** ✅ start with (a), migrate to (b) once we hit the first real problem caused by path rewrites (Next.js apps, SPAs with absolute asset paths, etc. — LandJet already required special sub_filter rules).

### D3. Lifecycle
When stacks are running and when they're stopped.

- **(a)** Always-on. Predictable UX, highest cost.
- **(b)** Wake-on-access. Container stopped after N minutes idle; first iframe hit boots it (loading state shown in portal). Lowest cost, adds a 10–30s cold-start on first visit.
- **(c)** Scheduled-on. Runs only during cohort class hours + some buffer. Cheapest, least flexible.

**Approved:** ✅ (b) with a 30-minute idle timeout and a loading placeholder in the iframe. Matches how students actually use the portal — short sessions with gaps.

### D4. Provisioning trigger
What causes a stack to be created.

- **(a)** Admin-manual button on the admin Projects page. Predictable, gated, visible.
- **(b)** Auto on enrollment activation (portal_enabled flipping true).
- **(c)** Auto on first project-creation event in the portal (user fills out project setup wizard).

**Approved:** ✅ Phase 1 = (a). Phase 2 = (c), because not every enrollment results in a completed project — provisioning on project creation avoids allocating resources to enrollments that never set up.

### D5. Repo contract
What we require project repos to include so we can boot them.

- **(a)** Language-specific: Node backend + Postgres + React frontend (the Accelerator's own shape). Rigid, easy to automate.
- **(b)** `docker-compose.preview.yml` in the repo root, declaring the stack. Repo owner decides the shape; we only need to run it. Flexible.
- **(c)** Hybrid: (b) if present, else fall back to (a) with heuristics.

**Approved:** ✅ (b). Publish a `docker-compose.preview.yml` template in the Accelerator docs. Students without one get a clear "Preview not configured — add docker-compose.preview.yml to your repo" message instead of a broken iframe. (c) is tempting but hides the contract.

## Architecture (assuming recommended decisions)

```
Portal iframe                                  (per project)
   │
   │  https://enterprise.colaberry.ai/preview/{slug}/
   ▼
Docker nginx (accelerator-nginx)
   │  location /preview/{slug}/ → proxy_pass http://preview-router:PORT/
   ▼
Preview Router (new service, Node)
   │  1. Look up {slug} in preview_stacks table → get stack state + ports
   │  2. If stopped, boot `docker compose -f stacks/{slug}/docker-compose.preview.yml up -d`
   │  3. Proxy request to the booted stack's frontend port
   │  4. Touch last_accessed_at for idle-reaper to see
   ▼
Per-project compose stack
   ├─ frontend (built from user's repo)
   ├─ backend  (from user's repo)
   ├─ db       (named volume: preview-{slug}-db)
   └─ (any other services the repo declares)

Idle Reaper (cron, every 5 min)
   └─ stop stacks where last_accessed_at > 30 min ago
```

## Inputs

- Project's `github_repo_url` (already on `projects` table).
- Project's uploaded requirements document (already in repo or `project_variables`).
- A `docker-compose.preview.yml` in the repo root (per D5).
- An admin action to provision / re-provision (Phase 1), or a project-creation event (Phase 2+).

## Outputs

- A running, idle-managed compose stack per project, keyed by project slug.
- Project row's `portfolio_url` automatically set to `/preview/{slug}` on provision.
- Nginx location block `/preview/{slug}/` live and reachable.
- Preview router tracking last-access and orchestrating boot/stop.

## Database Schema (new tables)

### `preview_stacks`
- `id` UUID PK
- `project_id` UUID FK → projects.id (unique)
- `slug` varchar UNIQUE — URL-safe identifier used in `/preview/{slug}/`
- `status` enum (`provisioning`, `running`, `stopped`, `failed`, `tearing_down`)
- `stack_path` varchar — filesystem path to cloned repo + generated compose file
- `frontend_port` int — host port the frontend listens on (allocated per-stack)
- `backend_port` int NULL
- `db_volume` varchar — named volume for DB persistence
- `repo_url` varchar — snapshot of repo URL at provision time
- `repo_commit_sha` varchar — what commit is currently running
- `last_accessed_at` timestamp — updated by the router on every request
- `last_started_at`, `last_stopped_at` timestamps
- `failure_reason` text NULL
- `created_at`, `updated_at` timestamps

### `preview_events` (audit log)
- `id` UUID PK
- `preview_stack_id` UUID FK
- `event_type` enum (`provision`, `boot`, `stop`, `teardown`, `rebuild`, `access`, `error`)
- `detail` jsonb
- `created_at` timestamp

## API Endpoints

### Admin
- `POST /api/admin/preview-stacks/:project_id/provision` — clone repo, build, allocate ports, create nginx block, record `preview_stacks` row.
- `POST /api/admin/preview-stacks/:project_id/rebuild` — re-pull repo at HEAD, re-build images, restart.
- `POST /api/admin/preview-stacks/:project_id/teardown` — stop stack, remove nginx block, drop DB volume (with confirm).
- `GET /api/admin/preview-stacks` — list all stacks with status + resource use.

### Internal (preview-router → backend)
- `POST /api/internal/preview-stacks/:slug/touch` — update `last_accessed_at`.
- `GET /api/internal/preview-stacks/:slug` — return stack config for routing.

### Portal (student)
- `GET /api/portal/project/preview-status` — returns `{ status, can_provision, last_error }` so the portal can show "provisioning…", "booting…", "preview not configured", etc., in the iframe area.

## Security Constraints

- Each stack runs under a dedicated unix user or Docker `user` directive — no host access.
- Each stack's DB volume is per-stack only; volumes never shared across projects.
- Per-stack CPU / memory limits (e.g., `cpus: 0.5`, `mem_limit: 512m`) — one noisy stack can't starve the VPS.
- Preview router enforces: a student can only touch/boot their **own** stack (auth via portal JWT → project ownership check).
- Outbound network restricted to HTTPS where feasible; no SMTP, no raw TCP to internal hosts.
- `docker-compose.preview.yml` is linted before first boot: reject stacks that mount host paths, request privileged mode, or declare ports outside the allocated range.
- Repos are cloned over HTTPS with a read-only deploy token per stack, never with the platform's admin credentials.

## Edge Cases

- **Repo has no `docker-compose.preview.yml`** → mark stack `failed` with reason; portal shows actionable message.
- **Repo clone fails (private repo, missing token)** → `failed`, surface reason in admin UI.
- **Stack boot fails (bad Dockerfile, missing env)** → `failed`, capture `docker compose logs` tail into `preview_events.detail`.
- **VPS out of disk / memory** → provisioning refuses with a clear error; admin notified.
- **Port exhaustion** → port allocator draws from a pool (e.g., 10000–10999); admin UI warns when < 20% free.
- **Repo updated after first provision** → rebuild endpoint re-pulls; student can trigger it from the portal.
- **Preview router crash** → systemd / compose restart policy; stacks continue running, just lose idle-reaping until router is back.
- **Student adds a second project (future multi-project)** → unique slug per `(user, project_name)`, not per user; schema already supports this because `preview_stacks.project_id` is the FK.

## Verification (acceptance criteria)

A change is complete only if all of the following pass:

- [ ] Admin can provision a stack for the Accelerator project; `/preview/accelerator/` serves the Accelerator's own frontend from a separate container, NOT the live portal.
- [ ] Provisioning a stack does not interrupt other running stacks.
- [ ] Idle reaper stops stacks after 30 minutes; next access boots within 30 seconds.
- [ ] Tearing down a stack removes the nginx block and the DB volume; no residue left on disk.
- [ ] A repo without `docker-compose.preview.yml` produces a clear portal message, not a broken iframe.
- [ ] Student A cannot touch/boot/teardown Student B's stack (auth test).
- [ ] Resource caps enforced: a stack that tries to allocate 4 GB RAM is killed by its own cgroup limit, not by the host.
- [ ] Provisioning and teardown both produce `preview_events` audit rows.
- [ ] Dev 1, Dev 2, and prod all deploy the same preview-router version (per memory rule on dev parity).

## Phased Rollout

### Phase 1 — Manual, single-project-per-user (target: end of workstream review cycle)
Decisions D1(a), D2(a), D3(b), D4(a), D5(b).

Deliverables:
- `preview_stacks` + `preview_events` tables + migrations.
- `preview-router` service (Node/Express) on the VPS.
- Admin UI section on `/admin/projects` — per-project card: status, Provision / Rebuild / Teardown buttons.
- `POST /api/admin/preview-stacks/*` endpoints.
- Nginx block template + hot-reload on provision.
- First use: provision Accelerator's own project, verify iframe now hits the isolated stack (closes the current bug).

### Phase 2 — Auto-provisioning on project creation
- Hook into project setup wizard → provision stack on save.
- Idle reaper + portal loading-state.
- Per-student stack resource caps hardened.

### Phase 3 — Multi-project per user
- Extend portal to support `enrollment → projects 1:many`.
- Add project switcher to portal nav (closes the "both projects open" ask from earlier).
- Slug collision handling.

### Phase 4 — Scale out
- Move to D1(b) or D1(c) when VPS headroom shrinks.
- Move to D2(b) subdomains if path rewrites block specific frameworks.

## Open Questions — Resolved (2026-04-15)

1. **Cost model.** No per-stack monetary cost while we stay on the current VPS — new stacks consume existing CPU/RAM/disk until the box is saturated. Costs only appear when we scale out (bigger VPS, second VPS, or PaaS migration). See "Cost Model" section below for the full picture and the threshold that triggers escalation.
2. **Private repo support.** Reuse the existing GitHub connection flow. Users who have connected a GitHub token (stored as `access_token_encrypted` on their github connection, per `backend/src/services/githubService.ts`) will have that token used for `git clone` of the preview stack. If no token is present, provisioning fails with a clear "connect GitHub first" message — same pattern the portal already uses for repo file-tree fetches.
3. **Data retention on teardown.** Teardown stops the running stack but **preserves** the DB volume. When the stack is re-provisioned (manual admin action or student opens the project again), the volume is reattached and a sync step brings the stack back up in the state the student left it. A "hard teardown" admin action exists separately for the destructive case (e.g., schema incompatibility requires a fresh start) and must be confirmed twice.
4. **Cold-start UX.** 10–30s cold starts are acceptable. During boot: dim the iframe area (opacity 0.4 + non-interactive) and overlay a clear message like "Booting your preview — this takes 10–30 seconds on first access. We'll unlock it as soon as it's ready." Auto-unlock on ready.
5. **Sessions across cohorts.** After a student's cohort ends + a configurable grace period (default: 30 days), the running stack is torn down and the repo + DB volume are archived (tar.gz + offloaded to cheap storage). A stack in "archived" status can be rebuilt on demand by admin or by the student re-engaging, restoring the exact prior state.

## Cost Model

**On the current VPS (Phase 1–2): no per-stack monetary cost.** Each new stack consumes a slice of existing CPU/RAM/disk on the Hetzner VPS we already pay for. Adding students = adding load on a machine we already run. The bill does not increase until we outgrow one box.

**What drives costs later:**

- **Concurrent active stacks.** Idle stacks are stopped (D3(b), 30-minute idle timeout), so only *concurrently active* stacks consume RAM. If a typical stack is ~500 MB RAM and the VPS has ~24 GB usable after the existing services, we have headroom for roughly 30–40 concurrent active stacks before we start paging to disk.
- **Disk per archived stack.** Stopped stacks keep their DB volume (~a few hundred MB each, usually). This grows linearly with total students. Cheap, but worth watching.
- **CPU burst.** Cold starts (boot from stopped) and `npm install` on provision are CPU-heavy. Enough concurrent provisions can saturate the VPS briefly; the provisioning service will serialize beyond a configured parallelism cap.

**Escalation thresholds (when we need to spend money):**

- Sustained VPS CPU > 70% for more than an hour → consider a bigger VPS (~2× cost).
- Concurrent active stacks regularly > 20 → plan migration to D1(b) Swarm/K8s or D1(c) PaaS.
- Disk used > 70% → evict archived stacks older than the grace period, or add a volume.

Nothing about Phase 1 itself adds a recurring bill. If we hit any of the thresholds above, that's a separate decision (bigger VPS vs. multi-host vs. PaaS) that deserves its own escalation when it actually matters — not now.

## Next Step

All blockers resolved. Proceeding to Phase 1 implementation on approval of this directive.
