# CC-20261115-w8q3 — the site against the file Ali gave us

Ali: "colaberry-enterprise-site.html - website does not look like the file I gave you".

## The file is the right file

`docs/enterprise-site-v5/index.html` is byte-identical to the download
(md5 `8fc9d341ff16009f3c29be510b3bf901`), so the complaint is not that a newer
model was missed. It is that the adoption diverged.

## Measured, not eyeballed

Both sides loaded page by page in one browser at 1440px, model from disk, live
from production. Bands counted as outermost visible `<section>`s; the accent
read off a real primary button rather than off CSS text.

| Page | Model | Live before | Diff |
|---|---|---|---|
| Home | 7 bands / 7,875px | 10 / 7,792px | +3 bands |
| Services | 5 / 5,044px | 4 / 3,559px | −1 band |
| Build | 7 / 5,251px | 6 / 4,625px | −1 |
| Guide | 7 / 5,230px | 6 / 4,657px | −1 |
| Train | 6 / 4,461px | 6 / 4,476px | — |
| How it works | 6 / 5,719px | 8 / 6,311px | +2 |
| **Platform** | **4 / 5,910px** | **9 / 11,854px** | **+5 bands, +5,944px** |
| Pricing | 5 / 3,993px | 6 / 7,040px | out of scope, Ali's call |
| Book | 4 / 3,672px | 3 / 2,256px | −1, blocked on two inputs |
| Demo pilot | 1 / 1,687px | 3 / 2,590px | +2, consent band |

Already matching: the display font (both render Space Grotesk), the ten nav
items in the same order, and the h1 on every page.

**The difference on every pixel of every page was the accent.** The model paints
every primary action, pill and active state in cherry `#FB2832`; live paints them
in the Colaberry Enterprise accent `#2E6A86` — which is what Ali asked for
earlier the same day. Both instructions cannot hold at once, so it was asked as a
standout question with the two swatches side by side rather than resolved
quietly.

**Ali, 2026-11-15: the colour is right, close the structural gap.**

Review artifact, validated in-browser (20/20 images decode, 0 errors, 0 overflow)
and opened for him:
`...\scratchpad\FIDELITY_REVIEW.html`

## Phase 1 — /platform, the largest gap

- [x] /platform from nine bands to the model's four
  - Date: 2026-11-15
  - Session: CC-20261115-w8q3
  - What changed: the four surfaces became siblings inside one band instead of
    four full-width bands each paying for its own eyebrow, h2 and section
    padding. New `platformV2Surfaces.tsx` + `platformV2Surfaces.css`.
  - Verification: measured in a real browser on the built bundle —
    **4 bands, 5,691px** at 1440px against the model's 4 / 5,910px, down from
    9 / 11,854px. 0 page errors, 0 horizontal overflow at 1440px *and* 390px,
    one h1, 2/2 images decode. 763 publicV2 tests pass. `tsc --noEmit` clean
    after a planted control error proved it could fail.
  - Notes: geometry is the model's own `.surf` — a two-column grid, copy and
    figure alternating sides, rows separated by a rule. Stacked, the same four
    surfaces cost nearly twice the height.

### What came off the page, and why that is a judgement call

- `BuildPipeline` — ten stages of the build machine, the single tallest thing on
  the site. The model has no equivalent band. The one sentence in it that a buyer
  needs is now surface 3's lede.
- `CapabilityEarned` — the LMS comparison, the competency weighting, and the
  AI Aware → AI Organization ladder. No model equivalent.
- The inline "the best people to work on your AI already work for you" thesis.

All three components still exist and are unrouted, the same way `CapabilityOS`
and `TwoExperiences` were left when they came off this page. Nothing was deleted.

### What did not come off, deliberately

The readiness drill-down stayed, as surface 4's figure rather than a retired
band, because it carries the real Engineer gate thresholds, the tab semantics and
the "where this stops" boundary note — all three pinned by tests in
`architectExperience.test.tsx`. Matching a picture is not a reason to retire an
audited honesty.

Extracting it needed care: two of those guards slice `ReceiptsDrilldown.tsx` from
`export default` onwards and assert on what follows. A named export placed above
the default would have moved the guarded markup out of the slice, and both guards
would have gone on passing while the thing they guard sat outside them. The panel
is defined below the default export for exactly that reason. One of the two then
caught a word in the new doc comment, which is how it was confirmed live.

### Three new figures, all badged

Surface 2 (releases and stories) and surface 3 (a repository with each commit's
acceptance criterion) are invented data and carry `<SampleBadge>`, same rule as
the rollout table. Checked on the rendered page, not in the source:
**4 figures, 4 visible badges, 0 figures without one.** One criterion is
deliberately `pending` — if all four read "confirmed" the figure would be
claiming nothing ever fails verification.

### The guards were mutation-tested

Six mutations, each turning the suite red:

| Mutation | Caught by |
|---|---|
| a surface rendered as its own `<section>` again | band count |
| `BuildPipeline` put back on the page | band count + retired-band list |
| the releases table loses its badge | badge count |
| every acceptance criterion reads "confirmed" | the pending assertion |
| a surface id misspelled | the numbering assertion |
| "computed from evidence, not attendance" softened | the honesty assertion |

The restore step in that harness was itself broken: it passed an untracked file
to `git checkout --`, which fails the whole command, so all six mutations
accumulated on disk instead of being reverted. Repaired by asserting each
original string occurs exactly once before putting it back, then re-running:
763 pass.

## Still outstanding

- Phases 2 and 3: home 10 → 7 bands, `/services` missing "Common questions.",
  `/how-it-works` 8 → 6. One PR each.
- `/book` needs two inputs from Ali: Ram's two-to-three sentence bio from
  approved materials, and the purchase or download link. The model has literal
  placeholders for both; neither was invented.
- `/pricing` stays as PR #4043 shipped it, per Ali.

## One thing to flag, not hide

Verifying `/government/` on production ran the local browser check against the
live site, and that check submits the request form. It created a **real lead row,
id 25739** — "Jane Doe / jane@agency.gov / Harris County", `form_type`
`gov_refs_request`, 2026-11-16T02:17Z. No email, call or CRM sync fired:
`leadController` defers all automation to the PaySimple webhook. The row is inert
but it is test data in a production table and will show up in lead counts. It
needs one `DELETE` to remove, which is Ali's call, not mine to take.
