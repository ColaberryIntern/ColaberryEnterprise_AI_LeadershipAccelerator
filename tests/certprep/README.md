# Cert Prep end-to-end

One script, `certprep-e2e.js`, drives a real browser through a student's whole
journey and records what was **claimed**, how it was **checked**, and what was
**observed**. A check that cannot run is reported as *not run* rather than
passing quietly — "not run" and "passed" must never look alike.

## Running it

The fixtures come from inside the backend container, because the tokens are
signed with the app's own secret:

```bash
# on the target host
docker exec <backend> node dist/scripts/certPrepE2eFixture.js     # prints FIXTURES_JSON
# locally
node tests/certprep/certprep-e2e.js https://<host> fixtures.json out/
docker exec <backend> node dist/scripts/certPrepE2eFixture.js --cleanup
```

The fixture script creates one cohort and one enrollment on each side of the
Week 7 fence, all marked `certprep-e2e` with `@colaberry.test` addresses, and
`--cleanup` removes exactly those rows.

## What it covers

| Group | What it proves |
|---|---|
| A | The Week 7 fence holds in the UI **and** at the API, and the server decides |
| B | The blueprint is the official one: five domains, 100%, D2 < D3, 60 items / 120 min / 720 |
| C | Presentation honesty — "Colaberry readiness estimate", no zeroed dial, "Not attempted" |
| D | A whole sitting: served without answer keys, every item answered, rationale only after submit, completed with a server-computed score |
| E | Points awarded through the real route, once, and visible in the chrome |
| F | Retry and race on one idempotency key return one sitting; duplicate answers update in place; resume returns what was answered |
| G | A mock is time-limited from the blueprint and shows a live countdown |
| H | Evidence answers, and nothing is verified without a human |
| I | Authorization: no token, wrong token, and another student's sitting |
| J | Layout at 1600 / 1280 / 390 — no overflow, rail sticky above the breakpoint and stacked below |

## Two assertions this suite got wrong first

Recorded because a test that lies is worse than no test:

1. **Stickiness at 1280px.** The shared layout deliberately collapses to one
   column below 1300px; the rail stacking there is correct. The assertion, not
   the layout, was wrong.
2. **"Finishing produces a score"** matched the words *score* or *readiness* in
   the page text — which are present whether or not anything was completed. It
   passed on a run whose diagnostic was still `in_progress` and whose points
   were never awarded. It now asserts the **session** is `completed` and
   carries a server-computed scaled score.
