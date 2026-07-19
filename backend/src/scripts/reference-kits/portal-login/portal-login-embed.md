# Portal Login Embed Kit

Drop a **passwordless (magic-link) participant sign-in** onto ANY website with one `<script>` tag. An enrolled participant types their email, gets a secure sign-in link by email, clicks it, and lands in the Accelerator portal already authenticated.

- **Live, hosted file:** `https://enterprise.colaberry.ai/embeds/portal-login.js`
- **Source of truth (repo):** `frontend/public/embeds/portal-login.js` (baked into the nginx image by the CRA build)
- **Backend contract:** `POST /api/portal/request-link` → email link → `/portal/verify?token=…` → 7-day JWT (`backend/src/controllers/participantController.ts`, `backend/src/services/participantService.ts`)

---

## 1. Minimal embed (paste anywhere in the page)

```html
<div id="colaberry-portal-login"></div>
<script src="https://enterprise.colaberry.ai/embeds/portal-login.js" defer></script>
```

That is the whole install. If the `<div>` is omitted, the widget inserts itself right after the script tag.

## 2. Customize (all optional, `data-*` on the `<script>` tag)

| Attribute | Default |
|---|---|
| `data-heading` | "Access the Accelerator Portal" |
| `data-subtext` | "Enter your enrollment email and we'll send you a secure sign-in link." |
| `data-mount`   | `colaberry-portal-login` (id of the container to render into) |
| `data-portal`  | `https://enterprise.colaberry.ai` (only change to target a different environment) |

```html
<div id="partner-login"></div>
<script src="https://enterprise.colaberry.ai/embeds/portal-login.js"
        data-mount="partner-login"
        data-heading="Partner Portal Access"
        data-subtext="Sign in with your Colaberry enrollment email."
        defer></script>
```

You can also set `window.ColaberryPortalLogin = { portal, heading, subtext, mount }` before the script loads instead of using `data-*`.

## 3. No-script fallback

For CMSs that block inline scripts, just link to the hosted login page:

```html
<a href="https://enterprise.colaberry.ai/portal/login">Log in to the Accelerator Portal</a>
```

---

## How it works

Passwordless flow (no passwords stored or entered):

1. Widget POSTs `{ "email": "…" }` to `{portal}/api/portal/request-link`.
2. Backend emails the participant a link: `{portal}/portal/verify?token=<uuid>` (token valid 24h).
3. Clicking it calls `GET /api/portal/verify?token=…`, which returns a 7-day JWT; the portal stores it and the user is in.

## Behavior (matches the API exactly)

- **Generic success** — always shows "if an active enrollment exists, a link is on its way." The API deliberately does not confirm whether an email is enrolled (anti-enumeration).
- **Pending approval** — if the enrollment exists but portal access is not yet enabled, the API returns `{ success:false, message }` and the widget shows that message.
- **Error** — friendly retry message; the outbound call has a 15s timeout so the UI never hangs.

## Why a script, not an iframe

The portal's nginx sends a global `X-Frame-Options: SAMEORIGIN`, which **blocks cross-origin iframes**. A `<script>` renders into the host page's own DOM (XFO does not apply) and its only network call is a `fetch()` the API already allows cross-origin (`Access-Control-Allow-Origin: *`).

## Limits / gotchas

- Authenticates **existing, portal-enabled enrollments only** — it is a login, not a public signup.
- Cross-origin works because the API's CORS is currently open to all origins. If that is ever narrowed to an allowlist, partner domains must be added (or fall back to the plain link above).
- To self-host: copy `portal-login.js` to your own static host and set `data-portal` to the API origin (`https://enterprise.colaberry.ai`).
