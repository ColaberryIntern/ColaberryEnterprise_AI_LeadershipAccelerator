# CC-20261116-h4r2 — the home hero, rebuilt to the supplied file

Ali, looking at the deployed home page: *"what file are you looking at because
nothing I gave you looks like this."*

He was right, and the honest finding is about the verification, not just the
page.

## What the checks could not see

The three fidelity PRs that preceded this (#4082, #4088, #4091) measured **band
counts and heading order**. Both the old hero and the model's hero are one
band with one h1, so every assertion passed, the production verifier printed
ALL CHECKS PASSED, and the most prominent element on the site matched nothing
Ali had sent. **Counting sections cannot see a picture.**

## What was actually wrong

1. **A system diagram that is in neither supplied file.** Ingest, Model,
   Deploy, Agents, Guardrails, five people and a HANDOVER COMPLETE stamp.
   Checked against both downloads: absent from `colaberry-enterprise-site.html`
   **and** from `colaberry-enterprise-v4.html`. It came from a much older
   design.

2. **A layout collision I shipped the day before.** `.cbv2-h8` was
   `display: flex`, so the rollout grid folded into the hero in #4088 became a
   sibling column rather than a band beneath. Measured on production: the grid
   at x=878..1440 over a diagram at x=516..968.

3. **The hero's parts were wrong.** Both files specify: eyebrow, headline, the
   lede and two buttons beside it, three CARDS with a sentence each, and the
   rollout block full width with a colour legend and a
   department-by-department / company-wide toggle. What shipped had bare chips
   with no copy, no legend, no toggle.

## What landed

- [x] The hero rebuilt to the file
  - Date: 2026-11-16
  - Session: CC-20261116-h4r2
  - Verification: 781 publicV2 tests pass; `tsc --noEmit` clean; both copy
    ratchets pass under the CI jest config; contrast measured on eight
    elements, all passing; the toggle driven in a browser and confirmed to
    change the heading, the lede, all six statuses and `aria-pressed`; six
    mutations each turned a new guard red.

### The hero is light again

The model's top half is white and only the rollout band is dark. Building the
whole thing dark is most of why the page still read as a different site even
once its parts were right. The band is full bleed, and the six departments sit
in one row as the model draws them.

### A defect found by measuring rather than looking

First pass at the light hero left the band's heading at **1.17:1** against
near-black. Cause: the rule ended up with TWO `color` declarations, and the
later one resolved to `var(--h8-ink)` — which had just been redefined to the
light hero's dark ink. It rendered as a finished page.

Fixed structurally rather than per element: the band redefines `--h8-ink`, so
anything added to it inherits the right ink. Now 18.82:1. Two guards hold it:
the band must flip the token, and **no rule in the file may declare `color`
twice**.

### The toggle is real

The model encodes two statuses per department, one per mode, and so does this.
Driven in a browser: heading, lede, all six statuses and `aria-pressed` all
change, zero page errors. Pinned by tests driven on plain `react-dom` —
`@testing-library/react` is not a dependency here and adding one to write a
test is not a decision to take on the way past.

### Two guards were inverted, not deleted

- `draws the machine layer and the people layer` **required** the diagram, and
  passed for months. A guard that requires something absent from the brief is
  holding the site away from it. It now forbids the diagram.
- `carries the offer as the h1` required "Then the next leader.", the hero's
  deck. That sentence is in neither file. The assertion follows the point it
  made — *department by department, or company-wide* — which the lede and the
  toggle both still say.

### The guard that was missing

`builds the hero from the four parts the model gives it` asserts the eyebrow,
the headline, the lede, both buttons, all three cards **with their sentences**,
and the rollout block with its legend and its toggle. That is the check whose
absence let this ship.

## Mutation-tested

| Mutation | Caught by |
|---|---|
| the band stops flipping the ink token | the ink guard |
| a rule gets a second `color` declaration | the duplicate-declaration guard |
| the toggle is made inert | the mode-change assertion |
| the system diagram comes back | the inverted diagram guard |
| a verb card loses its sentence | the four-parts guard |
| the legend drops a state | the words-not-colour guard |

## Baselines

Both ratchets turned down and were recorded: escaped dashes 69 → 68 and the
word "free" 261 → 260, each with the `HeroV8.tsx` entry deleted rather than
zeroed, because the hero lost the sentence and the proof row that held them.
