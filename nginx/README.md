# nginx

Serves the frontend and fronts the backend API. Also the reason "deploy the frontend" means "rebuild nginx."

---

## The build

[Dockerfile](Dockerfile) is multi-stage:

1. `node:20-alpine` — `npm ci` at the **workspace root** (both `backend/package.json` and `frontend/package.json` are copied in first), then `npm run build:frontend`.
2. `nginx:alpine` — copy `frontend/build` to `/usr/share/nginx/html`, copy `nginx.conf` to `/etc/nginx/conf.d/default.conf`.

`REACT_APP_API_URL` is set empty at build time, so the frontend calls the API on the same origin and nginx proxies it.

**Consequence: the compiled frontend lives inside this image.** A frontend change requires:

```bash
docker compose -f docker-compose.production.yml up -d --build nginx
```

Two known traps:

- **`npm ci` must run at the repo root.** Running it inside a single workspace prunes the sibling's dependencies.
- **`--build nginx` alone can bounce the backend** because of the dependency edge. Add `--no-deps` when you intend to touch nginx only.

## Variants

| File | Used by |
|---|---|
| `Dockerfile` / `nginx.conf` | Production |
| `Dockerfile.dev` / `nginx.dev.conf` | Dev stack (`docker-compose.dev.yml`), served at `localhost:8888` |
| `Dockerfile.dev2` / `nginx.dev2.conf` | Retired second dev instance. Kept for reference; **only one dev instance is live.** |

---

## What `nginx.conf` does

**Security headers**, set at the origin. Cloudflare terminates TLS in front, but HSTS is declared here so it holds regardless of what edge config sits ahead: `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`, and a CSP.

The CSP is deliberately permissive — `'self' + https:` plus the `d3js.org` CDN the public site loads, and `'unsafe-inline'` for CRA's inlined webpack runtime chunk and Bootstrap's injected `<style>` tags. Tightening it to nonces is a live re-test, not a config edit.

**Gzip** for text, JSON, JS, XML, and SVG.

**Preview proxying** — routes like `/preview/shipces/` proxy to a host-side preview stack over `host.docker.internal`, with `sub_filter` rewriting asset paths. API paths are deliberately *not* rewritten: `api.ts` prefixes them at runtime, so rewriting here too would double-prefix them.

**SPA fallback** so client-side routes resolve to `index.html`.

---

## The `try_files` trap

This one has cost real debugging time:

**`try_files` SPA fallback discards your `add_header` directives.** The internal redirect lands in a different location block (`location = /index.html`), and nginx's `add_header` inheritance does not follow it. Headers you carefully set on the outer block simply are not there on the HTML response.

Use `rewrite ^ /index.html break;` instead when headers must survive.

Test any config change in a throwaway nginx container before it reaches production. A malformed config takes down the whole public surface, and the failure appears as a total outage rather than a partial one.
