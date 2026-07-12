# Enterprise CRM — "Call Me Now" Callback Contract

**Endpoint owner:** enterprise.colaberry.ai (this repo)
**Consumer:** training.colaberry.com
**Companion contract:** `enterprise-crm-lead-contract.md` (POST /api/v1/leads) — this endpoint uses the **same auth and rate limiter**.

When a visitor on training.colaberry.com asks to be **called right away**, training.colaberry.com's **server** POSTs to this endpoint. The enterprise backend then places an outbound AI voice call (Synthflow "Cora" outbound agent) using the knowledge base already attached to that agent in Synthflow.

---

## 1. Endpoint

```
POST https://enterprise.colaberry.ai/api/v1/request-callback
```

| | |
|---|---|
| Method | `POST` |
| Content-Type | `application/json` |
| Auth | `Authorization: Bearer <ENTERPRISE_CRM_TOKEN>` (same token as /api/v1/leads) |
| Rate limit | 300 requests / minute (shared with /api/v1/leads) |

> **SECURITY — call this from your SERVER, never the browser.** `ENTERPRISE_CRM_TOKEN` is a shared secret. If the browser called this endpoint directly, the token would be exposed in client code and anyone could trigger paid phone calls. The flow is: **browser → training.colaberry.com backend → enterprise.colaberry.ai**.

---

## 2. Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string (1–255) | ✅ | Used as the call recipient name + agent variable |
| `email` | string (email, ≤255) | ✅ | Identity; used to dedup/resolve the lead |
| `phone` | string (7–50) | ✅ | The number to dial. E.164 preferred (`+19725551234`) |
| `source` | string (1–100) | ✅ | e.g. `training.colaberry.com` |
| `interest_area` | string (≤255) | — | Passed to the agent as a variable (`{{interest_area}}`) |
| `company` | string (≤255) | — | Passed to the agent |
| `title` | string (≤255) | — | Passed to the agent |
| `role` | string (≤100) | — | Stored on the lead |
| `industry` | string (≤100) | — | Stored on the lead |
| `company_size` | string (≤50) | — | Stored on the lead |
| `message` | string (≤5000) | — | Free-text context the visitor gave |
| `consent_contact` | boolean | — | Record the visitor's consent to be contacted |
| `strapi_lead_id` | string (≤100) | — | Your lead id — strengthens idempotency if sent |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` | string (≤200) | — | Attribution |
| `referrer`, `landing_page`, `last_touch_page` | string (≤500) | — | Attribution |
| `first_touch_at`, `last_touch_at` | ISO-8601 w/ offset | — | Attribution |
| `device` | `mobile` \| `tablet` \| `desktop` | — | Attribution |

> There is **no `prompt` field**. The agent's script and knowledge base live in Synthflow and stay server-controlled. Per-call dynamism is expressed through the structured fields above (they become Synthflow `custom_variables`). Any `prompt` field you send is ignored.

### Minimal example

```json
{
  "name": "Jane Doe",
  "email": "jane@acmecorp.com",
  "phone": "+19725551234",
  "source": "training.colaberry.com",
  "interest_area": "AI + Job Readiness"
}
```

---

## 3. Responses

The body always includes a `status`. Branch on it.

| HTTP | `status` | Meaning |
|---|---|---|
| `202 Accepted` | `call_initiated` | Call handed to Synthflow. `call_id` is returned. |
| `200 OK` | `deduplicated` | A callback to this person already fired in the last 5 minutes. No second call placed. Returns the earlier `call_id`. |
| `200 OK` | `blocked` | A safety rule stopped it (unsubscribed / rate limit / scheduler paused / test-mode misconfig). `reason` explains. |
| `200 OK` | `skipped` | Voice is not configured (feature off, no API key, no agent id). `reason` explains. Deterministic no-op, not an error. |
| `502 Bad Gateway` | `failed` | Synthflow upstream error. Safe to retry. `reason` has detail. |
| `400 Bad Request` | — | Validation failed. `details` lists the offending fields. |
| `401 Unauthorized` | — | Missing or wrong Bearer token. |

### Success body

```json
{
  "status": "call_initiated",
  "lead_id": "4213",
  "call_id": "call_abc123",
  "deduped": false
}
```

### Dedup body

```json
{
  "status": "deduplicated",
  "lead_id": "4213",
  "call_id": "call_earlier",
  "deduped": true
}
```

---

## 4. Behavior guarantees

- **Idempotent.** Two requests for the same person within 5 minutes place **one** call (double-clicks and retries are safe). A `202` retried after a network blip returns `deduplicated`, not a second dial.
- **Lead is recorded.** Every request upserts a lead (idempotent by email / `strapi_lead_id`), so a callback request always shows up in the CRM even if the call is skipped or blocked.
- **Safety-gated.** Every call runs through the shared send-safety pipeline: unsubscribe/DND suppression, global rate limit, scheduler pause, and a fail-closed **test-mode redirect** (in test mode, calls route to a fixed test number instead of the real one).
- **Knowledge base is automatic.** The agent's Synthflow-attached KB is used on every call. You never send it.

---

## 5. Reference integration (training.colaberry.com server)

```js
// Server-side handler on training.colaberry.com. NEVER expose the token to the browser.
const ENTERPRISE_URL = 'https://enterprise.colaberry.ai/api/v1/request-callback';

async function requestCallback(visitor) {
  const res = await fetch(ENTERPRISE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ENTERPRISE_CRM_TOKEN}`, // same token as /api/v1/leads
    },
    body: JSON.stringify({
      name: visitor.name,
      email: visitor.email,
      phone: visitor.phone,            // E.164 preferred
      source: 'training.colaberry.com',
      interest_area: visitor.interest, // optional
      strapi_lead_id: visitor.leadId,  // optional but recommended
      landing_page: visitor.page,      // optional
    }),
  });

  const data = await res.json();

  // 202 = dialing, 200 = understood (deduped/blocked/skipped), 502 = retryable
  if (res.status === 502) {
    // transient Synthflow error — retry with backoff
  }
  return data; // { status, lead_id, call_id, deduped, reason? }
}
```

**UX tip:** treat both `202 call_initiated` and `200 deduplicated` as success ("We're calling you now"). Show a soft retry for `502 failed`. For `200 blocked`/`skipped`, fall back to your normal "we'll be in touch" confirmation.

---

## 6. Go-live checklist (enterprise side — Ali)

These run on the enterprise backend host, not training.colaberry.com:

1. On the prod host `/opt/colaberry-accelerator/.env`, set:
   - `SYNTHFLOW_CALLBACK_AGENT_ID=1b432b69-fcb1-4b70-9130-8a66e45eaff5` (the Cora Outbound agent)
   - confirm `SYNTHFLOW_API_KEY` and `ENABLE_VOICE_CALLS=true` are present (they already are)
   - confirm `ENTERPRISE_CRM_TOKEN` is present (it is — /api/v1/leads uses it)
2. Deploy the backend (after hours): `git pull origin main && docker compose -f docker-compose.production.yml up -d --build backend`
3. **Safe-test first:** with test mode ON (and a `SYNTHFLOW_TEST_PHONE` set), POST a request and confirm the call routes to the test number. Then turn test mode off for production dialing.

---

_Last updated: 2026-07-12. Endpoint added in session CC-20260712-q7m3._
