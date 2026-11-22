# L11.7 — the pre-existing stories are not swept

Ticket L11.7 · Basecamp `10516239480` · Decided 2026-11-21 · Session `CC-20261120-k4d9`

---

## The decision

**The ticket's own recommendation stands: no retrofit sweep.** Roughly 200 open stories already
on the four live boards keep the contracts they were created with. The artifact-contract
requirement applies to stories created from now on, and the existing ones are brought up to it
only when somebody is already working on them.

## Why not sweep

A sweep sounds like tidying and behaves like a migration.

**It changes what a student is being graded on, mid-build.** Every one of those stories is on a
board somebody is working from. Adding an artifact contract to a story in flight changes the
acceptance criteria under the person building it, which is the same defect this programme has
already paid for twice: in AF3.9, where a task could be built and pushed and then never verified
because the verifier had no spec for it, and in the Command Center id, where nineteen of twenty
live builds sat three versions behind because a board row and its criteria were written in two
places.

**The blast radius is every live board at once.** Four boards, around 200 rows, each one a
student's visible work queue. There is no staged rollout of a sweep: either the rows change or
they do not. That is the opposite of how every other change in this programme has shipped, which
is behind a per-enrollment flag with the default off.

**The benefit is retrospective and small.** An artifact contract makes a story's output provable.
Applying one to a story that is already half built does not make its already-produced output
provable; it just makes the row look compliant. The value lands on stories that have not been
started, and those are exactly the ones a sweep is not needed for, because they will be created
under the new contract anyway.

**Nobody has asked for it.** No verification run, no payment dispute, and no student report traces
back to a pre-existing story lacking an artifact contract. A 200-row change to live boards with no
reported failure behind it is a change made because it is tidy.

## What happens instead

- **New stories** carry artifact contracts, which is already the behavior and needs nothing.
- **A pre-existing story that is touched for any other reason** gains one as part of that work.
  This is the same grandfathering rule CLAUDE.md's Modular Composition section uses for oversize
  files: the next change to it brings it up to standard, rather than a campaign to fix everything
  at once.
- **The boards are not audited for compliance** against a contract their rows predate. An audit
  that reports 200 non-compliant rows nobody intends to change is a number that trains people to
  ignore the report.

## What would reopen this

- **A measured failure traced to a missing artifact contract on a pre-existing story.** One real
  case, with the story id, beats the argument above. The whole reason not to sweep is that the
  harm is hypothetical; a counted instance changes that.
- **A compliance or client commitment** that requires every open story on a board to carry one.
  Then the sweep is not tidying, it is a requirement, and it gets scheduled as work with a window
  rather than performed quietly.
- **The population shrinking enough that the sweep is cheap.** These are open stories; they close.
  If the 200 becomes 20 through ordinary completion, the risk calculus inverts and this decision
  should be re-read rather than inherited.

---

**Scope note:** this decision covers the pre-existing open stories only. It says nothing about the
artifact-contract requirement itself, which stands.
