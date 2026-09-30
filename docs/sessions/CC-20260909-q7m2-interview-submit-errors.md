# Session CC-20260909-q7m2 (internship interview submit error-handling)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# Internship interview: session-aware save errors + honour the server's rejected list (2026-09-18)

**Branch:** `fix/internship-interview-submit-errors` (cut from `origin/main`)

Came out of Dhee's bug report ("the interview won't accept my answer"). Diagnosis
proved the server was fine — his exact submission replayed against production
returned 200 and saved — so the failure was client-side (a timed-out session or a
stale cached page). Two frontend weaknesses turned that into a confusing dead-end:

- [x] Make the interview save error session-aware, and stop ignoring rejected answers
  - Date: 2026-09-18
  - Session: CC-20260909-q7m2
  - What changed: `InternshipInterview.tsx` `submitAnswer`:
    1. **Honour `res.rejected`.** The save endpoint names any answer it would not
       accept (stale question bank, or a value it could not validate) in `rejected`
       rather than dropping it silently. The client previously ignored that and
       advanced as if the answer saved — so the answer was lost, progress never moved,
       and the interview could never complete. Now: if the submitted question key is
       in `rejected`, show a clear message and do NOT advance.
    2. **Session-aware catch.** A thrown save (previously a bare `catch {}` → generic
       "We could not save that answer") is now inspected: a `401` says the session
       timed out and to refresh or sign in again (noting saved answers are safe), a
       `429` says slow down, anything else keeps the generic message. This is exactly
       the case Dhee most likely hit — his early writes worked, a later one failed on
       an expired session, and the old message wrongly blamed his answer.
  - Verification: frontend `tsc --noEmit` clean; no eslint-disable. Backend untouched
    (the server already returns `rejected` and the right status codes — this only
    teaches the client to read them).
  - Notes: not the *cause* of Dhee's issue (that was his browser session/cache, which
    a refresh fixes), but it removes the misleading dead-end so the next person
    self-serves instead of emailing. The autosave guarantee still holds: every answer
    saved before a failure is persisted server-side, so a refresh loses nothing.
