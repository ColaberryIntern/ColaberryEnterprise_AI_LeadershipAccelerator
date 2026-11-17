# CC-20261116-v5r1: Home rebuilt to the model, and the shared layer every page uses

Ticket: W12, https://app.basecamp.com/3945211/buckets/47502609/todos/10516155705
Approved by Ali on 2026-11-16, after the fidelity audit: "approved - proceed with the changes".

## What Ali asked

> "They are better but missing too many differences. For example, there is no border at all and it
> doesn't look professional. You need to find at least 50 things on each page to check to make sure
> they are matching so we don't have this problem again."

He attached a screenshot of the home page's Build / Guide / Train cards. The text ran flush to each
card's edge, and the wordmark sat beside its label instead of under it.

## The audit

`handoff-enterprise-site-v5/review/audit.js` (outside the repo, with the model file) pairs every part
of a model page with its live counterpart. A part is a section, title, label, paragraph, card,
button, list item, header or footer. Pairing uses text plus relative position, best match first.
For each pair it compares computed style: border, radius, padding, content inset from the card edge,
background, shadow, typeface, size, weight, colour, tracking, line height, bullets, and whether the
part is there at all. Cards are found two ways: as the grid cell around a heading, and as any styled
box. The model titles its service cards with a 64px `div`, so a heading-only finder missed them.

It ran 181 to 1,223 checks per page, 4,684 across ten pages. Every page matched 60 to 81% of what
the model specifies.

## Root causes (measured, not guessed)

1. **Tokens used but never defined.** The spacing ramp goes 6, 8, 10, 12. `--space-7` was used in 12
   public stylesheets; `--space-9`, `--space-14`, `--text-secondary`, `--text-sm/md/xs` and
   `--surface-warn-subtle` were missing too. A `var()` naming an undefined token with no fallback is
   invalid at computed-value time, and the property becomes `unset`. For padding that means 0, so
   every card padded with `--space-7` had no padding. That is the screenshot.
2. **Shared styles in a page-only chunk.** The service cards were styled from `pricingV2.css`, which
   loads only with /pricing. On a visit that landed on Home they rendered almost unstyled, and after
   a visit to /pricing they did not.
3. **Class collisions across chunks.** `.cbv2-split` is a bordered, clipped box in `platformV2.css`,
   and `.cbv2-svc` is the Services page's row layout. Both would restyle Home once those pages had
   loaded. The new cards are `cbv2-svc5`; the platform band uses `cbv2-split5`.
4. **Under-scaled type.** Section titles were 36px against the model's 60px; spacing between sections
   was 96px against 128px.

## What changed

- `components/publicV2/fidelityV5.css`: the model's shared layer, loaded by `PublicLayoutV2` on every
  public page. Every rule is scoped under `.cbv2-shell`, so it outranks single-class page rules
  whichever chunk loads last. It contains:
  - the missing spacing tokens;
  - section spacing, title scale and the accent phrase;
  - labels, scoped to section openers so in-card tags keep their own look;
  - lede ink;
  - buttons, setting border width and style only, so each variant keeps its border colour;
  - service cards, step cards, the book band, platform band, proof cards and the closing band;
  - hero and rollout-board details;
  - the footer: five groups, since Ali kept "Who it is for".
- `ServiceCardsV5.tsx` (S4) and `ClosingCtaV5.tsx` (S5) are shared components. Home uses them now;
  the other pages adopt them in their own PRs.
- Home markup: accent phrases, model links with arrows, the book band (lessons, author, About the
  book), the platform band's three icon rows, compact proof cards, and the closing band. The stats
  row is removed (H6; `Accolades` is unrouted, not deleted). The hero verb titles are now `h3` under
  the `h1`.
- `servicesV2.css`, `storyLowerV2.css`: the never-applied `font-size: var(--text-sm|md|xs)`
  declarations became `font-size: inherit`, which is exactly what they resolved to. Two other
  approaches were measured and rejected:
  - Giving those tokens values shrank text on three pages (Demo pilot 17 to 14px).
  - Deleting the lines let other rules grow headings on four pages (19 to 28px).
- `frontendCopyBaseline.ts`: HomeV2 drops from 2 to 0 occurrences of "free" (the closing band
  replaced "Start free..." and "Open the Free Company Workspace"). The entry is deleted and the total
  is 257.

## Guard

`components/publicV2/__tests__/publicCssTokens.test.ts`:
- No public stylesheet reads an undefined token without a fallback.
- The shared layer is imported by the layout.
- Shared-component classes live only in that layer.

It caught the `.cbv2-svc` collision on its first run. Mutation-checked: deleting `--space-7` fails
it, and dropping the layout import fails it. Files were restored by md5.

## Measured result (local production build, same audit)

| Page | Production | This branch |
|---|---|---|
| Home | 1,127 / 1,569 (72%) | 1,789 / 1,799 (99.4%) |
| Services | 447 / 645 | 479 / 645 |
| Build | 462 / 684 | 489 / 684 |
| Guide | 454 / 669 | 475 / 669 |
| Train | 319 / 491 | 336 / 491 |
| How it works | 588 / 792 | 663 / 792 |
| Platform | 319 / 480 | 370 / 504 |
| Pricing | 204 / 294 | 230 / 294 |
| The book | 267 / 356 | 286 / 356 |
| Demo pilot | 198 / 238 | 210 / 238 |

**Regressions** (a check passing on production and failing here): one. A primary button on /pricing
now carries the model's standard primary shadow, where the model's pricing button has none. Left for
the /pricing rebuild (W4). A second flagged item was a pairing swap between two similar model list
items, not a change on the page.

**Home's remaining ten misses are deliberate:**
- The book subtitle and two proof cards keep claims-registry wording. The model's "Why 95% of AI
  pilots fail" in our own voice is `research.book95`, which is blocked.
- There is no "$0 to start" tag while pricing (W4) is open.
- The board keeps "Sample data" rather than "Illustrative example" (H1 note).
- The card copy is unchanged (`SERVICE_SHAPES`, shared with /services and /pricing).
- Two are pairing artifacts.

Read as images at 1440 and 390: every band. 0 horizontal overflow and 0 page errors at both widths.

## Flagged, not changed

- The closing band's second button reads "Start training", not the model's "Start training free",
  because of the no-"free" rule and the copy ratchet.
- The platform picture is byte-identical to the model's (`shot-hero-dashboard.png`, 356,196 bytes).
  It was captured in the old red and shows "free" inside the image. A fresh capture in blue is a
  follow-up.

## Verification run

- Frontend suite: 10,096 passed. One failure, `publicNextOpenHouseJs`, is Windows-only (line
  endings) and passes on main CI; its files are untouched here.
- `tsc` was checked with a planted control error first.
- `CI=true` build: compiled with no warnings.
- Copy lint: 14/14.
- Test-file typecheck: no file in this change is listed. Its 12 listed failures are backend modules
  not installed in this worktree.
