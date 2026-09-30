# AI Internship — verified product spec

Source: Dhee's invitation email (Colaberry School of Data Analytics), plus Ali's
correction on 2026-08-17 that **advertising always targets the following Monday**.
This supersedes the assumptions I made when building the data model on 2026-08-13.

## What the product actually is

- **Full-time apprenticeship**, 100% online.
- **Rolling weekly start** — each advertisement targets *the following Monday*.
  Not a fixed cohort with a published date. The `Tuesday, August 4th, 2026` in the
  email is a stale instance of a rotating value, not the program's start date.
- **Open-ended duration** — runs "until you secure a full-time position in the AI
  field." There is no end date. On landing a role, the intern gives 1-2 weeks' notice.
- **The intern PAYS.** Participation requires an active subscription
  ($149/mo per the 2026-07 offer pivot). Colaberry does not pay a stipend.
- **Eligibility gate:** the applicant must **not currently be employed full-time**.
- **Schedule:** project work Tuesday/Wednesday/Thursday; scrum Monday and Friday.
  "Availability for a significant portion of the day is required."
- **Work:** two AI projects simultaneously — Microsoft Fabric, Python, LLMs, AI
  agents, ML concepts, prompt engineering.
- **Current intake is manual:** email `ali@colaberry.com` and `dhee@colaberry.com`
  with subject "AI Internship" and a fixed commitment paragraph. Zoom:
  `https://zoom.us/j/8563379136`.
- Applicants commit to monitoring personal and project KPIs.

## Where the data model I built is WRONG

`db/ensureInternshipSchema.ts` (commit `6a0189fb`) was written before this spec
existed and encodes three wrong assumptions. It is unmerged and undeployed, so
fixing it costs a migration against zero rows.

### 1. The payment direction is INVERTED — the important one

Shipped columns say Colaberry pays the intern:

```
is_paid BOOLEAN NOT NULL DEFAULT false,
stipend_cents INTEGER,
```

Reality is the opposite: **the intern pays a subscription to participate.**
Left as-is, an admin UI built on this schema would offer a "stipend" field for a
program that charges. Replace with:

```
requires_subscription BOOLEAN NOT NULL DEFAULT true,
subscription_price_cents INTEGER,
```

### 2. `starts_on` models a fixed cohort; the product has rolling weekly starts

An offering is a standing program, not a dated cohort. The concrete start is
**the Monday following the application**, computed per applicant, not stored once
on the offering. Keep `starts_on` nullable for a genuinely dated future cohort,
but the application needs its own `desired_start_on DATE`, and the intake must
derive "next Monday" rather than read a fixed field.

### 3. `ends_on` implies a fixed end; there is none

Keep the column (harmless, nullable) but document that it is null for this
program. A UI must not render "ends" for an open-ended apprenticeship.

### Missing columns the real intake requires

On `internship_applications`:

```
attests_not_employed_fulltime BOOLEAN NOT NULL DEFAULT false
desired_start_on             DATE
commitment_acknowledged_at   TIMESTAMPTZ
```

The eligibility attestation and the commitment acknowledgement are **the two
things the current email intake actually collects**. A form that drops them
collects less than the email it replaces.

## What this means for the Explorer Growth OS

The subscription requirement resolves an ambiguity in §8.1's `CONVERTED` rule.
An accepted intern **necessarily has an active subscription**, so internship
acceptance is not an independent third path to `CONVERTED` — it implies the
subscription disjunct. That makes the OR form correct and makes P24 (deferred for
want of a data model) partly redundant rather than merely missing.

It also means `INTERNSHIP_READY` should almost certainly require **no active
subscription yet** — the overlay exists to prompt someone to subscribe, and
targeting existing subscribers with a "become an intern" nudge is the same
already-paid-and-still-marketed-to failure the `CONVERTED` fix was meant to prevent.

## Open questions for Ali

1. **Is an internship applicant a lead?** The training site funnels forms through
   `writeLead`. An applicant who must already subscribe is not a marketing lead.
2. **Does the form replace the email intake, or run alongside it?** Dhee currently
   receives these by hand; a form that silently diverts them changes her workflow.
3. **Is there a capacity cap?** The email says "space is limited." The schema has
   `capacity`, currently unused.
4. **Must the subscription exist before applying, or is applying the trigger to
   subscribe?** This decides whether the form gates on payment or leads into it.

---

# Ali's decisions, 2026-08-18 — and what they mean for the build

All four open questions above are now answered, and the fourth changes the
architecture rather than just filling in a field.

## The answers

1. **Yes, an applicant IS a lead.** The goal is to move them into a subscription.
   **Past students may join free for a period** — so comped access is a real,
   expected state, not an edge case.
2. **The portal REPLACES the email intake entirely.** The whole flow runs through
   the portal and is **managed by Dhee**. She needs a real admin surface, not a
   forwarded inbox.
3. **No real capacity cap.** "Space is limited" is urgency copy. Do not build a
   seat-counting gate; `capacity` stays unused and should probably be dropped.
