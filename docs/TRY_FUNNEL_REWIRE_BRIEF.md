# /try funnel rewire — implementation brief

Ali's instruction, 2026-08-21. Written by session CC-20260807-h2r6 at the end of
its context so the next session can execute immediately rather than rediscover.

**Everything below the "verified" line was measured this session. Everything
under "unverified" must be checked before acting — this workstream has already
been bitten once by trusting a stale code comment instead of the route table.**

---

## The ask, in Ali's words

1. "The Start Free page is no longer there. Bring that back."
2. "When you click on 'Talk to an architect' it takes you to a page where it has
   the old header instead of the new one."
3. "Every time you try to get someone to try out the platform, they should be
   lead here: https://enterprise.colaberry.ai/try"
   - Home: "Open my free company workspace" -> `/try`
   - "Have an architect walk me through it" -> same target as "Talk to an
     Architect"
   - Services page: same links
   - Platform page: same links
   - Pricing page: "free account" -> `/try`
   - Start Free: fix it AND point it at `/try`
4. On `/try`, once you scroll past them, the **"Make this real: create your free
   account"** and **"Send free test invites"** buttons should stick to the top —
   the same philosophy as the next-assignment sticky bar on
   `/portal/projects` and `/portal/classroom`.

---

## VERIFIED this session

### The CTA sites that need retargeting

Measured with grep on 2026-08-21. Line numbers will drift; match on content.

| File | Line | Current | Button text |
|---|---|---|---|
| `pages/publicV2/HomeV2.tsx` | 618 | `to="/start"` | (primary) |
| `pages/publicV2/HomeV2.tsx` | 672 | `to="/start"` | (primary) |
| `pages/publicV2/HomeV2.tsx` | 675 | `to="/contact"` | (ghost) |
| `pages/publicV2/PricingV2.tsx` | 119 | `to="/start"` | free account |
| `pages/publicV2/PricingV2.tsx` | 122 | `to="/contact"` | (ghost) |
| `components/publicV2/HeroPlatformV8.tsx` | 113 | `to="/start"` | (primary) |
| `components/publicV2/HeroPlatformV8.tsx` | 116 | `to="/contact"` | (ghost) |
| `components/publicV2/HeroPricingV8.tsx` | 99 | `to="/start"` | (primary) |
| `components/publicV2/HeroPricingV8.tsx` | 102 | `to="/contact"` | (ghost) |
| `components/publicV2/HeroServicesV8.tsx` | 111 | `to="/contact"` | (ghost) |
| `components/publicV2/OpenPlatform.tsx` | 47 | `to="/start"` | Open my free company workspace |
| `components/publicV2/OpenPlatform.tsx` | 49 | `to="/services"` | Have an architect walk me through it |
| `components/publicV2/PublicHeaderV2.tsx` | 107 | `to="/contact"` | Talk to an Architect (desktop) |
| `components/publicV2/PublicHeaderV2.tsx` | 129 | `to="/contact"` | Talk to an Architect (mobile) |

Note `OpenPlatform.tsx:49` currently points at `/services`, which is wrong per
item 3 — it must match wherever "Talk to an Architect" goes.

### Why /contact has the old header

`routes/publicRoutes.tsx` line 54 routes `/contact` to `ContactPage`, inside a
block whose own comment reads:

> "Everything below this block is deliberately untouched: /enroll and its
> success/cancel pair carry the payment flow... Deleting those because 'the old
> site is not needed' would break paying customers."

So `/contact` is a **legacy page that never moved to `PublicLayoutV2`**, which is
exactly why it renders the old Home / The Program / Contact nav. The fix is to
bring it under the V2 layout so it picks up `PublicHeaderV2` — NOT to delete it.

### /start and /try are NOT routed in routes/*.tsx

`grep '"/start"\|"/try"' frontend/src/routes/*.tsx` returns **nothing**. Both
paths are declared somewhere else (check `App.tsx` and any v2 route module).

This is the likely root of item 1: **every `to="/start"` in the table above may
be pointing at a path with no route**, falling through to `NotFoundPage`.

