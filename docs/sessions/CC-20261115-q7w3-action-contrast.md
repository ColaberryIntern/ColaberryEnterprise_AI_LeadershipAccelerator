# CC-20261115-q7w3 — AF12.6 step 1: measure every action surface, pin the failures

Basecamp: AF12.6, todo `10493692143` (Agent Factory list `10406233777`), P1, due 2026-11-14.
Execution mode on the ticket: "Gate now, brand decision by Aleem and Ali."

## Scope, and what was deliberately NOT done

The ticket splits itself in two and this is step 1 only:

- **STEP 1, no visual change, ship now.** Lift the campus WCAG resolver into a shared helper,
  assert AA on every path that already passes, and record the paths that fail as a pinned
  inventory with a count that can only go down.
- **STEP 2, needs Aleem and Ali.** The actual recolour, and whether this repo adopts red-600 now
  or waits for Aleem's corrected red-500.

**No colour changed.** Re-pointing the action colour moves the primary brand action across the
public site, the portal and campus; roughly 25 further rules hardcode white-on-cherry and would
not follow a token change; and Aleem owns the design system and has said he will correct red-500
himself. If this repo re-points first and he then ships a corrected red-500, the two diverge.

## What was verified before building

Every load-bearing claim in the ticket was checked against `origin/main`, and the contrast ratios
were recomputed from the hex rather than taken from the ticket:

| Fill | White-on-it | Ticket said | Verdict |
|---|---|---|---|
| `--red-400` `#FD5760` | 3.13:1 | 3.13 | FAILS AA and AA-large |
| `--red-500` `#FB2832` | 3.85:1 | 3.85 | FAILS AA |
| `--red-600` `#E5121D` | 4.73:1 | 4.74 | passes |
| `--red-700` `#C20E1E` | 6.22:1 | 6.22 | passes |

`tokenCascade.test.ts` does pin `--color-primary` to `#FB2832`, pin the disagreement count, and
assert `--color-primary` is not among the drifting tokens — so the ticket is right that fixing the
colour turns that suite red in three places, and right that it must not be deleted: it is the only
thing pinning the import order.

**A correction to my own earlier report.** I had told Ali this ticket's premise looked wrong,
on the grounds that the test it cites is a calibration fixture. I had looked at
`campusContrast.test.ts`, which the ticket cites favourably as the precedent to lift. The test it
criticises is `tokenCascade.test.ts`, which is a different file and does exactly what the ticket
says. The premise was correct.

## What changed

| File | Change |
|---|---|
| `frontend/src/styles/__tests__/testEnv/cssContrast.ts` | NEW. The WCAG resolver, lifted out of the campus suite: colour parsing, `var()` resolution, alpha compositing, luminance, ratio, thresholds. |
| `frontend/src/styles/__tests__/actionContrast.test.ts` | NEW, 16 tests. Seven action surfaces measured from the real stylesheets; 2 pass and are guarded, 5 fail and are pinned. |
| `frontend/src/components/campus/__tests__/campusContrast.test.ts` | Now imports the shared primitives instead of carrying its own copy. Behaviour unchanged, 128 tests still pass. |
| `.claude/skills/baseline-ui/SKILL.md` | Adds the four ratios, a warning on `--color-primary` and `--color-primary-light`, and a note on the two paint paths. It published `#FB2832` for primary buttons with no contrast evidence attached. |

Also included, and a different concern: the committed artifact generators for AF12.5 and for the
owner-queue triage one-pager (`scripts/artifacts/tickets/af125*.js`, `ownerQueue*.js`,
`buildAf125Artifacts.js`). They produced PDFs already posted to Basecamp. They are committed
because the tooling's own docblock records that the C2.6 generators were scratchpad one-offs and
were lost, which is why the committed pipeline had to be rebuilt.

## The inventory

Five surfaces fail AA today and now say so out loud:

- `bootstrap .btn-primary` 3.85
- `bootstrap .btn-primary:hover` 3.13
- `design-system .cb-btn` 3.85
- `projects .pw-act.open` 3.85 (literal hex)
- `feed .fchip.active` 3.85 (literal hex)

Two pass and are now guarded against regression: `.cb-btn:hover` (4.73) and `.cb-btn:active`
(6.22). The resting state is not the worst state, which is asserted as its own test.

## Verification

- `tsc --noEmit` (frontend's own TypeScript 5.9.3, not the root 4.9.5) — **exit 0**, after
  planting a control error in each new file: exactly 2 errors, both restores byte-identical.
- **10 of 10 mutations caught**, after fixing two the first run exposed.
- Full frontend suite: **9,815 passed**, 29 skipped.
- `react-scripts build` — clean. The helper imports `fs` and lives under `src/`, so the bundle was
  checked rather than assumed; nothing imports it from app code so it never enters the graph.
- `secret-scan` self-tested on 4 planted secrets, then clean over 8,764 files.

### The mutation run found a real defect in my own gate

Two mutations were NOT caught on the first run:

1. **Repointing `.btn-primary` in `global.css` changed nothing.** The surface hardcoded
   `renderedBootstrapToken('--color-primary')`, so it measured the token the TEST named rather
   than the one the STYLESHEET paints, and would have reported a confident ratio for a colour
   nobody renders. That is the same mistake as quoting `tokens.css` as the authority, one layer
   up. Fixed: the fill is now read out of the rule.
2. **`resolveVar` returning the raw value instead of throwing was invisible.** The helper's
   docblock claims it refuses an unresolvable token precisely so a contrast check cannot silently
   skip a pair; nothing asserted it. Fixed with a direct test.

Both are now caught, and the second is the reason the repo's own line about prose not failing a
build applies to docblocks too.

## Known local-vs-CI difference

`frontend/src/styles/__tests__/testEnv/cssContrast.ts` reports "Your test suite must contain at
least one test" when jest reaches it. So do the three `testEnv/` helpers already on main. CI runs
`react-scripts test --testPathIgnorePatterns "/testEnv/"` for exactly this reason and has been
green with those three since PR #3925; this is the fourth file of an established convention, not
a new problem.

## Not done

- **The recolour.** Step 2, and it is Aleem's and Ali's.
- **The other ~25 rules that hardcode white-on-cherry.** Two literal-hex surfaces are inventoried
  (`projects.css`, `feed.css`); the rest are not enumerated, and the inventory is explicitly a
  list of action surfaces rather than a complete audit of the product.
- **Dark mode** is not covered for the action surfaces; the campus suite covers it for campus.
