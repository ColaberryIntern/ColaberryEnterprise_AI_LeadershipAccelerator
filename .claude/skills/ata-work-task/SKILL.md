# ata-work-task - pick up one ticket properly

Claim a single ticket, get everything needed to work it, and release it when done. The trenches
half of the triage board; `/ata-list` is the strategic half.

**Invoke on:** `/ata-work-task <projectId>/<todoId>`, "work this ticket", "pick up AF8.1", or when
Ali pastes a work order or a `work just the lead task` command off a list card.

---

## One command

```bash
node scripts/ataWorkTask.js --task 7463955/10406234078 --holder "<your tab name>"
```

It claims the ticket, then prints the work order, the ticket in full, and a release command. Run
it inside `accelerator-backend`, where the database credentials live.

```bash
node scripts/ataWorkTask.js --task <id> --holder "<tab>" --release   # when done
node scripts/ataWorkTask.js --task <id> --peek                        # look without claiming
```

---

## The four that cost something

### 1. Claim BEFORE you read, not after.

The script does this for you, and the ordering is deliberate: a session that cannot have the
ticket never sees the brief and is not tempted by it.

ATA's own idempotency marker is a comment on the Basecamp thread. That is the right source of
truth for "has ATA acted" and **completely blind to a session with a worktree open and a PR
half-written**. Two tabs handed the same digest will otherwise do the same ticket, and neither will
know until the second PR opens.

**If it is held, take a different ticket.** Do not wait. There are hundreds available and blocking
on one is how a tab goes idle. The refusal names the holder and the expiry so you can say who has
it if asked.

### 2. A missing finish line is a stop, not a detail.

**83% of tickets do not state what done means.** The work order prints
`done when: NOT STATED in the ticket` rather than leaving a blank, because the blank is what
invites a session to invent one.

Establish the finish line from the ticket's own `Source of truth` document, or ask Ali **one**
question. A session that invents a finish line delivers something nobody asked for, and the work
is worse than not having started: it looks done.

### 3. Use the skill the ticket names.

32 tickets carry `Required skill: /loop-architect`. The work order surfaces it as
`start with /loop-architect (named by the ticket)`.

The ticket telling you the house approach is better information than your own judgement about the
approach. Use it.

### 4. 🧑 means prepare it, not do it.

A ticket marked with the human emoji, or reading `Required skill: none - human task`, is a filing,
a signature, a decision or a payment. **No session can do it.** The valuable contribution is to
make the human step short: assemble the forms, pre-fill what is knowable, draft the message, and
leave a ten-minute action instead of an afternoon.

Do not mark such a ticket as worked. Say what you prepared and what remains.

---

## Finishing

1. Do the work, following the repo's normal gates: tests, `tsc --noEmit`, the session log.
2. Say what you did **on the ticket**, not only in chat.
3. **Release the claim.** A claim expires on its own, so a crashed tab does not lock a ticket
   forever, but an unreleased claim keeps a ticket hidden from every other tab until it lapses.

```bash
node scripts/ataWorkTask.js --task <id> --holder "<tab>" --release
```

---

## Definition of done

- The ticket was claimed before it was read, and released after.
- A stated finish line existed, or one was established, or a single question was asked.
- The skill the ticket named was the skill used.
- A 🧑 ticket was prepared, not worked, and the remaining human step was named.
- The work is recorded on the ticket, not just reported in a session.
