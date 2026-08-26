# preview-db-init

Postgres initialization SQL for **ephemeral per-user preview stacks**.

Scripts here run once, on first boot of a fresh preview database container, via the standard Postgres `/docker-entrypoint-initdb.d` mechanism. They do not run against dev or production databases.

| File | Purpose |
|---|---|
| `01-enable-pgvector.sql` | Enables the `pgvector` extension so a preview database matches production's `pgvector/pgvector:pg15` image |

---

## Context

The backend can provision an isolated Docker stack per user so a student or reviewer gets a live, running copy of their project rather than a screenshot. Each stack gets its own database, which is why this directory exists.

Governing configuration, from `docker-compose.production.yml`:

| Setting | Value |
|---|---|
| `PREVIEW_STACKS_ROOT` | `/var/preview-stacks` |
| `PREVIEW_PORT_POOL_START` / `_END` | `10000` - `10999` |
| `PREVIEW_IDLE_TIMEOUT_MS` | `1800000` (30 min, then reaped) |
| `PREVIEW_CPU_LIMIT` | `0.5` |
| `PREVIEW_MEM_LIMIT` | `512m` |

Implementation: `backend/src/services/previewStackService.ts` and `previewStackReaper.ts`. Proxying: `backend/src/middlewares/previewProxyMiddleware.ts`, mounted at `/preview` **before** the JSON body parser.

Full procedure and the security sign-off: [../directives/per-user-project-previews.md](../directives/per-user-project-previews.md).

> **Security note.** Preview provisioning requires mounting the Docker socket into the backend container, which grants that container effective root on the host. This was accepted deliberately and is documented at the directive's sign-off. Treat any change to preview provisioning as security-relevant.

---

## Adding an init script

- **Numeric prefix ordering**: `02-`, `03-`. Postgres runs them alphabetically.
- **Idempotent**: use `CREATE EXTENSION IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`.
- **Fast**: this runs on every preview stack launch. A slow init script is a slow preview.
- **Never put seed or customer data here.** Preview stacks are disposable and unauthenticated at the database layer.
