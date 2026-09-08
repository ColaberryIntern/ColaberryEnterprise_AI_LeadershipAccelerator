# Outreach Journey Flow — component renders (2026-09-07)

Session `CC-20260907-b3f7`. Branch `feat/campaign-outreach-journey-sankey`.

## What these images are

Real output from the real component. `OutreachJourneyFlow` was mounted, recharts ran
its actual Sankey layout, and the resulting DOM was dressed in the app's own
stylesheets and photographed in headless Chromium.

| File | Viewport | Theme | Plot width |
|---|---|---|---|
| `desktop-1440-light.png` | 1440 | light | 1340 |
| `desktop-1440-dark.png` | 1440 | dark | 1340 |
| `tablet-900-light.png` | 900 | light | 810 container, 1180 plot (scrolls) |

Regenerate:

```bash
cd frontend
HARNESS_OUT=<dir>/dump-desktop-light.html HARNESS_W=1340 HARNESS_THEME=light \
  CI=true npx react-scripts test --testPathPattern="renderHarness.dump" --watchAll=false
cd ..
node scripts/captureJourneyHarness.js <dir>/dump-desktop-light.html <dir>/desktop-1440-light.png light 1440
```

## What these images are NOT

**They are not production proof.** No admin session was involved and the payload is a
fixture shaped after the production funnel (24,676 leads, anonymous-dominant, heavy
ignore rate), not production data. They demonstrate that the component *lays out*
correctly at a given width and theme. They say nothing about whether the live
endpoint returns what this component expects.

An authenticated capture of `/admin/campaigns` showing THIS component is not
possible yet for a simple reason: the branch is not deployed, so production still
serves the force graph. That capture belongs after a deploy.

**What was verified against production instead** (2026-09-08, super_admin token):

- The live contract. `GET /api/admin/campaign-intelligence/graph` returned 35 nodes,
  91 edges, 24,679 leads. Every node type it emits maps to a real stage; no unknown
  types. See `__tests__/liveContract.dump.test.ts`.
- The component against live DATA. The real payload was rendered through the real
  component, which is how four defects were found that no synthetic fixture had
  triggered — see the session log for `CC-20260907-b3f7`.
- The brand question. 44 campaigns: 36 on one brand, 8 with none; all 16 campaigns
  that appear in the graph share that single brand. The selector will offer one
  option until campaigns exist under another brand, and the backend says so.

The production-derived render is deliberately NOT committed here — production data
does not belong in the repo. Regenerate it with `HARNESS_PAYLOAD` pointed at a fresh
capture.

**Two further limits, stated rather than glossed:**

1. **The dark image verifies the chart palette, not the page chrome.** Theme is
   chosen in JS and baked into the SVG's fills, so the dark render genuinely
   exercises the dark ramp — the bands and nodes are the dark palette. The
   surrounding card still renders light because the app's dark surface tokens are
   not among the stylesheets this harness inlines.
2. **`Never Visited` and `Re-Engagement Sweep` appear in the final column.** They
   are Response- and Journey-stage nodes, but d3-sankey places any node with no
   outgoing link in the last column. Both are terminal states, so the placement is
   truthful; their stage is still carried by their colour, their label and the
   table.

## Status: shipped

This work is live in production as of 2026-09-08 (PRs #2273, #2289, #2303). These
images remain component renders against a synthetic fixture — they are not, and were
never, production proof. The production verification that does exist is recorded in
`docs/sessions/CC-20260907-b3f7.md`: the compiled artifact was read inside the
running container after each deploy.

## What was fixed because of these renders

Three defects that every unit assertion had passed over:

1. Campaign labels flipped inward and collided with the first-touch column.
2. The outcome column was crushed to sub-pixel bands — `Paid` (59) was unclickable.
3. `flipX` was missing from `renderNode`'s dependency array, so after the container
   was measured the chart re-laid-out at the real width while label sides were still
   computed from the fallback width.
