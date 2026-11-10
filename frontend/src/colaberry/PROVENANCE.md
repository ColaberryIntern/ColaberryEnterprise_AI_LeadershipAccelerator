# Provenance: `frontend/src/colaberry/`

This directory is a **vendored copy of the Colaberry design system**. It is not first-party
code, and it is also **the copy the product actually paints from**: `frontend/src/index.tsx:25`
imports `./colaberry/styles.css`, and `frontend/src/styles/brand-bridge.css` re-points 21
`:root` custom properties at the token files in here. A change in this directory changes what
every page renders.

This file exists because its absence blocked a sign-off. On 9 November 2026, reviewing
Mihret Netsereab's R0 design-token drift audit definition, Aleem asked who owns the platform's
local edits to the vendored design-system copy, and named it as the last item he needed
answered before he could record his sign-off. Nothing in the repository could answer him:
there was no README here, no `CODEOWNERS` entry covering this path, and no clause in any of
the seven `CLAUDE.md` files. The commit history said only that every edit had been made by a
shared bot account.

## Ownership

**Aleem (Mohammed Abdul Aleem) owns the designs across all Colaberry brands.** The per-brand
sources of truth are his own repositories, one per brand. Ruling by Ali Muwwakkil, 10 November
2026, answering Aleem's question directly.

The five brand systems and where they land, from the registry in
`backend/src/scripts/lib/designSystemSync.js`:

| Brand | Upstream repository (`github.com/aleemcolaberry`) | Vendored to |
|---|---|---|
| AI Flotation | `AI-Flotation-Design-System` | `apps/ai-flotation-public/src/assets/design` |
| Career Pathways Network | `Career-Pathways-Network-Design-System` | `apps/cpn-public/src/assets/design` |
| Refactored.ai | `Refactored.ai-Design-System` | `apps/refactored-public/src/assets/design` |
| Colaberry Enterprise | `Colaberry-Enterprise-Design-System` | `apps/colaberry-enterprise-design/src/assets/design` |
| Colaberry Training | `Colaberry-Training-Design-System` | no target: `training.colaberry.com` is not served from this repository |

Those five are kept honest automatically by `.github/workflows/design-system-sync.yml`, which
opens a PR rather than committing, and are covered by an existing written rule in
`backend/src/services/agentDomain/capabilities/product_experience.json`: *"Third-party or
vendored CSS under apps/\*/src/assets/design is owned upstream (design-system-sync.yml) and
must not be rewritten here."*

**This directory is not one of those five, and has no sync.** Its recorded upstream is
`github.com/colaberry/colaberry-design-system` (MIT, Copyright 2026 Colaberry, Inc.), per the
`package.json` and `LICENSE` in the pristine copy committed at
`frontend/public/knowledge/design/`. How that repository relates to the five per-brand ones is
not recorded anywhere in this repository; the design ownership above is settled, the repository
lineage is not. Do not infer one from the other.

### A `CODEOWNERS` entry is not currently possible

`.github/CODEOWNERS` assigns paths to team handles (`@workstream-marketing`,
`@workstream-admin`, `@workstream-portal`) and names no design path at all. Adding
`@aleemcolaberry` would be **silently inert**: checked on 10 November 2026, that account is not
a collaborator on this repository, and GitHub ignores a code owner without write access without
reporting anything. Granting him access is a decision for the DRI, not a drive-by change, so
the ownership statement lives here instead, where it works regardless.

## How this copy got here

It is the install procedure the design system itself prescribes, at
`frontend/public/knowledge/design/IMPLEMENTATION.md:34`:

```
cp -r styles.css tokens assets components/core  your-project/src/colaberry/
```

Imported as 92 files in `03e3c22e`, 25 June 2026, by `amuwwakkil25`. The system's own README
describes the division of labour this is meant to serve: *"A designer owns the source of truth
(brand, logo, voice); a developer imports one stylesheet and a component bundle."*

Nothing in the upstream system says whether the result of that `cp -r` is yours to modify, and
no "generated, do not edit" marker was ever added here. That silence is what produced the
situation below.

## The local edits, all four of them

Every edit to this directory since the import was committed by `ColaberryIntern`, a shared bot
account, each co-authored by Claude and traceable only to a `CC-<date>-<id>` session ID. **No
human-named account has touched a vendored design file here since June 2026.** They are listed
in full because an unlisted divergence is indistinguishable from drift, which is exactly what
the R0 audit is for.

| Commit | Date | File | What it did |
|---|---|---|---|
| `55d89de5` | 2026-08-12 | `tokens/colors.css` | **Added** `--status-violet` and `--status-teal` plus their `-bg` pairs, as semantic status roles that do not exist upstream. Both are sourced from the existing theme-aware `--chart-5` / `--chart-6` tokens rather than new hex values. |
| `6da36b03` | 2026-08-13 | `tokens/fonts.css` | **Deleted** `@import url('https://fonts.googleapis.com/css2?family=Roboto...')`. It fetched Roboto, Roboto Mono and Quicksand from `fonts.googleapis.com` on every page before any consent was given. Removing the `<link>` from `index.html` was not enough on its own; this import kept the request alive. |
| `b53dba81` | 2026-08-19 | `tokens/fonts.css` | **Deleted** the jsDelivr RemixIcon `@import`, for load performance. |
| `a61cb00a` | 2026-10-05 | `tokens/spacing.css` | **Added** one z-index stop, `--z-player: 110`, between `--z-sticky` and `--z-overlay`. |

Three of the four are platform decisions with a stated reason. The fourth is housekeeping. None
of them changes a brand colour, a type scale or a spacing ramp, so none is a design change.

### Two of them have never been offered upstream

The pristine copy at `frontend/public/knowledge/design/tokens/fonts.css` still carries both
`@import` statements. So **the upstream system still has the privacy defect that was fixed here
three months ago**, and the fix exists only in this fork. That is the concrete cost of an
unowned divergence, and it is the one item on this page that is worth acting on rather than
merely recording.

## What this means for the R0 audit scope

Aleem's review excluded "the vendored folder" from the audit. On the evidence, that excludes
the wrong thing:

- `apps/*/src/assets/design` has an upstream owner, an automated sync, a written exclusion rule
  and, for the Colaberry Enterprise copy, **zero content edits** since it was vendored.
- **This** directory has four local edits, no sync, and is what the product renders. The same
  capability record puts it explicitly *in* scope at `product_experience.json:56`, which traces
  the cascade through `brand-bridge.css` into these token files and states that *"the resolved
  value is what the audit compares against."*

The useful rule, therefore: **files that match upstream are his and are not drift; the four
edits above are the drift, and they are the only part of this directory that needs his review.**

## Related

- `frontend/src/styles/__tests__/tokenCascade.test.ts` pins the import order and the rendered
  value of all 21 contested properties, so a reorder or a re-point fails the build.
- `docs/sessions/SESSION_CC-20261109-h4m8-token-cascade.md` records the measurement:
  `brand-bridge.css` loads after `global.css` and redefines 21 `:root` properties, 19 of which
  render a value `frontend/src/styles/tokens.css` does not state.
- `.claude/skills/baseline-ui/SKILL.md` is the reference every session reads before building a
  page. Its colour table has now been wrong twice.