4. **The internship is a CLASS you enroll in.** There is **one class that all
   interns are enrolled in**. Internship access grants the **full training** —
   project work and class. Sign-up is **the same flow as a class, an option in
   the existing dropdown**. A student enrolled in a class **can move to the
   internship later**, and vice versa. Interns can self-serve the training and
   **also drop into live classes** that are running.

## The consequence: my two tables are largely the wrong shape

Decision 4 means the internship is **not a parallel system**. It is an
**enrollment option on the existing one**. That collapses most of what I built
on 2026-08-13:

- **`internship_applications` duplicates `enrollments`.** An application IS an
  enrollment in the internship class. Keeping a second table would create two
  divergent records of "this person is in the internship", and the portal, the
  entitlement check, and the Explorer journey would each have to pick one.
  **Do not carry this table forward without a specific reason it cannot be an
  enrollment.**
- **`internship_offerings` is probably one cohort row**, not a new table. There
  is ONE internship class. The existing cohort machinery already models a class
  with dates, and `hasFullCurriculumAccess()` already answers "can this person
  see the training."
- **The rolling-Monday start** is a property of when someone joins, not of a
  cohort record — consistent with the internship being continuous rather than
  dated.
- **Comped past students** are already expressible: `activeCompEnrollmentIds()`
  exists and the entitlement layer already distinguishes comp from paid. That is
  precisely the "free for a little while" case, and it is already built.

What genuinely does NOT exist yet and must be built:

- The **internship option in the signup dropdown**, and the enrollment path behind it.
- **Dhee's management surface** — review, accept, move a student between class and
  internship. This is the piece with no analogue today.
- The **eligibility attestation** (not employed full-time) and the **commitment
  acknowledgement**. These attach to the enrollment; they are the two things the
  email intake collects that nothing in the portal currently does.
- **Class-to-internship movement** in both directions, without losing history.

## Recommended next step, revised

**Do not extend `internship_offerings` / `internship_applications`.** Before
writing more code, verify against the live schema whether an internship cohort
plus an enrollment type covers this, and reserve the bespoke tables for whatever
genuinely does not fit — most likely just the attestation and commitment fields,
which could as easily hang off the enrollment.

The two commits from 2026-08-13 (`6a0189fb`, `a8bc3c29`) are **unmerged and
undeployed**. Reverting them costs nothing. The service logic worth keeping is
the idempotency rule (re-submitting never overwrites a decision a human made) and
the anti-enumeration behaviour — both belong wherever the enrollment path lands.

## Explorer Growth OS consequence

Because internship access grants full training access,
`hasFullCurriculumAccess()` will return **true** for an intern. So an intern is
already `CONVERTED` under §8.1's first disjunct, with no internship-specific rule
needed at all. **P24 can be closed as redundant rather than deferred.**

`INTERNSHIP_READY` still needs care: it should target learners who are **not yet
subscribed and not yet enrolled**, since interns by definition already have both.

---

# Flow decisions, 2026-08-18

1. **Dhee approves first.** Signup creates a **pending application**; Dhee reviews
   and accepts. A human checks the not-employed-full-time attestation. **We build a
   review queue.**
2. **Payment on acceptance, before access.** Dhee accepts, applicant gets a checkout
   link, training access unlocks when payment clears. Needs a **nudge and an expiry**
   for accepted people who never pay, or they stall in limbo indefinitely.
3. **Moving from a class KEEPS the class enrollment** and adds the internship on top.
   Progress, cohort and history survive untouched, and interns can drop into live
   classes anyway. **A person may legitimately hold two active enrollments.**
4. **Dhee can grant free access with an end date she sets.** On lapse, access
   converts to requiring a subscription, and she is **warned before it expires**.
   Comp is time-boxed per person, not open-ended and not a fixed global window.

## The collision decision 3 creates — resolve before building

`participantService.pickBestEnrollment` exists because `enrollments.email` is not
unique and duplicates are routine noise. Decision 3 makes **two concurrent
enrollments a legitimate state** for the first time: class *and* internship, both
active, both correct.

So `pickBestEnrollment` can no longer treat "two rows for one email" as a duplicate
to collapse. Anything that calls it — the portal, the entitlement check, the
Explorer Growth identity bridge and profile recompute — must decide whether it wants
*the* enrollment or *all* of them. **Silently picking one would hide a student's
internship or their class, depending on which row wins.**

This is the highest-risk integration point in the whole feature and it is not
internship-specific: it changes an assumption several existing systems already rely
on. Audit every `pickBestEnrollment` call site before writing the enrollment path.

## Revised build order

1. **Audit `pickBestEnrollment` call sites** against the two-active-enrollments case.
2. **Internship option in the signup dropdown**, creating a pending application
   carrying the attestation and commitment acknowledgement.
3. **Dhee's review queue** — accept, decline, comp with an end date, move a student
   between class and internship.
4. **Acceptance to checkout to access**, with the unpaid-limbo nudge and expiry.
5. **Comp expiry**, with the advance warning to Dhee.
