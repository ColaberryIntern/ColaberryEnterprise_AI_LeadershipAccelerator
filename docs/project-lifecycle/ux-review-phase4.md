# UX quality review — Phase 4 workspace and control contracts

**Status:** review of CONTRACTS AND TOKENS, not of rendered screens · **Date:** 2026-10-06 · **Session:** CC-20261001-q7m4
Reviewed against `/baseline-ui`, `/ui-ux-design` and `/fixing-accessibility`, and against the
design system itself: `frontend/src/styles/tokens.css`, `global.css`, `responsive.css`.

---

## 1. What this review can and cannot establish

**There is no rendered surface in Phase 4.** P4-T1 produces workspace *contracts*; P4-T4 produces
design *structures* and *declared* journeys. Phase 5 builds the surface. So this review checks
what exists now — the contract fields and the design tokens a contract will be realised in — and
it cannot check what a screen looks like.

§4.5 says it itself: "a screenshot or matching domain vocabulary alone does not establish
usability". Screenshots and real responsive behaviour are **deferred to Phase 5** and recorded in
the carried-forward register as a deferral with a reason, not as a gap nobody noticed.

**What this review did change:** three of §4.5's UX requirements turned out to be *mechanically*
checkable against the token file rather than matters of judgement, so they became checks in
P4-T5's code instead of paragraphs here. That is the useful half of a specialist review — finding
which "quality" requirements are actually assertions.

---

## 2. Default light theme — compliant, and dark is RULED OUT by measurement

§4.5: "Default light theme; optional dark only if supported by existing tokens."

```
grep -rn "prefers-color-scheme|data-theme" frontend/src/styles/*.css   →  no matches
```

**There is no dark theme in this design system — not a partial one, none.** No
`prefers-color-scheme` block, no `data-theme` attribute, and no dark counterpart for any of the hex-valued
tokens `checkTokenContrast.js` reports (58 at the time of writing). So the condition §4.5 attaches to dark mode is not met, and a workspace
contract that declared a dark variant would be declaring something the design system cannot
render.

**Rule for the contract:** light only. This is a measurement, not a preference, and it is the kind
of claim that would otherwise be settled by someone's taste.

---

## 3. Contrast — measured, and six token pairs fail AA for normal text

Reproduce every figure below with one command from the repo root:

```
node scripts/checkTokenContrast.js
```

It parses the hex values **out of `tokens.css`** rather than out of the `/baseline-ui`
summary table — that table carried wrong brand values until
2026-08-25 and says so in its own text. The script carries a **positive control** and exits
non-zero if it fails: it must return 21.00 for black-on-white and 1.00 for white-on-white,
because a contrast function that cannot produce those two is not measuring contrast. It also
refuses to report anything if its token regex matches fewer than 20 tokens, so a parse that
silently found nothing cannot pass as a clean result.

| pair | ratio | AA normal (4.5:1) | AA large / non-text (3:1) |
|---|---|---|---|
| `--n900` on `--n50` | 16.38:1 | PASS | PASS |
| `--color-text` on `--color-bg` | 11.99:1 | PASS | PASS |
| `--n700` on `--n100` | 7.84:1 | PASS | PASS |
| `--color-primary-light` on `--color-bg` (focus ring) | 6.22:1 | PASS | PASS |
| `--status-matched-text` on `--status-matched-bg` | 5.26:1 | PASS | PASS |
| `--status-unmapped-text` on `--status-unmapped-bg` | 4.72:1 | PASS | PASS |
| `--color-text-light` on `--color-bg` | 4.02:1 | **FAIL** | PASS |
| `--status-verified-text` on `--status-verified-bg` | 3.95:1 | **FAIL** | PASS |
| `--color-primary` on `--color-bg` | 3.85:1 | **FAIL** | PASS |
| `--color-danger` on `--color-bg` | 3.76:1 | **FAIL** | PASS |
| `--status-partial-text` on `--status-partial-bg` | 3.61:1 | **FAIL** | PASS |
| `--color-muted` on `--color-bg` | 2.54:1 | **FAIL** | **FAIL** |

### What follows from this

