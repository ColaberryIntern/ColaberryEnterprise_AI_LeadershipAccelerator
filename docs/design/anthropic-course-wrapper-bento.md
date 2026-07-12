# AnthropicCourseWrapper — Bento redesign (approved design spec)

**Status:** Design approved by Aleem (Senior UI/UX Designer) on 2026-06-25.
**Awaiting:** Kes/Ali decision on implementation scope + bringing the Colaberry Design System into the portal (see *Open decision* below).
**Visual reference:** [`anthropic-course-wrapper-bento.html`](./anthropic-course-wrapper-bento.html) — self-contained, opens in light + dark, shows the 3 / 2 / 1-course states. Built on the official **Colaberry Design System** (`aleemcolaberry/colaberry-design-system`).

---

## Why this changed

The first pass (PR #82 as committed) restyled the existing single card onto the portal's current navy/Bootstrap tokens. Design review rejected that on two grounds:

1. **Wrong design system.** The task is "apply the *Colaberry* Design System" — the official brand system (cherry `#FB2832` / leaf `#77BB4A` / berry `#367895`, Roboto + Roboto Mono, pill components, `--radius-xl` cards), not the portal's interim navy palette.
2. **Broken information architecture.** The old card led with three competing source badges (Anthropic / Skilljar / Course N) *above* the title, so metadata outranked content, and duration was orphaned in the footer.

## What the redesign does

### Information architecture (the core fix)
Content now leads; source is demoted to a quiet kicker; metadata is grouped:

- **Identity zone** — a berry-blue icon tile + an `ANTHROPIC · SKILLJAR` overline (one quiet attribution line instead of three loud badges).
- **Title** is the dominant element.
- **Description** clamped to a fixed number of lines for even card heights.
- **Grouped meta row** — `Course N` + duration (mono numerals), no longer split across the card.
- **One isolated pill CTA.**

### Layout — Bento (chosen over a uniform grid)
A deliberate hierarchy rather than sameness:

- **Featured tile** — the entry point ("Start here", lowest course number), larger, with description + full CTA.
- **Compact tiles** — supporting courses, metadata folded into the overline to stay tight, launch pinned to the bottom.
- **Cherry path anchor** — a full-width summary tile (`3 courses · 2h 30m`, mono figures) that gives the section a single brand moment.

**Responsive fallbacks** (so it never collapses awkwardly):
- **3+ courses:** full bento (featured + compacts + anchor).
- **2 courses:** featured + one compact + anchor.
- **1 course:** featured tile only, no anchor (no path to summarize).
- Under 760px everything stacks to a single column.

### Colaberry DS usage
- **Tokens only**, no raw hex: colors via semantic aliases (`--surface-card`, `--text-strong`, `--text-muted`, `--red-500/600`, `--blue-500`), type via `--fs-*` (Roboto / Roboto Mono numerals), shape via `--radius-xl` / `--radius-pill`, motion via `--ease-out`.
- **Components:** `Card` (`--hoverable`, `--accent`), `Badge` (`neutral` meta, `solid` "Start here"), `Button` (`primary` CTA, `ghost` compact, white-on-cherry anchor CTA), `.cb-i` + RemixIcon.
- **Color logic:** cherry reserved for emphasis (top accent, "Start here", featured CTA, path anchor); berry-blue carries the learning icon tiles; everything else neutral. *Warm, not loud.*

## Accessibility (WCAG 2.1 AA — all pass, light + dark)

| Element | Foreground | Background | Ratio | AA |
|---|---|---|---|---|
| Course title | `text-strong` | card | 16.9:1 | ✅ AAA |
| Description / meta / overline | `text-muted` | card | 5.4:1 | ✅ |
| Primary CTA / "Start here" / anchor text | #FFF | **red-600** (#E5121D) | 4.7:1 | ✅ |
| Anchor CTA | red-700 | white pill | 6.2:1 | ✅ |
| Dark-mode body text | neutral-400 | card #212120 | 7.8:1 | ✅ |

**Contrast fix applied:** white text on brand cherry `--red-500` computes to **3.8:1** (fails AA 4.5 for normal text). All text-bearing cherry surfaces moved to **`--red-600`** (4.7:1); `--red-500` retained only for the non-text accent border (graphical, needs 3:1).

> **DS-level finding for the design-system owner:** the default `--action-bg` primary button (red-500) puts white at 3.8:1 — fails AA for its 16px-bold label. Recommend the system bump `--action-bg` to red-600, or document red-500 buttons as large-text-only.

**Dark mode** was hardened beyond the raw token inversion: card surface lifted (`#212120`) off the page so cards read; elevation via border + brightness (soft neutral shadows are invisible on dark); cherry elements get an intentional red glow; neutral chips and berry tiles brightened.

**Heuristics:** content-leads minimalism, recognition over recall (cards self-describe), consistent DS components, visible focus rings, new-tab CTAs carry `aria-label` "opens in new tab" + an external-link icon. Residual: compact ghost CTA is 38px (DS `sm`) vs the DS's 44px touch goal — enlarge on touch; define the "Start the path" destination.

---

## Open decision for Kes / Ali

Bento is **not** a card restyle — it changes the work from "restyle the existing single card" (Kes's stated scope) into:

1. a **new container/group component** (`AnthropicCoursesBento`) that takes the course list and arranges featured + compact + anchor (and computes the summary),
2. a change to **`PortalSessionDetailPage`** (hand the group the whole Skilljar list instead of mapping one card each),
3. **bringing the Colaberry Design System (tokens / Roboto / RemixIcon) into the portal**, scoped to this section — which means this Materials section will look intentionally distinct from the rest of the navy/Bootstrap portal.

Points 2–3 are DRI-level (Ali) calls. **Recommendation:** keep PR #82's interim on-palette restyle mergeable for today's deadline if needed, and greenlight the bento as a follow-up once the DS-in-portal direction is approved. On approval, the React port follows this spec exactly.
