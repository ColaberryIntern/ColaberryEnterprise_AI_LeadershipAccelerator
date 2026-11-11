# CC-20261102-k9r4 — the phone number the landing page stopped asking for

## What was asked

Ali, 2026-11-11: *"I see that the phone number was removed from the landing page. Add that
back. We need to collect phone number mandatory in this process."*

## He is right, and it was this tab that did it

The landing page's CTAs used to point at `/portal/signup`, which asks for a phone number
(optional, with its own consent handling). **OH-3** (`ecd795367`, 2026-11-10 — this tab)
pointed them at the new `/open-house` page instead, and that page asks for a name and an
email only.

So nothing "removed" a field from a form. A new form replaced the old one in the funnel and
never had the field, which means **the Open House funnel has not collected a phone number
since OH-3 shipped**. Confirmed by reading `OpenHouseSignupPage.tsx`'s whole history: two
commits, neither of which ever contained a phone input.

## The backend was already ready

Worth stating, because it made the change much smaller than it looked:

- `openHousePublicSignupSchema` already accepted `phone` — optional.
- `handlePublicOpenHouseSignup` already passed `phone: payload.phone` through.
- `createExplorerEnrollment` already persisted it: `Enrollment.create({ …, phone })`.

The entire gap was the form. The field was plumbed end to end and nothing was filling it.

## What changed

1. **`OpenHouseSignupPage.tsx`** — a required `type="tel"` phone field between email and the
   consent box, with `inputMode="tel"` for the numeric keypad (most of this traffic is
   mobile) and a one-line reason under it. Exported `phoneProblem()` so the rule is testable
   without driving the DOM.
2. **`openHouseSchema.ts`** — `phone` becomes **required** on the public signup route, with
   the digit rule shared via `PHONE_MIN_DIGITS` / `phoneDigits`.
3. **`openHouseApi.ts`** — `phone` is required on `OpenHouseSignupBody`, so a caller that
   forgets it fails the typecheck rather than the route.
4. **`enrollmentService.ts`** — fill in a phone number on an existing enrollment that has
   none. See below; without this the change would have been mostly cosmetic.

### Required on this route only

`openHouseRegisterSchema` keeps `phone` optional. That route is called by
**training.colaberry.com**, a separate deployment in a separate repo; making it mandatory
would start 400ing their signups the moment this deploys, with no coordinated release. If
Ali wants it mandatory there too, that is a two-repo change and wants its own ticket.

### The gap that would have made this cosmetic

`createExplorerEnrollment` returns early for an existing active enrollment, **before**
anything is written. So a returning visitor would have been forced to type a phone number
and we would have thrown it away. Every Explorer account created before today has an empty
phone, which makes that the common path rather than an edge case.

It now fills a **blank** only — never overwriting a number already on the account, because a
stranger who types someone else's email must not be able to rewrite that person's contact
details. A failure there is logged, not thrown: the signup has already succeeded by any
measure the visitor cares about.

## Collecting a number is not consent to ring it

The field is mandatory and nothing more. No box is pre-ticked, and no consent record is
written from the phone number. The existing `marketing_opt_in` stays separate, unticked and
about email.

**Flagged for Ali:** if anyone is going to *call or text* these numbers, that needs the
express-consent checkbox the `/portal/signup` page already has
(`PhoneConsentCheckbox` / `PHONE_CONSENT_TEXT`). Not added here, because inventing consent
wording on a page is how an unfalsifiable consent record gets created. Say the word and it is
a small follow-up.

## Verification

Both rules were **executed** against one table of 15 inputs, asserting the form and the route
agree on every one — the check exists because a form that accepts what the route refuses
tells the visitor the number is fine and then hands them a 400.

**It caught a real defect.** A phone entry longer than 50 characters passed the form and was
refused by the route's `.max(50)`. The form now enforces the same ceiling, the suite pins it,
and the harness re-run is clean: 15/15 agree, with controls proving the rule both accepts and
refuses something (8 accepted, 7 refused) — so a rule that blanket-passed or blanket-failed
could not have looked like a pass.

Mandatoriness is pinned as four separate refusals (absent, empty, whitespace, too-few-digits,
too-long) on both sides, because a field a visitor can satisfy with `555` is not required.

The frontend copy baseline is unaffected: none of the new copy contains the barred word, and
this page is not in `FRONTEND_COPY_BASELINE` (it is at zero and stays there).

Not yet verified in production — that needs a signup after deploy.

## Addendum: the first push failed the typecheck, on one line

`openHouseSchema.ts(27,13): error TS2769: No overload matches this call` — the only error
in the run, and the reason the test-file typecheck failed too, since it checks the same
file.

The cause was `z.string({ required_error: 'phone is required' })`. **zod 4 removed
`required_error`** (it is `error` now), the repo is on `zod@4.3.6`, and nothing else in the
repo used that option — so there was no local precedent to copy and I wrote zod-3 syntax
from memory.

It now passes no options object at all. An absent `phone` therefore gets zod's own
`"Invalid input: expected string, received undefined"`, which is only ever a backstop: the
form validates first and gives the friendly wording.

**Then it was executed instead of assumed.** The patched schema was run against the repo's
real `zod@4.3.6` over the 14 bodies the controller suite feeds it — 14/14, with controls
proving it both accepts (4) and refuses (10), rather than blanket-passing. Every refusal
message was printed and read.

And a **diagnosis control**: reintroducing `required_error` under that same zod proves it is
ignored, with the message coming back as zod's default rather than mine. Without that, I
would only have known the error went away, not that I had understood it.

## Addendum 2: the repo already required what I had called optional

The second push failed one test, and it is the most useful failure of the whole task:

`backend/src/services/consent/__tests__/everyPhoneFormAsksPermission.test.ts` —
*"every public form that collects a phone asks permission to use it"*.

It is a structural invariant that walks `frontend/src`, finds every file rendering a
`type="tel"` input, and requires each one to reference the shared gate
(`shouldAskPhoneConsent`), the shared component, or the shared wording — or to be listed in
`INTERNAL_SURFACES` **with a written reason**. Its own docblock explains why: fifteen
landing pages once collected numbers with no `consent_records` row behind any of them,
every test passed, and the gap was invisible until somebody went looking.

So the consent checkbox I had flagged as "a small follow-up, say the word" was **already
mandatory in this repo**, and I had made the field required without it. The Open House page
is unambiguously public marketing capture; exempting it would have been precisely the
"it is fine, it is internal" judgement that test says was wrong the first time.

Wired up properly instead:

- **The page asks**, using the shared `shouldAskPhoneConsent` gate and `PHONE_CONSENT_TEXT`
  wording, rendered with the page's own `cboh-*` primitives (the path that component's docs
  prescribe for a page with its own sheet). Shown only once a number is typed, never
  pre-ticked, never a condition of submitting.
- **The schema accepts `phone_consent`.** It is `.strict()`, so an undeclared key would
  have been a 400 for the entire signup — worse than a dropped field.
- **The controller records it** via `capturePhoneConsent`, keyed on the number rather than
  the address (an SMS gate looks consent up by phone), in its own try/catch so a failure
  writing the email grant cannot skip the phone grant and neither costs the person a seat.
- **The guard itself was strengthened**: `openHouseController.ts` and `openHouseSchema.ts`
  are now in its enumerated entry points, so this new surface is covered by the invariant
  rather than merely passing it today.

The number stays mandatory; the permission stays optional. That is the compliant shape, and
it is now enforced by a test rather than by my say-so.
