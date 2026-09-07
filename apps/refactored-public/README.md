# Refactored.ai — retired, redirects to Colaberry Enterprise

**There is no site here any more.** On 2026-09-07 the decision was taken to retire the old
Refactored portal rather than redesign it. `refactored.ai` and `www.refactored.ai` now
return `301` to `https://enterprise.colaberry.ai/` for every path.

The app directory survives the retirement because the build and a test guard both need it,
not because it serves anything. `src/index.html` is a single fallback page that should
never render in production — see the comment at the top of that file for why it exists and
why it deliberately does not auto-redirect.

## Not in effect yet

The redirect is committed, not live. `refactored.ai`'s apex and `www` are Route 53 ALIAS
records pointing at an AWS Network Load Balancer that still serves the legacy learning
platform. Moving them requires credentials for that AWS account, and as of 2026-09-07
nobody has confirmed holding them.

`refactored-preview.colaberry.ai` runs the identical redirect and **is** ours, so the
behaviour can be verified there before any DNS moves.

## What the redirect deliberately breaks

The legacy platform answers on this hostname today: Auth0 sign-in at
`login.refactored.ai`, a student dashboard, and roughly 1,900 `/course/` and `/learn/`
pages. After the DNS move they stop answering. That is the intended outcome of retiring
the portal, and it is the reason the cutover is worth doing deliberately rather than
quietly.

## Why every path lands on the destination's root

`enterprise.colaberry.ai` is a React single-page app with a catch-all route, so every path
there returns `200` whether or not it exists. `/individuals`, `/organizations` and
`/enterprise` all answered `200` when checked and none is a real route. A path-preserving
map would have passed testing and delivered every visitor to a not-found component.

## Build

```bash
npm run build          # emits dist/
```

No dependencies, no bundler — see the comment at the top of `packages/app-build/index.js`.

## What is kept, and why

| Path | Kept because |
|---|---|
| `legacy-capture/` | The archive of what the site was. Not built, not served. |
| `port-from-capture.js` | Documents how the port was done. Guarded so it cannot be run by accident and resurrect the retired pages. |
| `brand.config.js` | Stable slugs only. Still resolves the `refactored` brand for historical events and any lead that references it. |
| `EXTRACTION.md` | What would move with this app if it were ever lifted out. |
