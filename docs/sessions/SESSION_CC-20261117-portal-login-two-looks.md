# CC-20261117: the portal sign-in gets the enterprise look, and keeps the training look

Ticket: W17, Basecamp list 10515008393 (bucket 47502609).

Asked by Ali on 2026-11-17, with a screenshot of enterprise.colaberry.ai/portal/login: "login page
for enterprise needs to be updated. Make sure it doesn't conflict with the training site."

## The conflict

There is one sign-in page, and two sites send people to it:
- the enterprise site's "Log in";
- training.colaberry.com's "Log In" button (colaberry-training-migration,
  `src/components/training-site/SiteHeader.tsx`, `LOGIN_URL`).

Rebranding the page outright would put every training student on an Enterprise page. Ali chose
"Two looks, one page".

## What changed

- `loginBrand.ts` decides which look a visitor gets:
  - training if the URL has `?brand=training`, or if the visitor came from
    training.colaberry.com (referrer);
  - enterprise otherwise.
  - The look is fixed for the page's lifetime.
- **Enterprise look:** a token theme (`portalLoginEnterpriseStyles.ts`) over Aleem's 5 November
  layout, scoped to `.cbpl-root[data-brand="enterprise"]`.
  - Blue #2E6A86 and #245670, the enterprise lockup (blue mark, "Colaberry", ENTERPRISE tag) and
    Space Grotesk headings.
  - "Back to enterprise.colaberry.ai"; the footer reads "Colaberry Enterprise"; Privacy goes to
    the enterprise page.
  - Errors stay red.
- **Training look:** Aleem's page unchanged, except that the header no longer says "Enterprise AI
  Leadership Accelerator". It shows the red-and-green wordmark alone, as the training site
  does, and links back to training.colaberry.com.
- The sign-in itself is identical: same field, endpoint, `next` handling and errors.
- On a phone the back link reads just "Back". Beside the enterprise lockup the full sentence made
  the page 448px wide at 390.
- A companion training-site PR adds `?brand=training` to its Log In link. Until it merges, the
  referrer check covers training visitors.

## Verification

- `portalLoginBrand.test.tsx`, 10 tests, which check:
  - the brand rules, including a lookalike host;
  - that each look carries nothing of the other's;
  - that the sign-in is the same in both;
  - that every enterprise rule is scoped.
  - Mutation-checked: loading the enterprise theme for everyone fails the two training tests.
- Portal, route, campus and portal-component suites: 4,276 passed. The `testEnv/` helpers
  are excluded, as CI does.
- tsc: checked with a planted control error.
- `CI=true` build: compiles cleanly.
- Edge, at 1440 and 390, for enterprise, training by link and training by referrer:
  - colors, font and lockup are as intended;
  - errors are red in both;
  - the "check your inbox" screen works, with the request intercepted;
  - the page fits the screen at both widths, with no page errors.
