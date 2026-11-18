# CC-20261118: page titles about 20% smaller (W25)

Ali, 2026-11-17: "Make the hero text about 20% smaller across all pages."

## Change

- The shared page-title scale (W18) goes from `clamp(46px, 7vw, 96px)` to `clamp(37px, 5.6vw, 77px)`. That is 96 -> 77px on desktop and 46 -> 37px on a phone.
- It changes in two places:
  - the shared rule in `fidelityV5.css`, which covers home, services, train/build/guide, how it works, platform, pricing, book, demo pilot, proof, stories and privacy;
  - `.ghero h1` on /government.
- The test `heroTitleScale.test.ts` pins the new scale.

## Verification

- **Local build in Edge:** all 13 React pages measure 77px at 1440 and 37px at 390, and /government matches. No sideways scroll, no page errors.
- **Tests:** the publicV2 suites (components and pages) pass, 856 of 856.
- **Build:** `CI=true npm run build` exits 0.

## Follow-up, same night

Ali: "That's too small. Make it in between now and what it was before."

- New scale: `clamp(41px, 6.3vw, 86px)`, the midpoint of 96 and 77px on desktop and of 46 and 37px on a phone.
- Applied in the same two places: `fidelityV5.css` and the `/government` `.ghero h1` rule.
