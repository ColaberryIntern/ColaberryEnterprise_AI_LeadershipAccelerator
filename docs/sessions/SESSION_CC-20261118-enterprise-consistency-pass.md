# CC-20261118: enterprise site consistency pass (W18-W22, W10), one loop-architect run

Asked by Ali, 2026-11-17 ~8:19 PM CT, with screenshots of home, /services, /how-it-works and /try:

> "The titles are different sizes. We need more consistency. This black on the home page the banner
> should go all the way across like Trust before intelligence. All of the small titles on each page
> have duplicate titles. We need to label our dept. ... Create a free account should be in enterprise
> branding and business accounts should start in the old format mode and not use the campus. Get all
> these tickets ready and use the loop architect to go through one by one. 1 pr and one deployment."

Basecamp list 10515008393 (bucket 47502609): W18 10521017011, W19 10521017026, W20 10521017036,
W21 10521017050, W22 10521017062, W10 10515519732 (existing, approved 2026-11-16).

Loop-architect run `.loop-architect/runs/20261118-enterprise-consistency-pass/` (gitignored). Plan
audit cycle 1: 18/20 PASS.

## What changed, by ticket

| Ticket | Change | Main evidence |
|---|---|---|
| W18 one title size | One rule at the end of fidelityV5.css gives every page hero h1 the home scale `clamp(46px, 7vw, 96px)`. Proof, Stories and Privacy opt in with `cbv2-pagehero--page`, so story detail titles keep their size. | Live before: 31-170px. Local build: all 13 pages 96px at 1440 and 46px at 390. `heroTitleScale.test.ts`, mutation-checked. |
| W19 duplicate labels | Removed the small label repeating the breadcrumb on Services, How it works, Platform, Pricing, Demo pilot and Book. | Browser: one small line above each title. `heroSingleLabel.test.ts`, mutation-checked. |
| W20 full-bleed band | The home rollout band left the 1200px width group; its children keep 1200px. | Band 1440 wide at 1440, cards 1144. `homeBandFullBleed.test.ts`; `publicModelMeasure.test.ts` updated to the new rule. |
| W21 /try branding | /try and its create-account pop-up get a scoped Enterprise theme (blue tokens, Enterprise lockup, errors red). Every "free" is removed. | Button rgb(46,106,134); no "free" on the page or in the pop-up; same `registerOrg` payload. `managementPreviewEnterprise.test.tsx`, mutation-checked. Copy-lint baseline 256 -> 238. |
| W22 business accounts start classic | `GET /api/portal/campus/flags` adds `default_nav: 'classic'` for org managers. A failed lookup still answers 200. The portal adopts it only when the browser holds no nav choice, in the same update as `ready`, so the campus landing never fires. | `campusRoutes.test.ts` (+4), `campusBusinessDefault.test.ts`, both mutation-checked. |
| W10 department labels | `taxonomy.departments` lives in the published snapshot (no migration) and is written through the human-override path, which only accepts the six slugs. Counted `departments` facet; `?department=` filter on the API and on /proof. The header Proof menu shows real department links once one is tagged. Admin review panel has a department picker. | Backend `caseStudyDepartments.test.ts` (8) and store tests (+2); frontend `caseStudyDepartments.test.tsx` (8); both mutation-checked. Field-coverage file regenerated (218 fields, 0 unreviewed). |

## Not in this run (logged)

- **/government** keeps its small title: it is a one-screen catalog whose title sits in a toolbar. Changing it would break the layout, so it needs Ali's call.
- **W11** (tag and republish the 18 live case studies) is not part of this run. The Department filter and the menu links appear once the first study is tagged and republished.
- **"free"** still appears on the authed company page after sign-up (`CompanyPage.tsx`).
- **Ali's own account:** if it manages an org and the browser holds no nav choice, it also starts in classic. Settings switches it back.

## Quality gate

- Frontend tsc: clean, checked with a planted control error.
- `CI=true npm run build`: exit 0.
- Frontend full suite: 10,296 passed, 2 failed. Both failures (`publicNextOpenHouseJs`, `governmentHeaderParity`) also fail on clean main beef464be.
- Backend CI suite: the copy and typography lints failed on this branch and were fixed. The 25 other failing suites fail identically on clean main: this machine is missing the playwright and exceljs modules.
- Test-file typecheck: the 12 baseline failures are all missing-module errors (playwright, exceljs) in files this run did not touch.

## Independent task verification

loop-task-verifier: 8 of 8 PASS (T1 11, T2 11, T3 11, T4 11, T5 12, T6 11, T7 11, T8 11 of 12). Its fresh runs: frontend 2,648/2,648 in the touched suites, backend 200/200, frontend tsc 0 errors. Open notes:
- The browser measurements are the producer's own. They are re-checked live after the deploy (T11).
- No test renders CampusProvider. `active` is false by construction: the default is set in the same update as `ready`.
- Clearing a department tag writes `[]` into that study's next snapshot rather than omitting the key. The public behavior is the same: no department.