- **`--color-primary` at 3.85:1 is fine where the design system actually uses it** — headings, at
  `font-weight: 700` and a heading size, which is large text and governed by the 3:1 bar. It is
  **not** fine for a status label at `--font-size-sm` (12px). The ratio did not change; the size
  it is used at decides whether it complies.
- **Two of the four status pairs fail AA for normal text**, and a status label is normal text
  almost by definition. `partial` at 3.61:1 and `verified` at 3.95:1 are the ones to avoid; the
  `matched` and `unmapped` pairs pass. This is a finding about the **existing** design system, not
  about Phase 4's work, and it is in the register for the owner of the token file.
- **`--color-muted` fails even the 3:1 non-text bar at 2.54:1.** It should not carry text or a
  meaningful boundary at all. `--color-text-light` (4.02:1) is the nearest usable neutral and is
  still short of AA for body text.

**Rule for the contract, and it is a CHECK rather than advice:** a declared status label names a
token pair, and the pair must come from a measured allow-list of pairs at or above 4.5:1. P4-T5
ships that check with the allow-list **derived from `tokens.css` by the test** rather than
hardcoded, so the list cannot drift from the file it describes. The runtime stays pure — the
backend validates against an allow-list it is given; the test is what proves the shipped default
matches the real tokens.

---

## 4. Reduced motion — compliant by a global rule, with one contract obligation

`responsive.css:88-97` reduces every animation and transition to `0.01ms` under
`prefers-reduced-motion: reduce`, applied with `*`, `*::before` and `*::after` and `!important`.
`global.css` carries two further blocks at `:674` and `:759`.

This is a **blanket** rule, which is the right shape: it cannot be forgotten per-component. So a
workspace contract inherits compliance and does not need to declare anything — **unless** it
declares motion as load-bearing. §4.5's "avoid decorative futuristic effects that obscure
decisions" and this rule point the same way: if a state is only distinguishable by movement, the
reduced-motion user cannot distinguish it.

**Rule for the contract:** a state must be distinguishable without motion. Since P4-T5 requires a
**status label per state**, that is satisfied structurally — the label is text, and text survives
`0.01ms`.

---

## 5. Keyboard navigation and focus — the rule exists; the contract has to meet it halfway

`responsive.css:73-85` gives `:focus-visible` a `3px solid var(--color-primary-light)` outline at
`2px` offset, applied to the bare pseudo-class and again to `a`, `button`, `input`, `select` and
`textarea`. `global.css:387-401` ships a `.skip-nav` skip link.

`--color-primary-light` (`#C20E1E`) as a focus ring is a **non-text UI boundary**, so the 3:1
bar applies. Measured, it is **6.22:1** against `--color-bg` — clear of that bar and of the
4.5:1 one as well. Measured rather than assumed, because "it looks like plenty" is how the
six failures above got into a shipped design system.

The gap a contract can close is not the outline, it is **whether every declared action is
reachable at all**. A focus style cannot help an action that is only available from a hover menu
or a drag. §4.5 requires keyboard navigation to be preserved, and nothing in P4-T1's
`WorkspaceRef` said anything about it.

**Rule for the contract, shipped as a check in P4-T5:** every action declared across the bindings
for a workspace must appear in that workspace's keyboard-reachable set, and a declared action
missing from it is refused by name. This is a *declaration* check, with the same honest limit as
the journeys in P4-T4: it records a claim and makes it checkable; it does not press Tab.

---

## 6. Touch targets and the iOS zoom trap — inherited, nothing for the contract to declare

`responsive.css:55-70`, under `max-width: 991.98px`: `.btn` gets `min-height: 44px` and
`min-width: 44px`; `.form-control` and `.form-select` get `min-height: 44px` and
`font-size: 16px`, the second specifically to stop iOS zooming the viewport on focus.

Inherited by any workspace built on the system. **No contract field needed**, and inventing one
would be ceremony — the recurring mistake this phase has been catching in its own work.

---

## 7. Permission-specific views — already a contract field, and already enforced

