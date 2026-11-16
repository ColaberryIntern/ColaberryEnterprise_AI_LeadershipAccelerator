# CC-20261116-v5r1 — /platform and /pricing heroes, broken on production

## What was broken

Since the home-hero rebuild deployed on 2026-11-16 (#4097, commit `c383258db`),
the `/platform` and `/pricing` heroes showed every visitor a diagram drawn as
**solid black boxes, wires and dots**, over text that had lost its styling
(no gap under the headline, browser-default bullet discs).

Cause: the rebuild rewrote `heroV8.css` from 573 lines to 336 and deleted the
diagram CSS as dead. It was not dead. `HeroPlatformV8` and `HeroPricingV8`
share the `.cbv2-h8` shell through the `--svc` variant and still rendered the
diagram and the text parts that CSS styled. 29 classes the two heroes render
had no rule left.

The production verifier passed: it counts bands, and each hero is still one
band with one h1. Same blind spot as the one #4097 itself was written about.

Found by reading the page as a picture while building the before/after delta
review for Ali, not by any check.

## What changed

- **Diagram removed from both heroes**, not restyled. It is in neither design
  file Ali supplied (`colaberry-enterprise-site.html`, `colaberry-enterprise-v4.html`).
  Its geometry constants and the `SHOWROOM_SURFACES` import went with it.
- **The text parts restyled on the light ground**: a `.cbv2-h8--svc` block in
  `heroV8.css`: one column, headline second line in the accent, deck, three
  pill chips, body, proof row. Every rule is scoped under `.cbv2-h8--svc` so it
  cannot reach the home hero.
- Ali approved the fix on 2026-11-16 ("yes fix those").

## Guards

New `HeroSvcV8.test.tsx`, run for both heroes:

| Guard | What it would have caught |
|---|---|
| renders no hero class the stylesheet does not style | **this regression** — CSS deleted under a component still using it |
| ships no diagram | the diagram returning |
| built from its parts (eyebrow, h1, deck, 3 chips, body, 2 buttons, proof) | a part dropped |
| every --svc rule is scoped | the fix leaking into the home hero |

**Inverted, not deleted:** `PlatformV2.test.tsx` "renders a tab for every
surface whose capability is live". The tabs were removed on 2026-08-20; it
stayed green only because the diagram carried the surface labels as SVG
`<title>` tooltips. The v5 model names none of those surfaces. It now asserts
the opposite: no surface depicted as a diagram node, tooltip or tab (on markup,
because "Free company workspace" is also the offer's name in running copy).

### Mutation-tested

| Mutation | Caught by |
|---|---|
| the `--svc` chip rules deleted | unstyled-class guard (both heroes) |
| an `<svg>` put back in the platform hero | no-diagram guard |
| an unscoped `.cbv2-h8__deck` rule appended | scope guard |
| a status chip removed from /pricing | parts guard |
| a diagram node with a surface `<title>` put back | inverted PlatformV2 guard |
| a surface label put back as a `role="tab"` | inverted PlatformV2 guard |

Every file's md5 confirmed back to its starting value after each mutation.

## Verification

- `tsc --noEmit` clean, with a planted control error confirmed to be caught.
- Full frontend suite: 9,816 pass. One failure, `publicNextOpenHouseJs`, fails
  identically on an untouched tree locally (CRLF in a comment-stripping test on
  Windows) and passes in CI on `main`.
- `npm run build:frontend` succeeds.
- **Looked at, not only measured:** both heroes captured from the local build
  at 1440px and 390px: no diagram, chips styled, accent line, 0 overflow, 0
  page errors.

## Not in this change

The full rebuild of `/platform` to the v5 model (dark hero, product
screenshot) is its own page in the delta review. `/pricing` beyond its hero
waits on Ali's prices decision. The `to="/contact"` link in the pricing hero is
ticket W6, which is gated on that same decision.
