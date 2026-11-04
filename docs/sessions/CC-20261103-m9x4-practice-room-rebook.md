# CC-20261103-m9x4 — a deleted room took the Reserve button with it

- [x] Let a student book another practice room after the room behind their last
      rehearsal has gone
  - Date: 2026-11-04
  - Session: CC-20261103-m9x4
  - What changed: the single-session read, the booking endpoint, room deletion and
    the Practice panel all stopped treating a `booking_id` as proof of a room.
  - Verification: 18 + 4 + 5 tests green in `presentationPracticeService`,
    `presentationSessionService` and the new `presentationRoomDetach`; backend
    typecheck clean under TypeScript 5.9.3; production data repaired with
    postconditions and two controls.
  - Notes: see below.

## What a student saw

Chuks Eneh, 2026-11-02, and again on 2026-11-04 when nobody had answered:

> *"Please how do I get another room ready to record my working system demo. The
> option to reserve a time is no longer available on the session. I have deleted the
> previous scheduled time as the reserved date and time have now passed."*

He had done nothing wrong. He did what the product invited him to do.

## The chain, verified line by line

1. `roomService.deleteRoom` refuses to delete a room with **upcoming** bookings —
   `start_at > NOW()` (`roomService.ts:294-301`). Once a rehearsal is in the past that
   guard passes, and `RoomBooking.destroy` **hard-deletes** the booking row.
2. `presentation_attempts.booking_id` is a bare column: no foreign key, no cascade
   (`ensurePresentationStudioSchema.ts:212`). It keeps the dead id.
3. `resolveSessionForAssignment` picks that attempt (`attempts.find(a => a.booking_id)`),
   `RoomBooking.findByPk` returns null, and `toSessionView` reads `bookingId` **from the
   attempt rather than the booking** (`presentationSessionService.ts:149`). So the
   payload says "there is a room" and every other field says nothing.
4. `PracticePanel.tsx:370` was `if (session && session.bookingId)` → the booked-slot
   card renders forever, with **When: —**, and the reserve form below it is unreachable.
5. Even bypassing the UI, `startPracticeAttempt` short-circuits on
   `if (attempt.booking_id)` and returns the same dead session without reserving
   anything. `new_attempt: true` would escape it; the panel never sends it.

A **cancelled** booking dead-ends identically, because nothing looked at
`bookingState` either.

## What production actually looked like

Measured before any change. Chuks was the only person who said anything; he was not
the only person affected.

| | |
|---|---|
| Slot reservations ever created | **7 — every one still `held`** |
| `released_at` / `released_reason` | **null on all 7** — the release path had never run |
| Attempts pointing at a deleted booking | **2** — Chuks and Quincy Ninying |
| Attempts whose booking still resolved | 6 *(control: the query was not matching everything)* |
| Attempt states | all `scheduled`; nothing had ever advanced |

The null `released_reason` column is the part worth keeping: that is not students
rarely cancelling, it is a code path that had never executed in production.

## The fix, in four places

| Where | What it now does |
|---|---|
| `models/RoomBooking.ts` | `DEAD_BOOKING_STATES` + `isDeadBooking()`. `locked` and `archived` are deliberately **not** in it — a locked booking is still your room |
| `presentationSessionService.ts` | a booking that is missing or dead means **no session**, so the panel offers the form |
| `presentationPracticeService.ts` | a dead `booking_id` is cleared, its holds released, and the request carries on to reserve. The endpoint stops refusing to do the thing it was asked |
| `communityRooms/roomService.ts` | deleting a room detaches its practice attempts and releases their holds **first**, and is not swallowed — if it fails the room is not deleted |
| `PracticePanel.tsx` | `hasUsableRoom(session)` — a booking id is not a room |

`presentationRoomDetach.ts` is new and small, and the dependency runs one way:
community rooms reaches into presentation through a dynamic import, never the reverse.

## The repair, and the control that earned its place

Two statements, one transaction, postconditions asserted after the commit: 2 attempts
cleared, 7 holds released, 0 dangling attempts and 0 stale holds remaining.

The controls are the point. **6 attempts with a live booking had to stay untouched**,
and they did. And a second control caught something the first pass would have missed:
between the diagnosis and the repair, a **new** reservation appeared — Chuks booking a
PREP-3 room at 07:11 for 07:16 the same morning. A sweep written as "release everything
still held" would have cancelled a rehearsal he was about to walk into. It was scoped
to `upper(slot) < now()` and left alone, verified by count before and after.

## What is still true after this

Chuks has three PREP tasks across two projects:

- **PREP-2** — the one he deleted the room for. Repaired; the form is back.
- **PREP-3** — he booked it himself at 07:11 on 2026-11-04 and was in it at 07:23.
- **PREP-1** — still shows the room from his 2026-10-23 rehearsal, because that booking
  **does** still exist and is not cancelled.

PREP-1 is not this defect. It is the absence of a *Book another take* control: the API
has taken `new_attempt` since it was written and no screen has ever sent it, so once a
rehearsal is done its card stays and there is no way to start the next one. Same
sentence from a student — "I cannot book another room" — different cause, and a feature
decision rather than a bug. Flagged, not quietly bundled into a defect fix.

## Pre-existing failures, not caused here

`demoPostPlayback`, `presentationPortfolio`, `recordingViews` and the take-visibility
half of `presentationSessionService` fail locally with `col is not a function` from
`recordingViews.ts:73`. None of them imports anything changed here, they fail
identically on a suite that touches none of this, and CI is green on them — this
worktree has no `backend/node_modules`, so a different `sequelize` resolves. Worth
someone's attention; not this change's doing.
