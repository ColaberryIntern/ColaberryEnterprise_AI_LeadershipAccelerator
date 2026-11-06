# Session CC-20261106-p3n8 — Aleem's sign-in screens

- [x] Participant Portal sign-in rebuilt to Aleem's 5 November design
  - Date: 2026-11-06
  - Session: CC-20261106-p3n8
  - What changed: Aleem posted three redesigns on the UX Team to-do on 5 November. Two were
    emails and shipped in PR #3696. The third, the sign-in screens, was out of scope for a
    change scoped to "emails that go out for students" and had not been built. Ali: "the
    word". `frontend/src/pages/portal/PortalLoginPage.tsx` now renders his full-page layout
    for both states, with `portalLoginStyles.ts` and `mailApp.ts` split out so no file
    clears the 500-line ceiling. Built from the standalone HTML he attached, not from his
    screenshots; he authored the mockup on this repo's own design system, so every value is
    a `var(--*)` token and there is no hardcoded hex in either new file.
  - Verification: frontend `tsc --noEmit` clean in `src/`; `react-scripts test` 26 passing
    across `mailApp`, `portalLoginHref` and `portalPages.routed`, 5 of those new; `CI=true
    npm run build:frontend` compiled successfully, which is the gate that matters because
    it promotes lint warnings to errors. Fidelity run in Playwright against his own exports,
    both states, stacked as `COMPARE-step1/2.png`. Phone width measured at 390px: 0px of
    horizontal overflow.
  - Notes: FOUR DELIBERATE DEVIATIONS, each where the mockup asserts something the system
    does not do. (1) His step 2 reads "We sent a sign-in link to <address>". That exact
    sentence was removed from this page on purpose: `requestMagicLink` returns success for
    an address it does not recognise, to avoid an email-enumeration oracle, and on
    2026-08-24 a student mistyped hers, read that assertion and lost an evening of a live
    class waiting for mail that was never generated. The conditional wording and its full
    explanation are carried into the new file. (2) and (3) "One-time link" / "One-time use":
    `verifyMagicLink` keeps the token reusable on purpose so a learner can bookmark their
    portal link, so it ships as "1 link at a time", matching the correction already made in
    the portal access email. (4) "Expires in 15 min" twice: `participantService` writes
    `Date.now() + 24 * 60 * 60 * 1000`, so it ships as 24 hours.
    THREE THINGS THE FIDELITY GATE CAUGHT that review would not have. The first comparison
    looked like the page rendered 1.5x too large; it was the harness capturing at 901px when
    his export is a downscaled 1440px window, so the fix was to the harness. Underneath that
    was a real finding: the old page disabled the submit button until something was typed,
    which paints the one call to action as a washed-out bar on arrival and explains nothing.
    His design keeps it solid and validates on submit, which is also kinder to someone
    already locked out, so that is what ships, with his error wording. Third, his background
    line art was missing entirely; added as a static inline SVG rather than his animated
    canvas, because this is the page someone reaches when locked out and it should cost no
    script and no frames. The first attempt drew it far too boldly and the side-by-side
    showed it at once, so it was re-cut as hairline texture.
    Also caught by its own test: `mailApp('@gmail.com')` matched Gmail on the domain alone,
    for an address with no mailbox. Tightened the parse rather than loosening the test.
    NOT DONE HERE: Aleem's nav-bar request of 6 November is addressed to Sai and is on
    training.colaberry.com, a different repo.