§4.5 requires permission-specific views. P4-T1 shipped `PermissionView { roleId, visibleActions }`
on `WorkspaceRef`, with `SURFACE_ROLE_UNKNOWN` refusing a role the project does not declare, and
`intendedRoles` enforced non-empty.

**Verdict: met, in code, with refusals.** The honest limit: it records *which* role sees *which*
actions. It does not prove the running surface enforces that, which is a route-authorisation
question and lives where the route lives — and this repo's own standing lesson is that the
route-auth lint is per FILE rather than per route, so an unguarded route passes it. That belongs
to the phase that builds the routes.

---

## 8. Status labels — use the four-state family that already exists

`tokens.css:91-98` defines a **four-state status vocabulary** with text/background pairs:
`unmapped`, `matched`, `partial`, `verified`. It was built for requirement coverage, and its shape
is exactly what a workspace state needs — a state name, a text colour and a background, defined
as a *set* so they read as a scale.

A workspace state declaration should reuse this family rather than mint a fifth colour, subject to
the contrast finding in §3: `partial` and `verified` fail AA for normal text as they stand.

---

## 9. Empty, loading and error states — the design system already states the doctrine

This is the part worth the review. Three token comments in `tokens.css` independently say the
same thing, and it is the same principle Phase 4's refusal codes are built on:

- `--heat-0` is "a filled neutral rather than transparent, so a quiet day reads as a **measured
  zero** instead of a gap in the grid."
- `--activity-unknown` is "deliberately grey and NOT a darker red: an intern who has never done
  anything is a different fact from one who stopped, and a reader must not see them as the far end
  of the same ramp."
- `--track-other` is "deliberately grey — an unrecognised source must look like a **question**,
  not like one of the four."

**Absent is not zero, and unknown is not bad.** The design system encodes it in colour; Phase 4
encodes it in `open_facts`, in `unavailable` controls, and in the refusal to let an empty
allocation read as "nobody does this work". A workspace state declaration that conflated "nothing
here yet" with "nothing could be loaded" would break a rule the tokens already keep.

**Rule for the contract, shipped as checks in P4-T5:** a workspace declares an **empty**, a
**loading** and an **error** state, each with a non-blank human label, and each is refused
individually. All three are required unconditionally rather than only where the process graph
shows a failure path — any surface can fail to load, and deriving "has a failure path" from the
transitions would be a cleverness that silently exempts the surfaces nobody modelled carefully.

---

## 10. Verdict per §4.5 requirement

| §4.5 requirement | checked against | verdict |
|---|---|---|
| Default light theme, dark only if tokens support it | zero `prefers-color-scheme` / `data-theme` in `frontend/src/styles/` | **light only** — the dark condition is measurably unmet |
| Contrast | measured ratios over `tokens.css` hex values, with a positive control | **6 pairs below AA for normal text**; allow-list check shipped in P4-T5 |
| Reduced motion | `responsive.css:88-97`, `global.css:674`/`:759` | inherited; state must be readable without motion, satisfied by the required status label |
| Keyboard navigation | `responsive.css:73-85` focus ring, `global.css:387` skip link | outline inherited; **reachability of each declared action** now a refusal in P4-T5 |
| Clear status labels | `tokens.css:91-98` four-state family | reuse it; two of its four pairs need the §3 constraint |
| Permission-specific views | `PermissionView` + `SURFACE_ROLE_UNKNOWN` (P4-T1) | **met in code**, with the route-enforcement limit stated |
| Empty / loading / error states | `--heat-0`, `--activity-unknown`, `--track-other` doctrine | **three refusals shipped in P4-T5**, all three states required |
| No decorative effects obscuring decisions | `/baseline-ui` component patterns | nothing in Phase 4 declares an effect; there is no surface to decorate yet |
| Responsive behaviour preserved | `responsive.css` breakpoints, 44px targets | inherited; **real behaviour needs a rendered surface — Phase 5** |
| Screenshots | — | **deferred to Phase 5**, in the register, per §4.5's own "a screenshot alone does not establish usability" |

**Items 1-9 of this table are statements about files that exist and were read. The last two are
deferrals with a named owner.** Nothing here is a verdict on a screen, because there is no screen.
