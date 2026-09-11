# Meta App Review — submission package

**Prepared by:** Claude Code, session CC-20260909-m4kt, 2026-09-09
**Submitted by:** Ali Muwwakkil — **this document is preparation only. Nothing has been
submitted.** Submission makes representations on Colaberry's behalf and is a hard stop for
the automated build loop.

**Purpose of the submission:** allow `enterprise.colaberry.ai` to publish organic content to
Colaberry-owned Facebook Pages and Instagram professional accounts on behalf of the
marketing team (Sohail and Aleem), and to read back post performance.

> Platform requirements change. Everything in section 2 reflects Meta's published review
> requirements as generally understood at time of writing; **re-check each one against the
> current App Dashboard before submitting.** Sections 3 onward are facts about our own
> system and are verified against the codebase.

---

## 1. BLOCKER — a required URL does not exist yet

Meta requires a **Data Deletion Instructions URL** (or a Data Deletion Callback) on every
app that accesses user data. Verified against the repo on `origin/main`:

- A privacy policy **does** exist: `frontend/src/App.tsx:114` routes `privacy` to
  `PrivacyV2` (`frontend/src/pages/publicV2/PrivacyV2.tsx`).
- **No data-deletion page, route, or callback endpoint exists anywhere.** Searched
  `frontend/src` and `backend/src/routes` for `data-deletion`, `delete-my-data`,
  `deletion-request` — no matches.

**This will fail review if submitted as-is.** It is cheap to fix and needs deciding before
submission:

| Option | What it involves |
|---|---|
| Instructions URL (simpler) | A public page describing how someone requests deletion and the response SLA. No callback endpoint needed. |
| Deletion Callback (stricter) | A signed-request endpoint Meta calls; must return a confirmation code and a status URL. More work, but the more defensible posture. |

Recommend the **Instructions URL** for this submission, with the callback deferred until we
actually store Meta user data beyond page tokens.

---

## 2. What Meta will ask for

### 2.1 Permissions to request

| Permission | Why we need it | Where it is used in our product |
|---|---|---|
| `pages_show_list` | List the Pages a connecting admin manages, so an operator can pick which Page a brand maps to | Connector setup, `/admin/marketing/connectors` |
| `pages_read_engagement` | Read post-level insights to populate reporting | Organic metrics sync |
| `pages_manage_posts` | Create and schedule posts on a connected Page | Composer -> publishing queue |
| `business_management` | Resolve which Pages belong to the Colaberry business, so a brand cannot be pointed at an unrelated Page | Brand-to-account binding |
| `instagram_basic` | Read the IG professional account linked to a Page | Connector setup |
| `instagram_content_publish` | Publish to the IG professional account | Composer -> publishing queue |

Request **only these.** Scope minimization is both a review criterion and a stated rule in
the build spec (section 9, "scope minimization").

### 2.2 Everything else on the checklist

- Business verification for Colaberry (legal name, address, and a verifiable phone/domain).
- App in **Live** mode, not Development.
- App icon (1024x1024), category, and a plain-language app description.
- **Privacy Policy URL** — `https://enterprise.colaberry.ai/privacy` (exists).
- **Data Deletion Instructions URL** — **does not exist, see section 1.**
- A **screencast per permission** showing the permission actually being used by a real user
  in the real product. Script in section 4.
- **Test credentials** — a reviewer login that reaches the marketing surface without needing
  a Colaberry staff account. See section 5.
- Confirmation the app does not ask for a permission it does not use.

---

## 3. Use-case narrative (paste-ready)

> Colaberry operates several distinct brands from one platform — `colaberry-enterprise`,
> `colaberry-training` and others — each with its own audience, domains and sending identity.
> Our marketing team currently plans and publishes social content in a third-party scheduling
> tool that has no connection to our CRM, so we cannot tell which post produced an enquiry,
> an appointment or an enrollment.
>
> This app moves that workflow into our own admin platform. An authorized marketing operator
> selects a brand, composes a post, generates a tracked link, submits it for approval, and
> schedules it. On publication we record the resulting post ID and permalink so later
> engagement can be attributed back to the originating campaign.
>
> The app publishes only to Facebook Pages and Instagram professional accounts that
> Colaberry itself owns and that an authorized admin has explicitly connected. It does not
> publish to personal profiles, does not post on behalf of any third party, and does not read
> or store any end user's personal data. Access is limited to named internal staff via
> role-based permissions.

