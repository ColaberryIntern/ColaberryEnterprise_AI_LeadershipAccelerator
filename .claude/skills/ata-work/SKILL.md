# ata-work - work the next few tickets in one pass

Claim a batch, work it, release it. The middle between `/ata-work-task` (one ticket) and
`/ata-list` (a whole list).

**Invoke on:** `/ata-work`, `/ata-work --top 5`, "work the backlog for an hour", "clear a few
tickets", or when Ali pastes the `/ata-work <run-id> --top N` line off the triage board.

---

## One command, then the loop

```bash
node scripts/ataWorkBatch.js --top 5 --holder "<your tab name>"
```

Claims up to five tickets, prints every brief, and gives you one release command. Run it inside
`accelerator-backend`.

```bash
node scripts/ataWorkBatch.js --top 8 --holder "<tab>" --disposition prep
node scripts/ataWorkBatch.js --top 5 --holder "<tab>" --list "3. Tracking Shipments"
node scripts/ataWorkBatch.js --top 5 --dry                      # see the batch, claim nothing
node scripts/ataWorkBatch.js --holder "<tab>" --release-all     # when the pass is done
```

---

## The five that cost something

### 1. It defaults to `act`, and you should usually leave it there.

`act` means the ticket's own evidence says nothing is blocking it and no human is required - work
that fell off for no reason. Those are the free wins and the whole reason the batch exists.

`--disposition any` will hand you decisions and filings that a session cannot make or do. Use it
only when you are deliberately surveying, never when you are working.

### 2. A skipped ticket is a correct outcome, not a failure.

Claims are taken one at a time and a held ticket is **skipped, not waited on**. Asking for five
and getting three because two were taken by another tab is the system working. The skip list names
who holds each one.

**Never retry into a held ticket.** Take the three and move on.

### 3. Release at the end of the pass, every time.

```bash
node scripts/ataWorkBatch.js --holder "<tab>" --release-all
```

A claim expires on its own, so a crashed tab does not lock tickets forever - but an unreleased
batch keeps five tickets hidden from every other tab until the lease lapses. The default lease is
90 minutes, which is long enough to be annoying.

### 4. A missing finish line is a stop, for the batch as much as for one ticket.

**83% of tickets do not state what done means.** The batch counts them and tells you how many.

If several in one batch share a gap, **ask Ali one question covering all of them** rather than
five separate ones, or establish the finish line from each ticket's `Source of truth` document.
A session that invents a finish line delivers something nobody asked for, and it looks done.

### 5. Check the list decision before working a batch out of one list.

If you are using `--list`, read that list's card on the triage board first. Working tickets inside
a list that should be dismissed spends effort AND makes the list look alive. `/ata-list` answers
that question; this skill assumes it has already been answered.

---

## Working the batch

For each ticket, in the order printed:

1. Read the work order. It already carries the url, the deadline, what to read first, where the
   artifact goes, and the skill the ticket names.
2. **If it names a `Required skill`, use that skill.** 32 tickets name `/loop-architect`.
3. Do the work to the repo's normal gates: tests, `tsc --noEmit`, a session-log entry.
4. Record what you did **on the ticket**, not only in chat.

Then release the whole batch.

---

## Definition of done

- Every ticket in the batch was claimed before it was read, and the batch was released after.
- Nothing was worked that stated no finish line, without one being established or asked about.
- No held ticket was retried into.
- If the batch came from one list, that list's own decision was checked first.
- Each ticket carries a record of what was done, on the ticket.
