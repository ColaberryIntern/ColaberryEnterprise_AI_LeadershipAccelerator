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

## Deployed and verified on production

PR [#4097](https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/4097),
merged by Ali as `bcb4350562d9`.

**Its own image build was cancelled**, by the merge that landed seconds after
it. Deploying on that green tick would have pulled a pre-merge image and
reported success, which is the failure mode recorded in
`successive merges cancel the image build`. So the deploy waited for main's tip
to finish building instead:

| | |
|---|---|
| Deployed tip | `8490e46b7473` (PR #4090) |
| Image check | `accelerator-nginx:main` matched `sha-8490e46b7473…` before the pull |
| Command | `scripts/deploy-prod.sh` (registry mode), via the scp'd runner |

### Verified by looking, not only by measuring

That distinction is the whole lesson of this session, so both were done:

- **Measured.** `verifyFidelityProd.js` against production: ALL CHECKS PASSED
  across 11 routes. `/` 7 bands / 6,997px, `/platform` 4 / 5,942px, `/services`
  5 / 4,532px, `/how-it-works` 6 / 5,301px; accent `rgb(46, 106, 134)`
  everywhere; all four segment links present in the footer. **This proves
  nothing about the hero on its own** — it is the same class of check that let
  the diagram ship.
- **Looked at.** The deployed hero was captured and read: light ground,
  headline with *into AI.* in the accent, lede and two buttons beside it, three
  ruled verb columns each with its sentence, full-bleed dark band with the
  colour legend, six departments in one row, the toggle, the sample badge. It
  matches `colaberry-enterprise-site.html`.
- **Driven.** The toggle, on production: heading `Department by department.` →
  `Company-wide.`, statuses `[Automating, Demo pilot, Next leader, Not started
  ×3]` → `[Automating, Demo pilot ×5]`, zero page errors.

## Production test lead 25739 deleted

The `/gov-refs` verification run earlier in this session wrote a real row to a
production table: id 25739, *Jane Doe / jane@agency.gov / Harris County*,
`form_type` `gov_refs_request`. Ali approved the delete on 2026-11-16.

Deleted in one transaction, guarded: the script raises and writes nothing
unless 25739 is still that exact name and address, because a hardcoded id with
no identity check is how the wrong lead gets deleted. Dependents were walked
from the FK catalog rather than from a list typed by hand — 34 tables carry an
FK to `leads.id`.

**It was not as inert as reported.** One dependent row existed:
`opportunity_scores`. No outbound email, call, or CRM sync had fired (the lead
controller defers all of that to the PaySimple webhook), but the scoring
service had already scored it. Both rows are gone; `leads` now holds no
`gov_refs_request` row at all, and no Jane Doe row anywhere.

## Still open, and why

- **`/book` is one band short.** It needs Ram Katamaraja's two-to-three
  sentence bio from approved materials and the purchase or download link.
  Neither can be written here: a bio is a claim about a person, and inventing
  one is the thing the claim registry exists to prevent.
- **`to="/contact"` on `/pricing` and eleven other pages.** Flagged, not
  fixed. It works through a redirect route and costs one extra client-side
  navigation. `/pricing` is explicitly out of scope per Ali.