Keep that last paragraph. Reviewers reject submissions that look like they might publish on
behalf of other people's accounts.

---

## 4. Screencast script

One continuous recording, no cuts, narrated. Meta rejects recordings that show a mock or a
localhost URL — record against the live domain with a real Page.

1. Show the browser URL bar on `https://enterprise.colaberry.ai/admin`. Log in as the
   reviewer test user.
2. Navigate to Marketing -> Connectors. Click **Connect Facebook**.
3. Show the Meta OAuth dialog **with the permission list visible on screen**. Accept.
4. Back in the app, show the returned list of Pages — this is `pages_show_list` in use.
5. Bind one Page to a brand. Show the Instagram professional account resolving from it —
   `instagram_basic`.
6. Go to Marketing -> Compose. Write a post, attach an image, pick the connected Page and IG
   account, and schedule it.
7. Show it publishing, then open the resulting post **on facebook.com and on instagram.com**
   — this is `pages_manage_posts` and `instagram_content_publish` in use.
8. Return to the app and show the post's engagement numbers — `pages_read_engagement`.
9. Show the brand/account binding screen that proves Pages are resolved through the business
   — `business_management`.

Narrate what each step is for. Reviewers score against the permission list, not the polish.

---

## 5. Reviewer test access

Meta reviewers must be able to reach the whole flow without a Colaberry staff account.

- Create a dedicated reviewer admin user with the `brand_marketer` role. That role already
  exists (`backend/src/modules/tenancy/tenantRoles.ts`) and carries `campaign.send` but
  deliberately not `sender.write`.
- Bind it to a **non-production test brand** and a test Facebook Page, so a reviewer cannot
  publish to a live Colaberry audience.
- Provide username, password, and a one-paragraph "what to click" note.
- **Do not** put the credentials in this file or anywhere in the repo — `secret-scan.js` is a
  required CI check and would block the commit, correctly. Enter them directly in the App
  Dashboard.

---

## 6. Known review risks, and how we answer them

| Likely reviewer objection | Our answer |
|---|---|
| "Why do you need `business_management`?" | To resolve which Pages belong to the Colaberry business, so an operator cannot bind a brand to an unrelated Page. Binding is the security boundary. |
| "Your app looks like a scheduling tool for other businesses." | It is single-tenant to Colaberry. Accounts are connected only by our own admins, and the product is not offered to third parties. |
| "The screencast does not show permission X." | Re-record. Every requested permission must be visibly exercised. |
| "Data deletion URL missing." | See section 1 — resolve before submitting. |
| Instagram publishing requires a **professional** account linked to a Page. | Confirm the Colaberry IG account is Business/Creator and linked to the Page before recording. |

---

## 7. What is true in our system today (verified, so nothing here overstates readiness)

- **No Meta integration exists in the codebase.** No `graph.facebook.com` client, no app ID
  or secret, no Page token handling. The only "post to a Meta property" path today is
  Playwright browser automation against Facebook Groups using injected cookies, which is
  unrelated to this submission and is not what we are asking to be reviewed.
- **There is no encrypted secret store.** Storing Meta page/user tokens per brand requires
  building one; that is tracked as escalation ESC-001 and gates task T003 of the current
  build. **Do not connect a real Page until that is resolved** — today a token would land in
  plaintext, which is both a security problem and a Platform Terms problem.
- The publishing pipeline, approval flow and provider-adapter interface are being built
  against a dry-run transport first, precisely so App Review is not on the critical path for
  everything else.

**Sequencing recommendation:** submit for review now so the clock runs, but do not connect a
production Page until ESC-001 is closed and the credential store exists.
