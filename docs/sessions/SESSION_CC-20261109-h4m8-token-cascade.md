# Session CC-20261109-h4m8 — the token cascade, and two places that denied it

- [x] Correct the `design_token_drift_audit` capability record, correct the
      `baseline-ui` skill, and add the test that would have caught both
  - Date: 2026-11-09
  - Session: CC-20261109-h4m8
  - What changed: `product_experience.json` (capability workflow step 1 and a
    dependency), `.claude/skills/baseline-ui/SKILL.md` (canonical sources, the
    colour table, the font stack, the brand-palette caveat), and a new
    `frontend/src/styles/__tests__/tokenCascade.test.ts`.
  - Verification: frontend `tsc --noEmit` 0 errors with a planted control error
    confirming the compiler was looking; `tokenCascade.test.ts` 8/8;
    `agentDomain/__tests__` 55 suites / 1299 tests pass; `checkTestTypecheck.js`
    "matched exactly, in both directions". Both load-bearing assertions
    mutation-tested.
  - Notes: raised by Mohammed Abdul Aleem on Mihret Netsereab's PR #2. He named
    one of the two false claims; the other was step one of the agent's workflow.

## Where this came from

Aleem reviewed Mihret's R0 design-token drift audit definition on 9 Nov and
closed with: *"The capability record's dependency, 'tokens.css remaining the
single token authority', is wrong and should be corrected at the record. Please
raise it with Ali."*

It is wrong, and I verified it by measurement rather than taking his word or
Mihret's:

| | |
|---|---|
| `global.css` (which `@import`s `tokens.css`) | imported at `index.tsx:23` |
| `brand-bridge.css` | imported at `index.tsx:26` — **after** |
| Properties declared on `:root` by both | **21** |
| Of those, whose rendered value differs from `tokens.css` | **19** |

Same selector, same specificity, later source order. For those 21 names the
bridge is what the browser paints, and it re-points each at
`src/colaberry/tokens/*.css`.

## What actually renders

| Token | Renders | `tokens.css` says |
|---|---|---|
| `--color-primary` | `#FB2832` | `#FB2832` (agrees) |
| `--color-primary-light` | `#FD5760` | `#C20E1E` |
| `--color-secondary` | `#E5121D` | `#e53e3e` |
| `--color-accent` | `#5BA63C` | `#38a169` |
| `--color-bg` | `#FFFFFF` | `#ffffff` (agrees) |
| `--color-bg-alt` | `#F8F8F7` | `#f7fafc` |
| `--color-text` | `#2B2B2B` | `#2d3748` |
| `--color-text-light` | `#6B6B6B` | `#718096` |
| `--color-border` | `#E4E4E3` | `#e2e8f0` |
| `--color-muted` | `#6B6B6B` | `#9ca3af` |
| `--font-body` / `--font-heading` | `Roboto` first | `Segoe UI` first |

`--color-primary-light` is the one that matters most: it is the link, hover and
focus-outline colour, and `#C20E1E` is a deep cherry while `#FD5760` is a light
coral. They are not near each other. `--color-muted` and `--color-text-light`
also collapse onto the same grey at runtime, so a documented contrast step
between them does not exist.

## The second false claim, which nobody had named

Aleem found the dependency line. The same false premise is also **step one of the
capability's workflow** — "Parse tokens.css to build the authoritative token
set". That is worse than the dependency, because a dependency is a caveat and a
workflow is an instruction: an audit built that way reports the wrong expected
value for 19 of 21 tokens and flags correct code as drift. Both are corrected.

## And the skill was wrong in the same way

`.claude/skills/baseline-ui/SKILL.md` is what every session in this repo reads
before building a page. It said *"tokens.css — the design tokens. This is the
source of truth"*, published `#C20E1E`, and gave the font stack as Segoe UI.

**The 2026-08-25 correction to that file is what caused it.** That note fixed a
genuinely invented navy palette and concluded: *"Verify against `tokens.css`
rather than trusting this table; a summary can go stale, the source file
cannot."* The advice is false whenever two source files declare the same
property. Anyone who followed it read one real file, correctly, and still got the
wrong colour. The file now carries the cascade, the rendered values, and that
reasoning, so the next reader does not repeat it.

The brand palette (`--cherry`, `--cherry-deep`, `--cherry-bg`, `--leaf`) is **not**
redefined by the bridge, so `tokens.css` is right for those four. Stated
explicitly, because a blanket "do not trust tokens.css" would be its own error —
and because `--cherry-deep` really is `#C20E1E`, the value the skill used to
attach to `--color-primary-light`.

## Failure-first notes

1. **What happens if it fails:** nothing at runtime. All three changes are a
   data file, a markdown reference, and a test. No code path changes.
2. **Retry:** not applicable.
3. **Recovery:** revert. The capability record is read as data; no migration.
4. **Handled vs not handled:** the test handles a reorder of the two imports, a
   bridge token re-pointed at a name that does not exist, a change to any of the
   nine quoted colours, a new override being added, and the font stack flipping
   back. It does **not** read computed styles from a live browser, so a value
   overridden by a *third* stylesheet loaded after `brand-bridge.css`, or by a
   more specific selector than `:root`, would still escape it. `admin-shell.css`
   loads after the bridge and is the obvious candidate if a value ever disagrees
   with this test.

## Why the test exists, and what it caught

Both false claims were prose, and prose does not fail a build. The new test
pins the cascade instead.

It immediately caught an error of my own: I asserted 19 of 21 disagreed and it
reported 20. `--color-bg` is `#ffffff` in `tokens.css` and `#FFFFFF` at runtime —
the same white, differing only in case. The comparison is now case-insensitive,
because the browser is, and counting that as drift would have overstated the
problem.

Both load-bearing assertions were mutation-tested:

- Swapping the two imports in `index.tsx` failed the load-order test **and only
  that test**. That reorder silently changes 21 token values on every page.
- Re-pointing `--color-border` at `var(--border-subtle-typo)` failed the
  dangling-chain test and the pinned-value test. Worth noting what that mutant
  looks like in review: the property applies **no value at all**, while the
  comment beside it still reads `/* #E4E4E3 */`.
