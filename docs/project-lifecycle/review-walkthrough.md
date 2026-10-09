# Reviewing a project's blueprint — a walkthrough

**Who this is for:** anyone who has to review a project and decide whether to approve it. It
assumes no knowledge of the codebase. Every step below was checked against the running software
before it was written; where something cannot be checked yet, this document says so rather than
describing what it would probably look like.

---

## Before you start: the feature is off by default

The review screen ships dark. The switch is an environment setting called
`ENABLE_PROJECT_LIFECYCLE`, and until someone sets it to `true` every part of this surface
refuses politely rather than half-working.

If it is off, you will see a yellow box that says the feature is not enabled, followed by
*"Set ENABLE_PROJECT_LIFECYCLE=true to enable it."* That is the whole message — it tells you
exactly what has to change and who to ask. **You will never see an empty screen that looks like a
project with nothing in it.** That distinction was deliberate: an empty page and a disabled
feature look identical, and telling them apart matters.

## Where the screen is

```
/admin/project-lifecycle/<the project's id>?kind=delivery
```

Use `kind=delivery` for a client engagement and `kind=student` for a student build. The `kind` is
required and is not guessed — asking for the wrong one tells you so instead of quietly showing
you a different project's details.

## What you see, top to bottom

### 1. The stage ladder

A row of stages with the project's current position marked. Three states, visually distinct:
the stage you are on, stages already completed, and stages not yet reached.

Completed stages come from the project's own history, **not** from counting along the ladder.
That matters for a project that went backwards: it can legitimately sit at an early stage having
already completed a later one, and the ladder shows that honestly instead of pretending the later
work never happened.

### 2. Where the project stands

A short summary: the stage, who acts next, and what the next action is.

If anything is outstanding, it appears in one of **two separate lists, and the difference between
them is the most important thing on this screen**:

- **Blocked** — something was measured and it failed. There is a specific problem to fix.
- **Not assessed** — nobody has measured it yet. This is *not* the same as "it's fine". It means
  the question has not been asked.

They are kept apart because a reviewer who cannot tell them apart will read the second as the
first and approve something nobody checked.

If there is nothing outstanding, you get an explicit **Ready** state. Ready is its own statement,
not merely the absence of warnings.

### 3. What changed since the last version

A panel comparing the two most recent versions of the blueprint, showing for each kind of record
what was **added**, **removed**, and **revised**.

"Revised" is listed separately and deserves your attention: it means a record that existed before
is still there but now points at a different version of itself. An added or deleted requirement is
easy to spot. A quietly edited one is not, and it is the one most likely to slip past.

You will also see one of these, each meaning something different:

| What it says | What it means |
|---|---|
| Nothing changed in any comparable collection | The two versions really are the same. |
| This is the only revision | There is no earlier version to compare against. Not the same as "nothing changed". |
| This project has no operating blueprint | Nothing has been proposed yet. |
| **Could not compare N collections** | Some records could not be read. **Treat the version as un-reviewed.** |

That last one is a warning, not a detail. It appears even when everything else looks clean, and it
means part of the blueprint was not compared at all.

### 4. What a record connects to

Click any changed record id and a panel shows what else in the project it connects to —
for example a requirement and the proposal section or build story it maps to. Each connection
says which link it came through, so you can tell a real traced connection from a guess.

**Most records will show "no connections recorded", and that is expected right now.** The
blueprint currently records only three kinds of connection: requirement to proposal section,
requirement to build story, and an assignment to the role accountable for it. When there is
nothing to show, the panel says *why* — either the record is not in this blueprint at all, or the
blueprint carries no connection of that kind. It never shows you a blank box and leaves you to
guess which.

Three of the six views — workspaces, controls and design — cannot show anything today, because
nothing in the system writes those records yet. That is a gap in what gets recorded, not an
empty project, and the screen says so.

### 5. Sending it back

If you have the authority to approve a blueprint, you also get a box to **request changes**: write
what must change and send it back to the author.

Three things worth knowing:

- **The version number is on the button.** You are sending back the exact version you are looking
  at, not "the blueprint" — so a new version submitted while you were reading does not silently
  absorb your comments.
- **Sending the same request twice is safe.** If your words are already on record for that
  version, you are told so and nothing is sent again. You never have to wonder whether you
  double-clicked.
- **If you do not have approval authority, the box is not there at all.** It is not shown-then-
  refused. A read-only reviewer sees everything and is offered nothing that would bounce.

## What this walkthrough cannot show you yet

Stated plainly rather than filled in with something that looks like evidence:

- **There are no screenshots.** The tool this repository uses to capture them is listed as a
  dependency but is not installed in the working copy where this was built, and installing it
  there would corrupt a parallel piece of work. Capturing them belongs with the deployment step,
  where the existing production screenshot process already works.
- **Narrow screens are checked structurally, not visually.** Nothing in this surface fixes a
  pixel width, and every row of controls is allowed to wrap rather than run off the edge — three
  rows were found that would have overflowed on a phone and were fixed. But nobody has yet *looked*
  at it on a phone. Those are different claims and this document does not merge them.
- **Nothing here has been deployed.** Every behaviour described above was checked against the
  software running locally against a throwaway database. "It works" and "it works in production"
  are separate statements, and only the first has been earned so far.
