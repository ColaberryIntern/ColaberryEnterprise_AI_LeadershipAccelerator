# LinkedIn Marketing Developer Platform — access request package

**Prepared by:** Claude Code, session CC-20260909-m4kt, 2026-09-09
**Submitted by:** Ali Muwwakkil — **preparation only. Nothing has been submitted.**

**Purpose:** allow `enterprise.colaberry.ai` to publish organic posts to the Colaberry
LinkedIn **organization** page on behalf of the marketing team, and to read post analytics.

**Read section 0 first.** Posting as a PERSON needs none of this document and is available
today; this package is only for posting as the COMPANY PAGE.

> LinkedIn's developer programme changes more often than Meta's, and product names shift.
> Treat section 2 as a checklist to re-verify in the Developer Portal at submission time,
> not as settled fact. Sections 3 onward are verified facts about our own system.

---

## 0. A working reference implementation exists, and it changes the recommendation

Ali pointed at an intern build - `github.com/pinky2512/SocialPilotAI` - that posts to LinkedIn
successfully. Reading `server/src/integrations/linkedin.js` settles a question this document
had been treating as open, and the answer splits LinkedIn into two products that need to be
kept apart.

### MEMBER posting is self-serve. ORGANIZATION posting is not.

| | Post as a PERSON | Post as the COMPANY PAGE |
|---|---|---|
| Scope | `w_member_social` | `w_organization_social` |
| Product | "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" | Community Management API |
| Access | **Self-serve. No partner review.** | Application, granted by LinkedIn, can be declined |
| Author URN | `urn:li:person:{sub}` | `urn:li:organization:{id}` |
| Available | **Today** | Weeks, and not guaranteed |

The rest of this document was written for the second column. The intern's code demonstrates
the first column working, which means **there is a path to real LinkedIn publishing that does
not wait on anybody's approval.**

Worth noting on the merits rather than only on availability: on LinkedIn, posts from a person
generally out-reach posts from a company page. So member posting is arguably the better
product here, not merely the obtainable one.

### What that implies for sequencing

Personal-profile publishing for Sohail, Aleem and Ali can ship without this application. The
company page still needs it. Doing both is not contradictory - the provider adapter takes an
author URN either way, and the difference is one field plus which token is held.

### Transport details worth taking (verified by reading the code, not assumed)

These are the non-obvious things that cost time to discover, and the reason to read the
intern's implementation at all:

1. **`LinkedIn-Version: YYYYMM` is REQUIRED** on every `/rest/` call - there is no default.
   Only about twelve monthly versions stay active, and a sunset version returns
   **426 NONEXISTENT_VERSION**. That is a scheduled outage with no code change behind it, so
   the version belongs in config with a calendar reminder, not hardcoded and forgotten.
2. **`commentary` uses LinkedIn's "little text" format.** The characters
   `\ | { } @ [ ] ( ) < > # * _ ~` must be backslash-escaped or the call fails with **422**.
   Marketing copy contains brackets and hashes constantly, so this is not an edge case - it is
   the default case, and it fails the post rather than mangling it.
3. **The created post URN comes back in a HEADER**, `x-restli-id` (or `x-linkedin-id`), not in
   the response body. That value is what `external_publications.external_id` must store; a
   client that only reads the body records nothing and loses the ability to reconcile.
4. **Author id comes from OIDC `userinfo.sub`**, composed as `urn:li:person:{sub}`.
5. **Images are a three-step upload**: `initializeUpload` -> `PUT` the bytes to the returned
   URL -> reference the returned `urn:li:image:...`. PNG/JPEG/GIF only; **SVG is not
   supported**. Alt text caps at 300 characters.

### What must NOT be copied

`server/src/db/schema.sql:105-112` stores `access_token TEXT` in plaintext SQLite, and the
file says so itself: *"real OAuth token exchange is out of local scope; access_token holds a
placeholder."* That is precisely the problem escalation **ESC-001** exists for, and copying it
would import the exact posture this build is trying to avoid. The transport is reusable; the
credential handling is not.

Also absent: any refresh handling. LinkedIn member tokens expire, and a connection that
silently dies after some weeks is the failure mode the `oauth_token_vault` docstring already
describes for Microsoft Graph. Token lifetime and refresh availability on the self-serve
product need confirming against LinkedIn's current documentation before anything is promised.

---

## 1. The important structural difference from Meta

LinkedIn organization posting is **not self-serve.** Meta's flow is: create app, request
permissions, submit screencast. LinkedIn's is: create app, associate it with a Company Page,
then **apply for a product** — and access to the posting products is granted by LinkedIn, not
merely reviewed against a checklist. Applications can sit, and can be declined without a
detailed reason.

Two consequences worth planning around:

1. **Apply early.** This is the longer of the two clocks, which is why it is being prepared
   now rather than when the publishing code is finished.
2. **Have a fallback that is not "wait".** Our build already degrades unsupported networks to
   an honest **Handoff** — the platform composes, validates, schedules and tracks, then hands
   the operator finished content plus its tracked link to paste, and records a completion
   receipt. That is the mode LinkedIn runs in until access is granted, and it is genuinely
   usable rather than a stub.

---

## 2. Checklist

### 2.1 Prerequisites

- A LinkedIn **Company Page** for Colaberry that Ali administers.
- A developer app created **against that Company Page** (the association is what makes
  organization products available at all).
- App verification: LinkedIn asks a Page admin to confirm the app via a generated link.
- Privacy policy URL — `https://enterprise.colaberry.ai/privacy` (exists,
  `frontend/src/App.tsx:114`).
