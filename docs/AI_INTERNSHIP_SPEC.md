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