CAUTION — do not conclude that from this brief alone. On 2026-08-20 a clean
Playwright load of `https://enterprise.colaberry.ai/start` returned **200** with
`h1 = "Start with your own workspace"`, no console errors, white background.
Either the route exists somewhere not yet grepped, or something changed between
then and Ali's 2026-08-21 report. **Find where /start and /try are declared
before changing any routing.**

---

## UNVERIFIED — check before acting

- Where `/start` and `/try` are actually declared.
- Whether `/start` currently 404s, and if so what changed since 2026-08-20.
- ~~Whether `/start` survives as its own page or becomes a redirect.~~
  **ANSWERED by Ali, 2026-08-21: `/start` should lead to `/try`.** Implement it
  as a redirect — `<Route path="/start" element={<Navigate to="/try" replace />} />`
  — matching how `/program`, `/case-studies` and the other retired marketing
  paths are already handled in `routes/publicRoutes.tsx`. Redirect rather than
  delete, because "Start free" is on the header, the home page and the pricing
  page, and inbound links and the sitemap still point at `/start`.

  This also resolves item 1 ("bring Start Free back") without building a page:
  the button works again and lands on the experience Ali actually wants people
  to see. It means **no `HeroStartV8` is needed** — drop that from the backlog.

  Leave the CTA *labels* alone. "Start free" is still the right words on the
  button; only the destination changes.
- The exact sticky-bar implementation on `/portal/projects` and
  `/portal/classroom`. Read it and reuse the pattern rather than inventing a
  second one; the repo already has one canonical answer.

---

## Sticky CTA bar on /try

Target file: `pages/ManagementPreviewPage.tsx` (this IS `/try` — front-end only,
sample data, verified 2026-08-20).

Requirement: once the user scrolls past the pink preview banner, "Make this
real: create your free account" and "Send free test invites" pin to the top and
stay reachable.

Reuse the `/portal/projects` and `/portal/classroom` sticky pattern. Respect
`prefers-reduced-motion`, keep the bar keyboard-reachable, and make sure it does
not cover the portal shell's own header.

---

## DECIDED 2026-08-21 — "Start free" lands on the /try demo

Ali, asked directly: **the /try demo (the Acme Corp dashboard), not the signup
page.**

This overrides the earlier session's choice recorded in
`pages/publicV2/__tests__/TryV2.test.tsx`, which asserts the opposite:

```js
expect(h).toContain('href="/start"');
expect(h).not.toMatch(/href="\/try"/);
```

Its stated reason was "a bare /try link would drop the visitor out of the V2
shell into a preview with no signup path at all." **That premise is now stale**
-- /try leads with "Make this real: create your free account" and "Send free
test invites", so it is no longer a dead end.

**That test must be UPDATED, not deleted, and not left contradicting shipped
behaviour.** Invert both assertions and rewrite the comment to record why the
decision changed and who made it. A test that disagrees with production is worse
than no test: the next person cannot tell which one is wrong.

### The work, in order

1. **Check whether `main` is red.** PR #1681 was merged on 2026-08-21 without
   its CI being verified -- my miss. It retargets CTAs to /try, which violates
   the assertions above. Fix or revert before anything else ships.
2. **Restore `/start` to a real route.** `pages/publicV2/SignupV2.tsx` exists and
   is almost certainly the page that served `h1 = "Start with your own
   workspace"` on 2026-08-20. Its route was lost; that is the original
   regression. Route it, THEN decide whether /start also redirects -- do not let
   a redirect hide a missing page a second time.
3. **Fix the three CTAs the first pass missed.** All config-driven, which is why
   a JSX-only pattern skipped them:
   - `components/publicV2/PublicHeaderV2.tsx:43` -- `{ label: 'Start Free', to: '/start' }`
   - `config/v2Pricing.ts:61` -- `ctaRoute: '/start'`
   - `config/v2Pricing.ts:82` -- `ctaRoute: '/start'`
4. **Update TryV2.test.tsx** per the decision above.
5. **Redeploy and confirm the bundle hash moves off `main.fdce7694.js`.** The
   2026-08-21 deploy reported `HEAD == origin/main` and compose exit 0 yet /start
   did not redirect, which points at a cached nginx image layer. Exit code 0 is
   not evidence; the hash changing is.
