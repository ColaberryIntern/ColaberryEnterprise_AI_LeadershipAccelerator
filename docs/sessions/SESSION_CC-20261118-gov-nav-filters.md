# CC-20261118: Government menu filters (W27)

Ali, 2026-11-18: "Government navigation filters don't work."

Basecamp: W27, todo 10525030641.

## Cause

- **A script race on `/government/`.**
  - The catalog script calls `gnFillGov` and `gnApplyFamily` only if they already exist, but a later script defines them.
  - The services response usually resolves before that later script runs. Edge logged `services resolved` before either function was defined.
  - Two things broke as a result. A menu link's `?family=AI` was ignored, so the page opened on All. The Government dropdown in the page's own header stayed empty (0 groups).
  - Typing the URL directly sometimes worked, because a slow response let the header script win the race.
- **Menu links to services the grid does not show.**
  - The filtered grid holds only services with a documented case study (12 of 17).
  - The other five appear under "Also in our catalog". Their menu links pointed at a family filter that does not contain them.
  - Both Consulting services are among the five, so the Consulting chip emptied the grid ("0 of 12 services").

## Change

- **`frontend/public/government/index.html`:**
  - The catalog script stores `window.gnCatalog` and `window.gnCatalogReady`.
  - When the header script loads, it fills the menu and applies `?family` from that stored state.
  - On the page, a menu click that picks a family applies it in place with `history.pushState`, and Back restores the previous filter (`popstate`).
  - A family gets a chip only when it has something the grid can show.
  - A service with no case study links to `#gv-prep`.
- **`navMenus.ts` (the React site's header):** `govServiceHref` sends a service with `caseStudies === 0` to `/government/#gv-prep`. Other services keep the family filter.

## Verification

- **Front-end tests:** publicV2 components, publicV2 pages and services, 1,190 of 1,190 pass.
  - New tests: the W27 cases in `governmentHeaderParity.test.ts` and `navMenus.test.ts`.
  - The old wiring test is updated for the new call order.
- **Typecheck:** `tsc --noEmit` is clean.
- **Edge, against the live site with the fixed page served in place of `/government/`:**
  - home page to AI, Data and Training: each lands filtered (AI 2 services, Data 4, Training 2);
  - the page's own menu has 7 groups;
  - in-page menu to IT: filtered, and Back returns to AI;
  - chips: All, AI, Data, IT, Other, Staffing, Training;
  - Proposal Development opens "Also in our catalog", where it is listed;
  - no page errors.
- **Not checked yet:** the React menu's new `#gv-prep` links are checked only by the unit test, and show on the live site after the frontend deploys.
