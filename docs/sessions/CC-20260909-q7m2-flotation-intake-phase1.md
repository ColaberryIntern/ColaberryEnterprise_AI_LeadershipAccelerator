# Session CC-20260909-q7m2 (AI Flotation phone intake — Phase 1 fixes)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# Admin phone intake: stop repeating "I'm an AI", survive a refresh, show progress (2026-09-18)

**Branch:** `feat/flotation-intake-phase1` (cut from `origin/main`)

From Ali's test of "Start a project for a student" → phone intake. Phase 1 of the
agreed plan (the "cheap, reliable now" set — no voice-provider dependency).
Deliberately excludes a live word-by-word transcript: the phone system (Synthflow)
only hands over the transcript when the call ends, so live words need a separate
provider-capability spike (Phase 2).

- [x] The AI interviewer discloses ONCE, then stops repeating "I'm an AI"
  - Date: 2026-09-18
  - Session: CC-20260909-q7m2
  - What changed: `backend/src/services/voiceCallPrompt.ts` `buildFlotationCallPrompt`.
    The old prompt ordered the agent to announce it was an AI in the first sentence
    AND to say "I am an AI assistant" whenever asked — testers heard it over and over
    ("she keeps saying I'm an AI assistant too much"). Rewrote it to disclose **once**,
    naturally, in the opening, then not repeat; still honest (never implies human,
    confirms once if directly asked). The disclosure requirement is kept; the robotic
    repetition is gone.
  - Verification: backend `tsc` (string-only edit; via CI). Prompt is injected per call.

- [x] A page refresh mid-call no longer loses everything
  - Date: 2026-09-18
  - Session: CC-20260909-q7m2
  - What changed: Two root causes fixed. (1) `AdminInternshipPage.tsx` now keeps the
    open section in the URL (`?view=projects`, same pattern as the student dashboard),
    so a refresh stays on Projects instead of silently dropping back to Applications
    (which unmounted the whole intake). (2) New `flotationIntakeSession.ts` stashes the
    in-flight call (the placed call + which student it's for) in localStorage, bounded
    to 20 minutes and wrapped so a blocked store never breaks the page. `SpokenIntake`
    now seeds its state from that on mount (a lazy `useState` initializer — no effect,
    no exhaustive-deps disable) and re-attaches its poll; `StartProjectForStudent`
    re-opens straight on the talk step for that student. Cleared on "Place another
    call" / "Start another" and when the call reaches a terminal state. The backend
    always finished the call regardless; this restores the operator's live view.
  - Verification: frontend `tsc` clean; no eslint-disable (resume via lazy state
    initializers, not effects).

- [x] Live sense of progress while the call runs
  - Date: 2026-09-18
  - Session: CC-20260909-q7m2
  - What changed: `SpokenIntake` now shows a one-second **on-call timer** (mm:ss) beside
    the live status while watching, and the status copy is honest about the model:
    "you can safely refresh or leave this page; the call keeps going and this view picks
    back up; the transcript appears once the call ends." The existing write-up step
    already surfaces the captured **title + item count** and the "see it as they would"
    link, so the operator can confirm it fed the intake and judge whether a short call
    was thin or fine — this makes the *waiting* legible rather than a dead page.
  - Verification: frontend `tsc` clean.
  - Notes: DEFERRED to Phase 2 (evidence-gated): a live word-by-word transcript, which
    depends on whether Synthflow exposes partial transcripts mid-call (a spike). Phase 3
    (optional): a completeness flag for suspiciously short phone interviews — the phone
    interview has no length floor today (unlike the typed one), by design when a good
    brief is supplied.
