# Session CC-20261102-k9r4 — the Explorer welcome email (OH-5)

PROGRESS.md is sealed, so this is the session record. Companion to
`SESSION_CC-20261102-k9r4-open-house.md` and `-geoip.md`.

## Why

Ali asked what the email looks like that tells an Open House signup about their
new account. Rendered with the real template and the real arguments, it was the
standard enrolment welcome: "your seat is reserved", "your program roadmap",
"what to expect week one". Checked rather than eyeballed: **zero** occurrences of
"open house", zero dates, zero times. Someone signs up for an event and gets an
email about an account.

Ali, 2026-11-10: "This is not the right message. Also use the right formatting."

## What shipped

- Date: 2026-11-10
- Session: CC-20261102-k9r4
- `backend/src/services/welcome/explorerWelcomeEmail.ts` — a new template for the
  landing-page / Open House door, in the portal's design language.
- `TrainingWelcomeData.template?: 'standard' | 'explorer'`, threaded through
  `sendPortalWelcome`, with `createExplorerEnrollment` asking for `explorer`.
- 30 cases in `explorerWelcomeEmail.test.ts`.
- Verification: all 49 assertions executed against the real module through Node
  26's native type stripping before pushing.

## Decisions

**A second template, not a restyle.** The standard welcome greets somebody who
enrolled in a programme. An Explorer clicked an ad, gave an email, and now has an
account they did not ask for in so many words. Its own header warns against
duplicating a branded layout; that warning is respected in the way that matters —
this is not a copy of it, so neither can inherit a change meant for the other.
Everything that is a property of "a transactional welcome that is also a login"
stays shared: recipient resolution, the kill switch, the Mandrill tag, and the
deliberate absence of List-Unsubscribe.

**The persuasion is the video's own words.** This email exists to get someone to
finish a 109-second video, and the best available material is what the video
says. Every claim traces to `week0ProgramVideoFirst.ts`, whose answers were
checked against the transcript on 2026-11-09: the frontier engineer who "goes
into a business and builds real AI systems that work", the weekly live sessions,
"you do not need to be technical", the avatar made with the tools they are about
to learn, and Ali's own closing line — "Finishing this video is your first win" —
which is the most direct lever on completion there is.

**No invented figures.** The video quotes salary and price numbers. The email
points at them rather than restating numbers it cannot verify, and a test asserts
no dollar amount, percentage or k-salary appears.

**The assignments are the real ones**, read from live `timeline_cards` week 0 on
2026-11-10: the welcome video (2 min), the quick check (5), self study (15), What
is Colaberry (10). A promise of work a new Explorer will not find is worse than
no promise.

**"$0 to start", not "free".** 40 TAC 807.172(d) governs how a licensed career
school advertises. Ali's brief said "free training"; the approved phrasings in
this repo are "$0 to start" and "No card needed", and a test holds the line.

**The href escapes its ampersand.** The link carries `?token=...&next=...`, and a
bare `&` in an attribute is ambiguous markup. The failure mode is a sign-in link
that works in most clients and silently not in one.

## Verified, not assumed: the link really does skip the login

Ali: "Make sure that when they click on it, it takes them straight to their
account (Ali's video) without having to login." It already does, and every step
was read rather than trusted:

- `verifyMagicLink` returns a JWT and **deliberately does not clear the token** —
  "Keep token reusable... lets users bookmark their portal link." Good for 30 days.
- `PortalVerifyPage` calls login() and navigates to `next` with no interaction.
- `safeNextPath` accepts `/portal/runtime/<uuid>`.
- The card: week 0, published, `unlock_rules: []`, **not locked** — with the quick
  check next to it at `locked: true` as the control that the check can tell them apart.
- `ali-avatar-welcome-v1.mp4` serves 206 as video/mp4; the poster serves 200.

The login screen Ali saw came from the preview's placeholder token, which returns
401 and lands on the "Request New Link" path.

## Not in this PR

The Open House reminders, which are the item with a deadline: anyone who signs up
on our page is not on Eventbrite, so Eventbrite's reminders will never reach them,
and we have none of our own. Also an admin view of the attendee list —
`listOpenHouseRegistrations` exists and nothing reads it.
