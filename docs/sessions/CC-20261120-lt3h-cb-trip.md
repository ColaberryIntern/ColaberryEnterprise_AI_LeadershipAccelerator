# CC-20261120-lt3h - CB dispatcher stops answering the Launch PMO overdue nudges

- [x] CB dispatcher ignores Launch PMO overdue nurture comments; nurture text no longer says "CB"
  - Date: 2026-11-23
  - Session: CC-20261120-lt3h
  - What changed: The 9:04 CT 2026-11-23 auto-trip email ("runaway reply rate: 13 replies in 15min (cap 12)") came from the
    Launch PMO overdue nurture in `backend/src/scripts/lib/launchPmoDailyUpdate.js`. At 15:00 UTC it posted 13 "3 days overdue"
    comments in Launch PMO (bucket 47502609) under Ali's identity, an allowed requester. Their text ended "CB will escalate to
    Ali at 5 days", which matched the dispatcher's plain-text `isCBMention` (`\bCB\b`). The 15:03 tick answered all 13, created
    2 to-dos assigned to Ali (10538165517, 10538169947), and the runaway guard tripped `cb_dispatcher_enabled` to false as
    designed. Fix: (1) `inbound-dispatcher.js` adds `PMO_NURTURE_RE` to `isAutomatedAgentCard`, anchored on the four
    headers that file writes (1, 3, 5 and 7 days); (2) the 3-day text now reads "This escalates to Ali", with a comment saying
    never to write the bare word CB there.
  - Verification: `node --test` on all 9 files in `scripts/ops-engine/__tests__/`, 61 pass. `automated-card-guard.test.js` has
    15, including 3 new ones built from the verbatim comment HTML (all four levels skipped; a human writing "3 days overdue"
    mid-sentence is not). Mutation: disabling the guard line fails 1 test. `node -c` on both files.
  - Notes: Root cause is the same family as the 2026-06-17 and 2026-06-29 floods: an automated poster using a real
    identity plus a plain-text "CB" match. The kill switch is still OFF; re-enabling it from the CB System Command dashboard
    is Ali's call, after this is deployed. Failure mode not handled: any other job that posts as Ali with the word "CB"
    still reads as a request. The guard covers only the known signatures.
