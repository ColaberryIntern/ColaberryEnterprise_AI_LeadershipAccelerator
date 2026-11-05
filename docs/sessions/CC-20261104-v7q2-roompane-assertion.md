# CC-20261104-v7q2 — main red again, on a stale source-scan assertion

- [x] Update the RoomPane join assertion to match the refactored source
  - Date: 2026-11-04
  - Session: CC-20261104-v7q2
  - What changed: one assertion in
    `frontend/src/components/portal/__tests__/broadcastWatchButton.test.tsx`. No source file.
  - Verification: 10 of 10 pass in that suite, exit 0, where it was 1 failed before. The old
    literal occurs **0** times in the scanned file and the new one occurs **1**, so the
    assertion really was stale and the replacement really does match.
  - Notes: below.

## What happened

`broadcastWatchButton.test.tsx` reads `pages/portal/rooms/RoomPane.tsx` as text and asserts it
contains specific lines — a deliberate technique, and the suite says so: it proves the wiring is
present, which is the part a refactor silently drops.

One of those literals was:

```
const { join_url } = await joinVideoRoom(roomId);
```

Commit `07141d6f`, *"Rooms on a phone: opening a room now shows the room"*, legitimately wrapped
that call so a mobile tab opens from the click:

```
const outcome = await openTabForJoin(async () => (await joinVideoRoom(roomId)).join_url);
```

The escape the test guards was never removed. Only the line around it changed, and the literal
match broke and took main red with it.

## Why the assertion was loosened rather than retyped

Retyping the new statement would guarantee the next refactor of the wrapper breaks it again. The
test's stated purpose is that the two-way join escape is still wired, and that is exactly
`joinVideoRoom(roomId)`. The surrounding plumbing is free to change.

It is not loose enough to be vacuous: the import line reads `joinVideoRoom,` with a comma, so
only a real call carrying `roomId` matches. The scanned file contains exactly one occurrence.

The other three assertions in the same block still hold against main unchanged, and were checked
rather than assumed.

## Not mine, and flagged as such

This is the rooms-on-mobile workstream's change. I fixed the assertion rather than leave main red
for everyone, because it is a one-line stale literal with an unambiguous correct value and no
competing branch was open on it — unlike the presentation-clock break earlier today, where a fix
was already in flight and I duplicated it.
