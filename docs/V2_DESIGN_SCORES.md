# V2 design score — 2026-08-12

Scored against `docs/enterprise-site-v2-preview/DESIGN_RATING_SYSTEM.md`, the same
10-dimension rubric used on the prototype. Target is 9/10 per dimension.

**Note on comparability:** the prototype's last score was **63/100**, but that was a
different artifact — a static HTML file. This scores the *React implementation*.
The trend is meaningful; the numbers are not a strict continuation.

| # | Dimension | Score | Moved | Why |
|---|---|---|---|---|
| D1 | First-impression impact | **7** | ▲ | Real product capture in the hero with perspective tilt, floating "+18 pts" badge, ambient mesh, Space Grotesk headline. Composed rather than assembled. Not yet a stop-you-dead moment: the ambient gradients are too subtle on the dark ground. |
| D2 | Real product presence | **9** | ▲▲ | Seven real captures across the site — dashboard, readiness, metrics, roster + ladder, member drill-down, nav, sample banner — each framed with depth and sample-labelled. Was zero two days ago. The member drill-down in particular *proves* the evidence argument instead of asserting it. |
| D3 | Typographic craft | **7** | ▲ | Space Grotesk display against Roboto body, self-hosted, clear scale, tabular numerals on data. Body copy is still workmanlike; no pull-quotes or scale drama below the hero. |
| D4 | Colour and light | **5** | — | **The weakest dimension and the honest bottleneck.** Cherry, white and greys, sections alternating white/sunken. The photography adds the only real warmth. The accent is spent well but the palette has no second voice. |
| D5 | Motion and choreography | **8** | ▲▲ | Scroll reveals across 16 sections, hero tilt on hover, pulse badge, book cover lift. Reduced-motion fully honoured, and the reveal has a per-route safety net after the navigation bug. Calm, not decorative. |
| D6 | Information design | **8** | ▲ | Goal chooser, two-engine model, four evidence classes, registry-derived counts, the ladder, the drill-down. Scannable in 20 seconds, rewards 5 minutes. |
| D7 | Layout and composition | **7** | ▲▲ | Alternating engagement rows, split sections, photography bands breaking the rhythm, the book section as a pause. Still some card-wall: the five-service ribbon and the evidence-class grid. |
| D8 | Iconography | **8** | ▲▲▲ | A 24-glyph custom set on one 24px grid, 1.6 stroke, `currentColor`, typed as `IconName` so a wrong name is a compile error. Was literally zero SVG on every page. |
| D9 | Craft details | **8** | ▲ | Focus rings, 44px targets, tabular numerals, safe-area padding on the consent bar, contrast tokens verified, no overflow at any width tested. |
| D10 | Credibility and honesty | **10** | — | Every figure carries an evidence class; unverified claims cannot render; unbuilt surfaces say so; consent precedes tracking; the book statistic ships only as an attributed citation. This is the site's actual differentiator. |
| | **TOTAL** | **77 / 100** | **+14** | |

## Non-negotiable gates

| Gate | Status |
|---|---|
| 1. No DO-NOT-PUBLISH claim in rendered output | **PASS** — asserted by test on every page |
| 2. Every metric labelled | **PASS** — `Metric` cannot compile without an evidence class |
| 3. No console error, **no non-local network request** | **FAIL** — see below |
| 4. No horizontal overflow at 1440/1024/768/390 | **PASS** at 1440; narrower widths verified by CSS, not yet by capture |
| 5. Reduced-motion honoured | **PASS** — animations disabled, reveals never engage |
| 6. Scope respected | **PASS** — live public routes untouched |

### Gate 3 fails, and it is the same defect as the privacy finding

`public/index.html` loads Quicksand, Roboto and Roboto Mono from
`fonts.googleapis.com` on every page, firing **before** the consent banner is
answered. By this rubric that is a non-local network request; by the privacy
notice it hands the visitor's IP and user-agent to Google regardless of what they
choose. **One fix closes both**, and it belongs in the cutover because
`index.html` is shared with the live site.

## What moves the score next

1. **Colour and light (D4: 5)** — the single biggest lever, worth ~4 points on its
   own. A second accent, warmer neutrals, and light that behaves on the dark
   sections rather than a faint wash.
2. **First-impression (D1: 7)** — the hero is good and not yet arresting.
3. **Layout (D7: 7)** — break the two remaining card walls.
4. **Typography (D3: 7)** — earn the display face below the fold.

D2, D8 and D10 are at or near target. D10 at 10 is not flattery: it is the one
dimension where this site would beat the benchmark set, because the governance is
structural rather than editorial.
