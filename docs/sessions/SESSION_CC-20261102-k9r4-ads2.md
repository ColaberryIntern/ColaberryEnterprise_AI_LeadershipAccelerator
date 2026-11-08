# Session CC-20261102-k9r4 (continued) — ADS-2 landing-page CTA origin fix

**Date:** 2026-11-06
**Branches:** `workstream/ads2-artifacts` (merged, PR #3731) and `workstream/ads2-session-log`,
both cut from `origin/main` rather than stacked
**Ticket:** ADS-2 https://3.basecamp.com/3945211/buckets/7463955/todos/10467338730
**Scope:** ADS-2 only — the signup CTAs on the hosted landing page pointed at an absolute
`www.refactored.ai` URL, so a visitor who landed on the other hostname lost their tagged session on
the click. Siblings in the ladder: ADS-3 (`SESSION_CC-20261102-k9r4-ads3.md`) and ADS-5
(`SESSION_CC-20261102-k9r4-ads5.md`). ADS-4 and ADS-6 remain blocked on a Meta asset grant and are
not part of this log.

---

- [x] ADS-2 shipped: the landing page's signup CTAs are same-origin
  - Date: 2026-11-06
  - Session: CC-20261102-k9r4
  - What changed: Production data only, no code and no deploy. `landing_pages` row
    `fca4199a-c73d-4a06-974c-7f88f3c326eb` (`ai-learning-platform`, published, 9 sections):
    `content.sections[0].cta.href` and `content.sections[8].cta.href` changed from
    `https://www.refactored.ai/portal/signup` to `/portal/signup`. Two stored values, from which the
    renderer emits three anchors. The CTA label was not touched. The sibling page the ticket also
    named, `start-learning-ai-for-0`, was deliberately left alone: it is a draft and already points
    at `/apply`, relative and same-origin, so repointing it would have been a destination change
    rather than an origin fix.
  - Verification: the stored hrefs read back from `accelerator_prod` after the write — 0 absolute, 2
    relative, still `published`, `content` still parses. Live `GET` on both hostnames
    (`enterprise.colaberry.ai`, `www.refactored.ai`) — HTTP 200, zero absolute hrefs, three relative
    CTA anchors each. The origin hop proven in headless Chromium: `cb_visitor_fp` written on the
    landing page and the identical value readable after the CTA click, origin preserved, landing on
    `/portal/signup` — a test that fails if the CTA leaves the origin, because the cookie would not
    travel. A `visitor_sessions` row carrying the probe's `TESTCAMP123` joined to the visitor holding
    exactly the probe fingerprint. The write hop proven from real production rows instead: **25 of 25**
    recent tagged sessions joined to a lead agree on campaign `52708443249234`, all entered on
    `/lp/colaberry-training/ai-learning-platform`, all `source = free_signup`. Scope: exactly one
    hosted page in the database contained the absolute href, and zero remain.
  - Notes: **This ticket's central claim was wrong, and that matters more than the fix.** ADS-2 called
    itself "the gate on every other ad-reporting ticket". Attribution was already working: those 25
    leads were attributed while the CTA was still absolute, which is only possible if the visitor was
    already on `www.refactored.ai`. So the change removed a latent dependency on which hostname an ad
    points at — worth doing, not a repair — and it also answers ADS-5's open question by inference.
    Two other corrections: the ticket said "change all three CTA hrefs" (right number, wrong unit —
    two stored, three rendered), and the sibling-page instruction did not apply as written.
    **The stated acceptance test was not run as written.** Completing the signup form mints an
    account, fires a welcome email, and writes across four tables that would then have to be unpicked
    through a foreign-key graph in production. Browser evidence for the origin hop plus 25 real rows
    for the write hop is better evidence and destroys nothing.
    **Two silent-failure traps, both guarded before the write.** The public `/lp/` route fails closed:
    a published row whose `content` JSONB does not parse serves a 404, not a degraded page, so the
    rewritten content was run through `parseLandingPageContent` before the write and again after
    (relative paths are explicitly allowed — `safeUrl` falls through to `startsWith('/')` when
    `new URL()` throws). And Sequelize does not notice a mutated JSONB object, so the field was
    reassigned and marked with `changed('content', true)`, then re-read and re-parsed. That second
    trap is the same shape as the `utm_medium` write in ADS-3.
    Not established: nothing here measures cost — the spend ledger stays empty until ADS-4 and ADS-6.
    An aside worth keeping: headless Chromium regenerates one fixed `cb_visitor_fp`, so every
    automated run collapses into a single `visitors` row (the probe's resolved to one created
    2026-10-15). Harmless for real traffic, but per-visitor counts are not per-person counts wherever
    bots are included.

- [x] ADS-2 closed with its artifact pair
  - Date: 2026-11-06
  - Session: CC-20261102-k9r4
  - What changed: Added `scripts/artifacts/tickets/ads2Data.js`,
    `scripts/artifacts/tickets/ads2Render.js` and `scripts/artifacts/buildAds2Artifacts.js`,
    following the committed per-ticket generator pattern used by ADS-3 and ADS-5. Both PDFs read the
    one data module, so a figure on the visual cannot drift from the same figure in the document. No
    runtime code changed.
  - Verification: build output `visual 1 page(s) (limit 1) 73 KB` and `document 5 page(s) 83 KB`;
    `checkAmericanSpelling.js` — 333 files scanned, 0 British spellings; gitleaks pre-commit clean.
    Commit `f3319dba`, PR
    https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3731
    **merged as `18d7f531` on 2026-11-06 at 3:14 PM CST**; `f3319dba` confirmed an ancestor of
    `origin/main` with all three files present there. Both PDFs attached to ADS-2 (comments
    10485840726 and 10485840814) with the preview confirmed on read-back rather than assumed from the
    201, and filed in the vault folder "Marketing Ad Attribution - Artifacts" (10469067334). Closing
    comment 10485885393; the ticket re-read as `completed=true` with 5 comments. **No deploy was
    needed or done:** `backend/Dockerfile` copies `backend/`, `frontend/src/pages/` and one CSV —
    `scripts/` never enters the image.
  - Notes: The visual leads with the finding rather than the ship, because closing this on a green
    check would have buried the one thing worth remembering.
    **A sizing bug in our own artifact tooling, found here and deliberately not fixed.**
    `renderArtifactPdf` emits Letter at 14mm margins (usable 950x710 css px at 96dpi) while
    `previewArtifactPage` hardcodes A4 and reports 1054x726, with a comment claiming A4 is "the only
    size renderArtifactPdf emits" — which is false. The preview is ~104px too wide, and width matters
    more than height because narrower columns wrap text and grow it, so it reported `fits, 19px to
    spare` for a page that then rendered as two. This page was cut against `renderArtifactPdf`, which
    is the authoritative gate, and reviewed at a real 950x710 viewport. The preview is shared by
    dozens of ticket artifacts and correcting its page box would change every one-pager's reported
    headroom at once, so it is flagged on PR #3731 and in memory rather than folded in.
    `closeAds2.js` also tripped a smaller trap: Basecamp returns **204** on a completion POST, so a
    helper that JSON-parses the body throws on a write that actually succeeded. The close was
    confirmed by re-reading the ticket, not by the helper's exit.

- [x] Corrected the Basecamp account id printed on the ADS-2 verification document, and re-filed it
  - Date: 2026-11-08
  - Session: CC-20261102-k9r4
  - What changed: `scripts/artifacts/tickets/ads2Data.js` — `TICKET_URL` account id `4322705` to
    `3945211`. That value is printed in the document PDF's footer, so the artifact filed in the vault
    carried a dead link back to its own ticket. The document was rebuilt, the superseded copies were
    retired, and the corrected build was re-filed on ADS-2 under its stable name. The one-page visual
    does not print the URL and was not touched.
  - Verification: `4322705` occurred **exactly once in the whole repository**, in that line; every
    other Basecamp link in tracked code uses `3945211`, and the attach tool's own output prints
    `https://app.basecamp.com/3945211/...` for this todo, which settles it from the API side rather
    than from the repo alone. Bucket `7463955` and todo `10467338730` were already right. Rebuild
    unchanged: `visual 1 page(s) (limit 1) 73 KB`, `document 5 page(s) 83 KB`;
    `checkAmericanSpelling.js` 345 files, 0 British spellings. Retired with
    `PUT /buckets/7463955/recordings/<id>/status/trashed.json` — comment 10487546986 and vault upload
    10487546981 (the mis-named interim copy), comment 10485840814 and vault upload 10485840781 (the
    stale document), **all four 204**, and all four confirmed gone from a re-read of the vault folder
    and the comment list. Re-filed as vault upload 10487550636 and comment 10487550642, **preview OK**
    on read-back. The ticket re-read after the trashes: `completed=true`, 5 comments. End state in the
    folder: one `ADS2_LANDING_CTA_VERIFICATION.pdf` and one `ADS2_LANDING_CTA_1PAGE.pdf`, with no
    interim name anywhere.
  - Notes: **I got the replacement wrong first, and the repo already had the rule.** I uploaded the
    corrected document as `ADS2_LANDING_CTA_VERIFICATION_R2.pdf`, because
    `attachArtifactToTicket.js` dedupes by filename and silently skips a re-upload under a name it
    has already seen. C0.3 forbids exactly that workaround: artifact names carry no dates, version
    numbers or status words, and where a superseded copy must coexist it is the **superseded** one
    that takes the suffix while the current one keeps the stable name. The documented procedure is to
    trash the stale uploads and re-upload under the stable name, which is what the end state above
    reflects. One detail worth having in writing: the dedupe scans existing **comments** for the
    filename as well as the vault, so the stale comment has to be retired too or the corrected upload
    is skipped with a cheerful "already on the ticket". Trashed recordings are recoverable, and the
    vault copy and the comment attachment are separate uploads with separate sgids, so retiring one
    does not break the other.
    Found at all only by checking a URL I had already handed over instead of trusting it. Nothing in
    the artifact toolchain validates a URL it renders, and an id pasted into a data module outlives
    the session on a PDF.