6. **Re-run the live Playwright funnel check** -- it is in this session's
   scratchpad as `funnel.js` and it correctly caught the failed deploy.

## Sticky CTA bar on /try -- THE PATTERN, measured 2026-08-21

The portal does NOT use JS for this. It is plain CSS sticky, offset below the
61px shell header. From `pages/portal/today/TodayShell.css`:

```
.te-topbar { position: sticky; top: 0;    z-index: 20 }   /* the 61px header */
.te-rail   { position: sticky; top: 61px; height: calc(100vh - 61px) }
.te-side   { position: sticky; top: 20px; align-self: start }
```

So the /try bar should be `position: sticky; top: 61px` inside the scroll
container, holding "Make this real: create your free account" and "Send free
test invites". ManagementPreviewPage already imports TodayShell.css, so the
tokens and the 61px offset are available -- do not invent a second header height.

Reveal it once the pink banner scrolls past, via IntersectionObserver on the
banner (the pattern used throughout publicV2, always paired with a
prefers-reduced-motion check). A compact always-sticky bar is also acceptable and
simpler. Ali called this "our signature functionality", so match how
/portal/projects and /portal/classroom feel rather than inventing a new motion.

## OPEN, requested 2026-08-21 (Ali) -- not yet built

### 1. Restyle the /try sticky bar to match the portal's next-step bar

The bar works (verified live: pins at exactly `top: 61px`) but Ali wants it to
LOOK like the one on /portal/classroom, not just behave like it. That bar is a
compact pill INSIDE the topbar: a circled star icon, a two-line stack
("YOUR NEXT STEP - ANNOUNCEMENT" over the title), a `+5 pts` chip, prev/next
chevrons, and an "Open ->" pill on the right. Screenshot-match it; the classes
are in TodayShell.css alongside `.te-topbar`.

### 2. More CTAs through the home page

Ali: "the user has to do so much scrolling in between CTAs. Give each a fresh
look that is a segment to attract people that have heard enough and ready to get
started."

So: a distinct, repeating CTA BAND -- not a copy of the closing CTA -- dropped
between the long home-page sections. Design it as its own segment with its own
look. Every one of them points at /try.

### 3. "Explore the Platform" must reach /try -- DONE 2026-08-21

It pointed at `/platform`, the marketing page. Fixed in PublicHeaderV2 (both
desktop and mobile), HeroV8, and `config/v2Content.ts` (`ctaRoute`).
HeroPlatformV8 was already correct. **Re-check after any hero work.**

### 4. Fix the Colaberry logo to match the site

The portal shell (/try, /portal/*) renders a lowercase "colaberry" wordmark with
the ring mark and the "AI Systems Architect Accelerator" subtitle. The marketing
site renders the cherry mark plus "Colaberry" and "Enterprise AI". A visitor
crossing from /platform to /try sees two different brands. Ali wants the portal
one to match the site. Find the shell's logo component and align it -- do NOT
alter the brand mark artwork itself.

## Gates and shipping

- `tsc --noEmit` in `frontend/` (slow on this machine, 10-20 min; run it in the
  background and NEVER pipe it through `tail`, which masks the exit code -- that
  trap cost this session a false green already).
- `CI=true npx react-scripts build`, exit code captured directly.
- Branch `workstream/enterprise-site-v2` -> PR -> Ali approves (the PR author
  cannot self-approve) -> merge -> deploy.
- Deploy: wait-and-build inside ONE ssh session, print `WOULD-MOVE:` before
  merging, assert `HEAD == origin/main`, then
  `docker compose -f docker-compose.production.yml up -d --build --no-deps nginx`.
- PROGRESS.md entry stamped with the session ID, with verification evidence.
- **Verify live with Playwright, not by trusting the deploy exit code.**

## Also still outstanding from the same workstream

- The 12-week roadmap renders nowhere since `/platform` was trimmed. `Roadmap12`
  still exports; restoring it on `/program` is a wiring change.
- Ali wants the long "3-4 options that becomes 15-20 questions" form replaced by
  the Start Free path. **Which form was never identified.** `/enroll` carries
  the payment flow, so do not guess.
