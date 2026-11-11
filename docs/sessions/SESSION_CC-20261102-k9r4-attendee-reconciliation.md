# Session CC-20261102-k9r4 — two rosters for one Open House (OH-9)

PROGRESS.md is sealed, so this is the session record.

## What was found

Ali asked whether the six landing-page signups were included in the portal Events
page's "7 signed up" badge. They were not, and the answer was worse than a wrong
count.

- Eventbrite roster: **7** (CCPP SQL Server, `EventBrite_EventAttendees`)
- Our own funnel: **6** at the time, **8** by the end of the day (Postgres,
  `open_house_registrations`)
- Overlap: **0**

Fifteen distinct people by the evening of 2026-11-11, across two systems, and no
screen anywhere showed more than seven of them.

The portal badge is `COUNT(DISTINCT Email)` against CCPP. Our landing page and the
training site write Postgres. Nothing joined them.
`countOpenHouseRegistrations()` had existed with **zero non-test callers**, which
is how six real people were invisible.

### The part that would have bitten on the night

The Eventbrite record carries no joining link, only `rsvp_url` (the ticket page).
Eventbrite sends its own 7 their joining instructions; our reminder sweep was about
to send our 8 a different link. Two groups, two rooms, each correctly reminded by a
system that had never heard of the other.

Mitigated by minting the session's Zoom room early — 2026-11-11 rather than the
scheduler's Nov 18 — so there is one URL that can be pasted into the Eventbrite
online event page. `ensureSessionMeetLink` returns an existing link and never
overwrites (meetingService.ts:62), so the Nov 18 sweep leaves it alone.

**Still open and owned by Ali:** pasting that URL into Eventbrite. Until then the
two groups still have two rooms.

## What shipped

- Date: 2026-11-11 · Session: CC-20261102-k9r4 · Ticket: OH-9 · PR #3859
- `attendeeReconciliation.ts` — both rosters, the union, the overlap, both exclusive
  groups named rather than summed away.
- `getEventAttendeeEmails()` beside `getRegisteredEventIds()`, so the knowledge that
  CCPP bakes `'address',` delimiters into 100% of 2026 rows lives in one module.
- `GET /api/admin/marketing/open-house/attendees`, under that prefix so it inherits
  the `campaigns` section `mgmtSectionGate` expects.
- `/admin/marketing/open-house-attendees`, reached from the Marketing hub. No
  sidebar row: the rail is one Marketing button by decision, pinned by a test.
- `listOpenHouseRegistrations` now selects the reminder stamps. It did not before,
  so "has this person been told when to turn up" would have read *no* for everyone,
  permanently, and looked correct.

## The rule the module is built around

**An unavailable roster is never reported as an empty one.**

`getRegisteredEventIds` returns an empty Set on any failure, so "nobody registered"
and "the query broke" are the same answer from outside. Reconciliation is exactly
where that does damage: an empty roster renders as a confident accusation that none
of your registrants are on Eventbrite.

So `eventbrite.status` is a three-state, counts are null rather than 0 when unknown,
per-person `on_eventbrite` is null rather than false, and the new
`getEventAttendeeEmails` throws where its neighbours fall back.

This was not theoretical. While checking this data by hand I got "0 of 6 on
Eventbrite" out of that very function and nearly reported it as fact without being
able to tell a true zero from a broken query.

## Verification

- 29 assertions executed against the real module via Node type stripping before
  push; 20 jest cases; all 10 CI checks green on the first push.
- Both new test files confirmed to have actually EXECUTED in CI, by name in the run
  log — a green suite does not prove a new file was not simply skipped.
- Deployed backend and nginx; both containers confirmed recreated by creation time,
  not by the deploy script's wording.
- The served bundle grepped for three independent markers plus a control string.
- The shipped service run against real Postgres and real CCPP: 7 / 8 / 15, overlap 0.

### Three process notes worth keeping

**A mangled command is not evidence.** The first bundle grep came back empty and I
nearly reported the frontend as stale. PowerShell had eaten the nested quotes. Three
separate false negatives today traced to the same cause, and each time the fix was
the rule already written down: do not inline it, write the file.

**Masking can hide both a coincidence and a bug.** Two addresses, one on each
roster, both began "na". Masked output made them look like one person. Comparing
SHA-256 prefixes of the full strings — with a control proving identical strings
match — settled it: two different people. Pinned as a test case.

**Main moved during the build.** Six of the eleven files were edited from copies
fetched earlier, so each was diffed against current `main` before the PR opened. All
additive apart from two single-line replacements, both mine. A stale branch reverts
other work with no conflict, so this check is not optional.

## Remaining

- Paste the Zoom URL into the Eventbrite online event page (Ali).
- The Eventbrite listing advertises "Free", the TWC wording avoided on every other
  surface (40 TAC 807.172(d)).
- Pushing our registrants INTO Eventbrite needs an API token and an external write
  path. This change makes the gap visible; it does not close it.
- OH-5 through OH-9 still have no Basecamp ticket.
- Nothing schedules the geo enrichment script yet (GEO-1).