- **Terms of Use URL — DOES NOT EXIST.** Verified: no `terms` route in `App.tsx` or any
  file under `frontend/src/routes/`. This must be published before applying; LinkedIn asks
  for it on the app record. Same class of gap as Meta's missing data-deletion URL
  (`APP_REVIEW_META.md` section 1) and worth fixing in one pass.
- App logo and a plain-language description.

### 2.2 Products to request

| Product | Why |
|---|---|
| **Community Management API** | The organization-posting product. Grants the write scopes below. |
| **Sign In with LinkedIn using OpenID Connect** | **Required for the MEMBER path** (section 0) - it is what yields `userinfo.sub`, and without it there is no author URN to post as. NOT needed for the organization path, where the author is the page. Request it only if member posting is in scope; on an organization-only application it is an unnecessary scope that weakens the request. |
| **Share on LinkedIn** | The member-posting product. Self-serve, no review. Only relevant to the member path. |

### 2.3 Scopes

| Scope | Purpose |
|---|---|
| `w_organization_social` | Create posts as the organization |
| `r_organization_social` | Read back our own posts and their engagement |
| `rw_organization_admin` | Read page-level analytics and confirm admin standing |

Those three are the ORGANIZATION path. For an organization-only application, do not add
member scopes: the narrative says we publish as the company, and asking for member posting
alongside it muddies a request that is already discretionary.

**If the member path is chosen instead or as well** (section 0), `w_member_social` comes from
the self-serve "Share on LinkedIn" product and needs no application at all - so it is not part
of THIS submission either way. That is the point of keeping the two columns apart: the member
path is a configuration task, the organization path is a request somebody else has to grant.

---

## 3. Use-case narrative (paste-ready)

> Colaberry is a workforce-development and enterprise AI company. Our marketing team plans
> and publishes organic content across several brands, currently in a third-party scheduling
> tool that has no link to our CRM. We cannot presently tell which LinkedIn post produced an
> enquiry, an appointment or an enrollment.
>
> We are moving that workflow into our own admin platform. An authorized marketing operator
> selects a brand, composes a post, generates a tracked link, submits it for internal
> approval, and schedules it to our own LinkedIn organization page. On publication we store
> the post URN and permalink so later engagement can be attributed to the originating
> campaign.
>
> The integration publishes exclusively to LinkedIn organization pages that Colaberry owns
> and that a Page admin has explicitly connected. It does not post as any individual member,
> does not access member data, does not message members, and is not offered to third parties.
> It is an internal tool for our own marketing operations.

The last sentence matters. LinkedIn is markedly stricter than Meta about anything that reads
as a third-party social-management product, automated outreach, or member-level activity.

---

## 4. Things that will get this declined

| Risk | Mitigation |
|---|---|
| Reads as a general-purpose social scheduler for other companies | State single-tenant, internal-only, explicitly and more than once |
| Any hint of automated connection requests, InMail, or member messaging | We request none of it. Do not mention outreach anywhere in the application. |
| Scraping | **Relevant to us.** `openclawLinkedInScraper.ts` exists in the codebase today and reads LinkedIn via an `li_at` session cookie. It is unrelated to this integration, but it is a Terms problem in its own right. See section 5. |
| Requesting member scopes alongside organization scopes | Request organization scopes only |
| Vague use case | Use section 3 verbatim |

---

## 5. Something to settle before applying — an honest disclosure question

The repository currently contains `backend/src/services/agents/openclaw/openclawLinkedInScraper.ts`,
which authenticates with a stored `li_at` session cookie
(`/data/browser-profiles/linkedin-cookies.json`) and reads posts and comments via LinkedIn's
internal Voyager endpoints, with an HTML fallback. Admin endpoints accept those cookies
pasted over HTTP (`openclawRoutes.ts:1432`).

Cookie-based scraping of internal endpoints is contrary to LinkedIn's User Agreement. This
matters to an access application in two ways:

- It is a live compliance exposure independent of whether we ever apply.
- If LinkedIn associates the scraping activity with the same company applying for API access,
  it materially raises the chance of a decline.

**This is Ali's call, not an implementation detail.** The options are to retire the scraper
before applying, to keep it and accept the risk, or to seek advice. I am flagging it rather
than deciding it, and it is not something this build changes on its own.

---

## 6. What is true in our system today

- **There is no LinkedIn post/publish API integration.** `openclawLinkedInScraper.ts` exports
  only read and session functions — there is no `postToLinkedIn` anywhere. Authority LinkedIn
  posts are created as drafts and the publish route explicitly refuses them
  (`openclawRoutes.ts:1774-1776`, "does not support auto-publish"). LinkedIn drafts land in
  `LinkedInActionQueue` for a human to post manually.
- **No `LINKEDIN_*` credentials exist** in `.env.example` beyond a proxy URL.
- **No encrypted secret store exists** (escalation ESC-001). Do not connect a real
  organization page until that is resolved.

---

## 7. Recommended sequence

0. **Decide member-vs-organization first** (section 0). Member posting needs none of this
   document and can ship now; organization posting needs all of it. They are not alternatives -
   the question is only which ships first.
1. Resolve the section 5 scraper question. It is the item most likely to affect the outcome.
2. Create/verify the app against the Colaberry Company Page.
3. Apply for Community Management API with the three organization scopes and the section 3
   narrative.
4. While waiting, LinkedIn runs in **Handoff mode** — full compose, approval, scheduling,
   tracked links and analytics-by-link, with a manual paste step and a recorded receipt.
5. Connect a real page only after ESC-001 closes and the credential store exists.
