# config

Operational settings that are **data, not code** — values an operator changes without a deploy.

Distinct from `backend/src/config/`, which holds TypeScript config modules (`env.ts`, `database.ts`, `featureFlags.ts`). This directory holds JSON read at runtime by scripts.

---

## Files

| File | Read by |
|---|---|
| `strategic-product-roadmap-settings.json` | `backend/src/scripts/intakeNewProducts.js` and its helpers, plus `announceIntakePipelineLive.js` and `announceAll5BuildsProvisioned.js` |

### `strategic-product-roadmap-settings.json`

Operational settings for the Strategic Product Roadmap intake pipeline: the Basecamp account, project, list, message-board, and todoset IDs it writes into, plus pipeline behavior.

Owned by Ali. A human-readable mirror lives in the Strategic Product Roadmap Basecamp vault; either can be updated and CB-AI keeps them in sync.

```bash
node backend/src/scripts/intakeNewProducts.js --count 1 --dry-run
node backend/src/scripts/intakeNewProducts.js --slug "Financial Operations Platform"
```

Always `--dry-run` first. This script writes to a real Basecamp project.

---

## Rules

- **Configuration only, never secrets.** Basecamp project IDs are fine here; tokens and API keys are not. Those live in env vars on the VPS or in the CCPP rotation tables.
- **Carry a `$schema` description and `lastUpdated`**, as the existing file does. A settings file nobody can date is a settings file nobody trusts.
- **Note the consumer.** If a script reads it, say which one — that is the only way a reader knows whether editing it is safe.
- Values that change per environment belong in env vars, not here. This directory is for settings that are the same everywhere and change only when a human decides they should.

> Note: this directory is currently **untracked in git** — it exists on Ali's machine and on the VPS but is not committed. Any script that reads from it will fail on a fresh clone until the file is provided.
