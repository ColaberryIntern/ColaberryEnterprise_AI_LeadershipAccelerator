# Session CC-20261112-k7m2 — Zoom mint read-back

Scoped to the Zoom host-pool fix. The rest of this session's work is logged separately;
this file carries its own name so it cannot collide with another branch's copy of the
session log.

---

- [x] Zoom mint read-back: a meeting nobody can enter is no longer a successful create
  - Date: 2026-11-14
  - Session: CC-20261112-k7m2
  - What changed: `createMeeting` now reads back what Zoom actually stored and reports
    it; a caller that needs an enterable room says so and gets a typed error plus a
    cleaned-up meeting instead of a dead link; the room mint walks to the next pool
    host and demotes the one that failed.
  - Verification: 76 affected suites green, 1137 tests (`jest --ci --maxWorkers=1`),
    24 of them new. Backend `tsc --noEmit` clean in `src/` for every file touched, run
    first against a planted control error so the clean result is known to be real.
  - Notes: the four remaining `tsc` errors in `src/` (`maxmind`, `@anthropic-ai/sdk`)
    are pre-existing gaps in this machine's junctioned `node_modules`, not in any file
    this change touches. Not production-verified: nothing re-mints an existing room, so
    this only takes effect the next time a room link is minted.

## The defect

Found 2026-11-03 (BC 10471871153), when Ali could not start the AI Internship
Presentation at 10:00 and Zoom showed "waiting for host".

Two persistent rooms were minted on 2026-11-02 in the same second, by the same code,
asking for the same settings. Zoom stored `waiting_room: false` for one and
`waiting_room: true` for the other, because the second host's account forces a waiting
room on and silently discards the API's request to turn it off. A waiting room
overrides join-before-host, so that room — `always_open: true` — could only be opened
by an account nobody signs in as.

`createMeeting` had asked for `join_before_host: true, waiting_room: false` since the
day it was written and had never once looked at the answer. The same Zoom quirk was
already known for `auto_recording` and noted in a comment: acknowledged in prose,
enforced nowhere.

Re-measured in production on 2026-11-14, eleven days later: meeting `85910290895` still
carries `waiting_room: true`, and all seven pool hosts still carry a non-null
`verified_at` with a null `last_error`. Verification proved a host could mint. It never
proved the meeting could be joined, which is the only property a persistent room has
any use for.

## What shipped

**1. The read-back.** `createMeeting` compares what Zoom stored against what was asked
for and logs a `ContractViolation` on any difference. The create response already
carries the settings, so this costs no extra API call — the evidence was there on
2026-11-02 and nothing read it.

**2. A three-way answer, never two.** `isEnterableWithoutHost` returns `true`, `false`
or `null`, and `null` means Zoom did not say. A response carrying no settings block is
unverifiable, not a failure; collapsing the two would mean a Zoom API change took down
every room mint on the platform at once.

**3. Enforcement only where it must be fatal.** `requireEnterableWithoutHost` is off by
default, so every existing caller behaves exactly as before — a scheduled class has a
host who turns up, and a waiting room there is a nuisance rather than an outage. The
persistent-room path passes `true`, because for it an unenterable link is permanent.
The useless meeting is deleted before the error is thrown, so no year-long orphan is
left answering a bookmarked URL.

**4. Fail over rather than strand.** The room mint walks the pool: a host that produces
an unenterable meeting is demoted out of the pool (`verified_at` cleared, reason in
`last_error`), the room's reservation is released, and the next host is tried. Bounded
at four attempts. Three of seven live hosts were bad and the allocator takes them in
priority order, so stopping at the first would have failed exactly as badly as not
checking at all.

**5. Verification corrected by evidence, not by prediction.** `markHostUnusable` demotes
on what actually happened at mint time. The alternative — probing each host by minting
and deleting a throwaway meeting — was rejected: `verifyHost` is deliberately a read,
because accounts that also run live classes should not collect test meetings every time
someone checks.

## What this does NOT fix

- **The live room is still broken.** This changes minting; nothing re-mints a room that
  already holds a link, by design (`existingMeetingLinksAreNeverReplaced` exists to stop
  exactly that). Meeting `85910290895` stays unenterable until someone either turns
  Waiting Room off for `program.102@colaberry.com` in the Zoom console, or deliberately
  re-mints via `scripts/remintRoomZoomHosts.ts` and announces the new URL.
- **`support@colaberry.com` fails a different way** — join-before-host off, no waiting
  room involved. The new check catches it; the console fix is a different page.
- **`room-cherry-chamber` points at meeting `85073426369`, which 404s.** A room row can
  outlive its Zoom meeting. Out of scope here and still open on the ticket.
