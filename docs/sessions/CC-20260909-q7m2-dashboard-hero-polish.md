# Session CC-20260909-q7m2 (student dashboard — hero polish)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# My Internship: legible next-step hero + scroll-condensed sticky bar (2026-09-17)

**Branch:** `feat/internship-dashboard-hero` (on top of Phase 3c)

Ali, reviewing the live dashboard: "there is some black text on the black
background at the top of the dashboard — fix that text ('Join orientation and the
Monday standup'). Go look at Projects and Classroom and see how, when you scroll
down, you see the animation at the top telling your next step. Add that as well,
and update the Next Step to look more like classroom and project."

- [x] Fix the black-on-black next-step title + restyle to match Classroom/Projects
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: The old hero was a hardcoded dark card (`background:#292630`) whose
    `<h2>` set no colour, so a global `h2` rule painted the title near-black on the
    dark ground (the `<p>` had an inline colour, which is why only it showed).
    Replaced it with the shared `.tl-de .tl-nextweek` card from `timeline.css` (the
    exact component Classroom and Projects use): a two-panel card — left rail with the
    week + a progress bar (onboarding steps done/total) and right panel with the
    "Your next step" eyebrow, the action title (`--text-strong`, so legible), the
    detail, and a red `.tl-btn primary` "Open my checklist" button that deep-links to
    `?view=onboarding`. The empty state uses `tl-nextweek-done` (green). Because the
    card carries explicit heading colours, the black-on-black is gone by construction,
    not by a one-off patch.
  - Verification: frontend `tsc --noEmit` clean; no eslint-disable. Visual parity with
    Classroom/Projects (same classes/tokens, not a lookalike).
  - Notes: imports `components/timeline/timeline.css` (webpack-deduped); the card must
    sit under a `.tl-de` ancestor or the scoped rules don't apply — it does.

- [x] Add the scroll-condensed sticky "next step" bar
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: Reused the platform mechanism rather than reinventing it.
    `PortalShell` already runs `useScrollCondense` and renders a `condensedSlot` in its
    sticky top bar, and exposes the live `condensed` boolean via its function-child.
    `InternshipPage` now uses that function-child form, holds a `condensedSlot` state,
    and passes `condensed` + `onCondensed={setCondensedSlot}` down to
    `InternshipDashboard`. The dashboard reports a `CondensedHeaderCard` (icon, "Your
    next step", the action title, the week, an "Open →" link) up through `onCondensed`
    when its data loads, and wraps its full hero in `te-condense-body` so the hero
    collapses as the compact card slides into the top bar — the same coordinated
    motion as Classroom/Projects. The slot is cleared on unmount, so switching to the
    Onboarding view (or leaving the page) removes it.
  - Verification: frontend `tsc --noEmit` clean. The effect that feeds the slot depends
    only on `[d, onCondensed]` (a stable setState), so it fires once per data load — no
    render loop. Slot hidden on mobile by the shared CSS.
  - Notes: no new scroll listener or CSS — it hangs off `useScrollCondense` +
    `PortalShell`'s existing slot, so the behaviour and animation are identical to the
    other portal pages.
