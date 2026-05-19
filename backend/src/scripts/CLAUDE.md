# backend/src/scripts/CLAUDE.md
**Local conventions for one-off operational scripts.** Root rules in `/CLAUDE.md` apply. `backend/CLAUDE.md` applies. This file covers script-specific conventions.

## What lives here
Disposable but auditable one-shot operations:
- `send*.js` — Mandrill SMTP send scripts (Lakeesha tax response, Alluvium W-2, Coca-Cola reply, install emails, etc.)
- `basecamp*.js` — Basecamp API operations (token pull, todo creation, project discovery)
- `fix*.js`, `complete*.js`, `retry*.js` — corrective scripts (one-off fixes to data or state)
- `discover*.js` — read-only exploration scripts
- `scrape*.js`, `prepare*.js`, `push*.js` — multi-stage data pipelines (e.g., Suralink → Basecamp)
- `verify*.js`, `audit*.js` — diagnostic scripts that compute and report

## Required naming
- camelCase verb + object: `sendNIWRecommendationOlasiji.js`, `prepareSuralinkFromZips.js`, `completeSuralinkBasecampTodos.js`.
- The verb says what it does; the object says what it does it to. Avoid generic names like `script.js`, `helper.js`, `runner.js`.

## Required header comment
Every script begins with a JSDoc block:
```js
/**
 * <one-line purpose>
 *
 * <2-4 lines of context: why this exists, who asked for it, what inputs/outputs>
 *
 * Run: `node backend/src/scripts/<filename>.js`
 *
 * (optional) Output: <path or destination>
 */
```

## The Mandrill SMTP pattern (canonical)
Every email send script follows this shape:
```js
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

if (!process.env.MANDRILL_API_KEY) {
  console.error('FATAL: MANDRILL_API_KEY not set.');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: 'smtp.mandrillapp.com',
  port: 587,
  auth: {
    user: process.env.MANDRILL_USERNAME || 'ali@colaberry.com',
    pass: process.env.MANDRILL_API_KEY,
  },
});

// ... build TEXT_BODY and HTML_BODY with branded signature appended ...

transport.sendMail({
  from: '"Ali Muwwakkil" <ali@colaberry.com>',
  to: 'recipient@example.com',
  cc: [...],
  bcc: 'ali@colaberry.com',
  subject: '...',
  text: TEXT_BODY,
  html: HTML_BODY,
  headers: {
    'X-MC-Track': 'none',         // no tracking pixels on personal/internal
    'X-MC-AutoText': 'false',
  },
}).then(r => { console.log('Sent:', r.messageId); process.exit(0); })
  .catch(e => { console.error('Failed:', e.message); process.exit(1); });
```

## Style rules for outgoing email content
Both rules are enforced by Ali; both are pre-send checklist items:

1. **No em-dashes.** Run `grep -c $'\xe2\x80\x94' <script>` before send. Must return 0. Use commas, periods, or a hyphen. (Article reference for context, not for content style.)
2. **Branded signature on every Mandrill send.** HTML body must include the navy-bordered signature table; text body must include the plain-text equivalent. See user memory `reference_email_signature.md` for the canonical block. Body prose should NOT end with "Ali" or "Ali Muwwakkil" since the signature names him.
3. **Handwritten signature PNG** at `c:/Users/ali_m/Downloads/ali signature.png` is reserved for formal PDFs (letters, recommendations, contracts). Not for routine emails.

## Idempotency
Per root CLAUDE.md > Idempotency & Replayability: every send script must dedup. Specifically:
- Transactional sends: dedup on `(recipient, subject, business_event_id)` before transport.sendMail.
- Campaign sends: dedup on `(campaign_id, recipient)`.
- Re-running a script must NOT re-send. If duplicate prevention is hard, log loudly and require an `--allow-duplicate` flag.

## Secret hygiene
- Env vars only: `MANDRILL_API_KEY`, `MSSQL_*`, `BASECAMP_ACCESS_TOKEN`, etc.
- Never log a secret. If a script needs to print a token for debug, mask everything except the first 8 chars.
- Tokens fetched from rotating sources (CCPP `Basecamp_AuthInfo`) are fetched fresh each run, never persisted to disk.

## Not in PROGRESS.md
Per root CLAUDE.md, the following do NOT need PROGRESS.md entries:
- Mandrill emails sent on Ali's behalf
- Basecamp ticket creation
- Ad-hoc data pulls / discovery scripts

The script FILE going into the repo does need a PROGRESS.md entry. The SEND/EXECUTION of it does not.

## When NOT to add a script here
- If it's a reusable service, lift it into `backend/src/services/`.
- If it's a recurring job, build it as a worker with a scheduler entry.
- If it's frontend-related, this is the wrong folder.

The bar for adding a script here is "I need to do this thing once or a few times, and the trail of it being run matters." Anything more permanent belongs in a service.
