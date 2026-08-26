# Backend operational scripts

**531 files.** One-off operations that need the backend's models, services, and environment. Disposable by intent, auditable by requirement.

Conventions are in [CLAUDE.md](CLAUDE.md) — read it before adding a script. This README is the map of what is already here.

Scripts that operate on the repo, the VPS, or an external system without needing backend internals live in [../../../scripts/](../../../scripts/README.md) instead.

---

## Composition

Grouped by verb prefix, which is the naming convention:

| Prefix | Count | What they do |
|---|---|---|
| `send*` | 91 | Mandrill SMTP sends — the single largest category |
| `render*` | 16 | Render HTML/PDF/PNG deliverables |
| `backfill*` | 15 | Backfill data after a schema or logic change |
| `build*` | 10 | Build reports, dashboards, packages |
| `run*` | 8 | Drive a multi-step pipeline |
| `fix*` | 8 | Corrective one-offs against data or state |
| `create*` | 7 | Create records, projects, users |
| `generate*` | 3 | Generate content or artifacts |
| `basecamp*`, `audit*`, `process*`, `add*` | 2 each | Basecamp ops, diagnostics, processing, additions |

Plus recurring jobs that outgrew "one-off" but still live here: `weeklyCohortReport.js`, `weeklyInternReport.js`, `weeklyLaunchPmoDashboardPost.js`, `vipInboxWatcher.js`, `vipSmsRouter.js`.

Tests: 5 files, including `taskPromptWorker.test.ts` and `__tests__/govContractsTurnWatcher.test.ts`.

> **`.js` scripts never reach `dist/`.** `allowJs` is off, so plain-JS scripts here are run with `node` against the source tree, not the compiled build. On production that means `docker cp` into the container and run from source.

---

## The canonical patterns

### Mandrill send

Every `send*.js` follows the same shape: load `.env` from the repo root, hard-fail if `MANDRILL_API_KEY` is missing, build a nodemailer transport against `smtp.mandrillapp.com:587`, send with `X-MC-Track: none` on personal or internal mail, exit non-zero on failure. The full template is in [CLAUDE.md](CLAUDE.md).

Two content rules are enforced, both pre-send checklist items:

1. **No em-dashes.** `grep -c $'\xe2\x80\x94' <script>` must return 0. `.claude/hooks/check-emdash.sh` enforces this.
2. **Branded signature on every send** — the navy-bordered HTML table plus its plain-text equivalent. The body prose must **not** end with "Ali" or "Ali Muwwakkil", because the signature already names him. Never double-sign.

Mandrill is the send transport as a matter of policy. The Gmail API is for drafts and mailbox reads.

### Header comment

Every script opens with a JSDoc block giving one-line purpose, 2-4 lines of context (why it exists, who asked, inputs and outputs), a `Run:` line, and an output destination if it writes one. A script without this is not reviewable a month later, which defeats the point of keeping them.

### Idempotency

- Transactional sends dedupe on `(recipient, subject, business_event_id)` **before** `transport.sendMail`.
- Campaign sends dedupe on `(campaign_id, recipient)`.
- Re-running a script must not re-send. Where duplicate prevention is genuinely hard, log loudly and require `--allow-duplicate`.

This is the rule that gets violated most often and costs the most when it is.

### Secrets

Env vars only — `MANDRILL_API_KEY`, `MSSQL_*`, `BASECAMP_ACCESS_TOKEN`. Never logged; mask to the first 8 characters if a token must be printed. Tokens from rotating sources (the CCPP `Basecamp_AuthInfo` table) are fetched fresh each run and never written to disk.

---

## PROGRESS tracking

The distinction trips people up:

- **The script file landing in the repo** needs a progress entry.
- **Running it** — sending the email, creating the Basecamp todo, pulling the data — does not.

---

## When *not* to add a script here

| Situation | Where it belongs |
|---|---|
| Reusable logic | `backend/src/services/` |
| Recurring job | A worker with a scheduler entry |
| Frontend concern | `frontend/src/` |
| Operates on repo/VPS/external only | `../../../scripts/` |

The bar for this directory: *"I need to do this once or a few times, and the trail of having run it matters."* Anything more permanent is a service.
