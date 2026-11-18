# CC-20261118: /proof filter redesign (W26)

Ali, 2026-11-18, with two screenshots of `/proof?department=marketing`:

> "On the case study page, the numbers don't move with the filters. Also when filters are selected, they should show that. All the filters should be filtered by that selection as well. Right now it is showing everything and the filter is over a page. We need a better filter system. We need to combine the two and just have 1 and more space along with filters... Also the hero doesn't look like the others which has blue in it. Make it to where they don't have to scroll so far down to get to the case studies."

Basecamp: W26, todo 10524320378.

## Change

- **The numbers follow the filters (server).**
  - `GET /api/public/case-studies` now also returns `matchLedger`, the four figures for everything the query matches across all pages, search included.
  - `ledger` stays the whole library, because it is what tells "no match" apart from "empty library".
- **The filters narrow to the selection (server).**
  - The same response returns `facets`: the counts for the current query.
  - Each group is counted over the records that match every other group. That is the standard faceted-search rule, and it keeps a second department addable while choosing Sales narrows Industry, Capability and Stack.
  - The code is in `caseStudyContextualFacets.ts` and reuses the one filter engine.
- **One filter system (page).**
  - The word cloud is gone. One filter column remains, in this order: Department, Industry, Capability, Stack, Program, Built by, Verification.
  - Options that the current selection cannot reach are hidden. A selected option always shows.
  - Each group shows 6 options, then a "Show all N" button. The column is sticky and scrolls within itself.
- **The selection is shown.**
  - "Filtered by" chips appear above the results. Each chip removes its one value, and there is a "Clear all filters" button.
  - The hero says "These figures follow your filters." while a filter is on.
  - While a new filter loads, the previous cards stay on screen, dimmed, so the page does not jump.
- **The hero matches the other pages.** It uses the white `.cbv2-prhero5` hero with a Home / Proof crumb, and "and who built it." is in blue. On a phone the figures sit 2 by 2.
- **Less scrolling.**
  - The evidence-standard band moved below the cards.
  - The results section starts close under the hero.
  - First card on the local build: 865px from the top at 1440 (live before: 3,240px) and 1,440px at 390 (live before: 8,969px).

## Verification

- **Front-end tests:** publicV2, caseStudy and services, 1,305 of 1,305 pass, including the new `StoriesV2.narrowing.test.tsx`.
- **Server tests:** the case-study filter, department and public-route suites pass, along with the new `caseStudyContextualFacets.test.ts`. The server typecheck shows no errors in the touched files.
- **Build:** `CI=true npm run build` passes.
- **Local build in Edge (1440 and 390):**
  - white hero, crumb, blue clause;
  - chips present on `?department=sales`;
  - no word cloud;
  - no sideways scroll and no page errors.
- **Narrowed counts and moving figures:** these need the new server, so they will be checked on the live site after deploy.
