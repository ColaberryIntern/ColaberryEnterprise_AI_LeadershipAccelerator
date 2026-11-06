# List a person on hire.refactored.ai

## Purpose

hire.refactored.ai is a directory of Forward-Deployed and Frontier AI engineers in which
**nobody appears unless they have shipped**. A person is listed only when a Case Study about a
project they built is approved, published to the **Hire** surface, and linked to them, and
their portfolio page is published and public. This procedure is how an operator lists a person,
withdraws them, and proves either one. Nothing here needs a build or a deploy: the site reads the
live platform API, and every change is visible within two minutes (`Cache-Control: max-age=120`).

## Inputs

- An admin login to the platform (Case Study OS, `/admin/case-studies`).
- A Case Study record that is `approved`, with an approved snapshot that passes the publish gate.
- The builder's **portfolio page** (`career_portfolio_pages`): `status = published` (a reviewer
  approved it) and `visibility = public` (the learner opted in). `unlisted` = reachable by direct
  link but never in the directory; `private` = nothing, anywhere.
- A **link** between the case study and the builder's project, by one of exactly two routes (the
  one relation `CASE_STUDY_PROJECT_LINKS_SQL` in
  `backend/src/services/career/portfolioCaseStudyLinks.ts`):
  1. `case_studies.project_id` is the builder's project, or
  2. a repository the case study cites matches a `github_connections` row for that project
     (owner + name, case-insensitive).

## Steps

1. **Open the record** in the admin and go to the **Publish** tab.
   Success signal: the **Hire · Refactored** row is present, and under it a line reads
   `Lists <name> · appears in the directory once published`.
2. **If the line instead says `No person is linked`**, fix the link (Inputs, route 1 or 2), then
   reload. Do not publish until the name appears: the gate will refuse with
   `hire_no_linked_person` anyway.
3. **If it says the person `will not appear in the directory yet`**, their portfolio page is not
   published + public. Ask the learner to set visibility to *Public and searchable* in
   *Portfolio → Publishing*, and have a reviewer approve the page. (Unlisted is allowed: they will
   be reachable at `/talent/<slug>/` but not in the directory.)
4. **Preview it**: *Preview* tab → **Hire**. Success signal: the person-first band (gold-ringed
   avatar, name, proof ledger) sits above the case study. The tab shows `↑ LIVE` only after step 5.
5. **Publish** on the Hire row. Success signal: the row reads *Published* and the Hire tab is
   marked LIVE.
6. **Optional, admins only: spotlight.**
   `PUT /api/admin/career/portfolio-page/<enrollmentId>/spotlight` with `{ "spotlight": true }`.
   At most three spotlighted people show; with none, the band shows the three latest listings
   labelled "Latest standout builders".

**To withdraw a person:** Unpublish the Hire row (Publish tab). They drop out of the directory on
the next request and from cached pages within two minutes; their case-study URL then returns the
not-found page.

## Outputs

- A `case_study_publications` row with `surface_key = 'hire'`, `status = 'published'`.
- The person in `GET /api/public/hire/talent`, their page at
  `https://hire.refactored.ai/talent/<slug>/`, and the case study at
  `https://hire.refactored.ai/case-studies/<case-study-slug>/` (opens in a new tab).
- Log lines: `case_study.publish` (outcome success / blocked with `blocker_codes`).

## Verification

- `curl -s https://enterprise.colaberry.ai/api/public/hire/talent | jq '.talent[].slug'` lists
  the person's portfolio slug within 120s of publishing, and stops listing it within 120s of
  unpublishing.
- `curl -s -o /dev/null -w '%{http_code}' "https://enterprise.colaberry.ai/api/public/portfolios/<slug>?surface=hire"`
  returns `200` for a listed person and `404` (body `{"error":"Not found"}`, identical to an
  unknown slug) for anyone else.
- `curl -s https://hire.refactored.ai/ws-post-job` returns `{"error":"retired"}` with status `410`.
- Automated: `cd backend && npx jest src/services/hire src/routes/__tests__/publicHire` and
  `node --test apps/hire-refactored-public/__tests__/*.test.js`.

## Edge cases / failure modes

| Symptom | Cause | Action |
|---|---|---|
| Publish refused with `hire_no_linked_person` | No route links the case study to a project with a portfolio page | Step 2 |
| Published, but the person is not in the directory | Portfolio page is unlisted, private or unapproved | Step 3 |
| Project card on the portfolio says "Case study in review" | That project's case study is not published on Hire | Publish it (steps 1-5) or leave it; the draft title is never shown |
| Availability line missing | The learner has not set it (self-reported, never inferred) | Nothing to do; it is optional |
| Directory shows "Nobody is listed yet" | No one passes the gate, or the API was unreachable | Check `curl` above; a failed API call keeps the honest empty state, never sample data |
| Intro request says "Too many requests" | Per-IP limit (5 per 15 min) | Wait; this is the abuse guard |

## Safety constraints

- **The gate is the product.** Never list someone by editing data around the gate (for example
  writing a publication row by hand). Publish through the admin so `hire_no_linked_person` and every
  other publish rule runs.
- **Intro requests** become leads under source `hire-refactored` (entry `intro_request`). They are
  idempotent per (email, person, Central-time day) through `hire_intro_requests`, so a repeat the same
  day notifies nobody twice. The candidate is never contacted and their contact details are never
  returned to the employer.
- **Notifications** go to the admin notification recipients through a routing rule seeded with
  `backend/src/scripts/seedLeadNotificationRule.ts` (`--source hire-refactored --to <admin> --commit`);
  run it dry first.
- **Spotlight is an admin endorsement**; learners cannot set it. Availability is the learner's own
  words; admins cannot set it.
