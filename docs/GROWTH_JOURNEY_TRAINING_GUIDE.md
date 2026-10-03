# The Growth Journey workspace — a guide for the people who use it

**Who this is for:** admissions, sales, solution architects and support — anyone who will
work a handoff queue or read these screens. You do not need to know how any of it is
built.

**Where it is:** Admin → Growth Journey. Nine tabs, described below in the order they
appear.

**The one thing to know before you start:** this system is currently **switched off** and
has never contacted anyone. Everything you see today is configuration and rehearsal, and
when a screen looks empty that is almost always the honest answer rather than a fault.

---

## It does not call everyone a "lead"

A person partway through a Colaberry Training course and a company evaluating a
consulting engagement are not the same kind of person, and the workspace does not pretend
they are. Each programme carries its own vocabulary and the screens use it:

| Programme kind | The person is a… | Their commitment is an… | Their track is a… |
|---|---|---|---|
| Learner (CPN, Colaberry Training) | **learner** | **enrolment** | **path** |
| Business (Colaberry Business) | **lead** | **account** | **opportunity** |
| Consulting (Colaberry Business, AI Flotation) | **lead** | **engagement** | **project** |

So the same column reads "learner" on a CPN programme and "lead" on a consulting one.
Deliberate — and if you see the wrong word for the programme you are on, report it. With
no programme selected the wording is neutral, because there is no single right word yet.

### The brand boundary, which matters more than it looks

- **CPN** and **Colaberry Training** — learner journeys only.
- **Colaberry Business** — business training, consulting, workflow automation, app
  builds, general AI.
- **AI Flotation** — the same as Colaberry Business **except business training**.

**Business-training content must never be routed into an AI Flotation journey.** The
system enforces this and the Content tab shows you the rule that did it. If you ever see
business-training material offered to an AI Flotation subject, stop and report it — that
is not a cosmetic problem.

---

## Before anything works: the brand selector

Two dropdowns sit at the top: **brand** and **programme**. Most tabs are scoped by them.

If every tab errors the moment you pick a brand, your account has most likely not been
granted access to that brand's tenant yet. That is a one-time setup step someone runs for
you — not something you can fix here, and not a bug. Ask whoever set up your admin
account.

---

## 1. Overview

Where you start: "is this system on, and does it have anything in it?"

Three states, and the screen names which one it is in rather than leaving you to guess:

- **Switched off.** It says so and names the switch. Nothing is broken; the system is
  dark on purpose.
- **No data seeded.** It says so and names what needs running — which matters, because an
  unseeded system and a working-but-quiet one look identical on every other tab.
- **Working.** Counts of brands, programmes and paths, plus whether each of the three
  background jobs is enabled and when it last ran.

A job showing no "last run" has never run. That is different from running and finding
nothing.

---

## 2. Classification

**What it answers:** how did the system read this person, and why?

Each row is one person the system has looked at: which brand it assigned them to, which
programme, which path, and how confident it was. Open the **why** on any row for the
evidence behind it.

What you can do here: **override** a classification when it is wrong. You must give a
reason of at least a few words, and say whether your override is **locked**.

- **Locked** — the system will not re-classify this person later. Use it when you know
  something it does not: a phone call, a correction from the person themselves.
- **Unlocked** — your correction stands now, but later evidence can change it.

Overrides are recorded with your reason. They are not anonymous.

---

## 3. Decisions

**What it answers:** what did the system decide to do next, and did anything stop it?

Today every decision is a **shadow** decision: recorded, never acted on. The column that
matters is the reason. Several reasons are not failures:

- **held out of an experiment** — deliberately left alone so the team can measure whether
  the messaging works at all. See Experiments.
- **a human is already in the conversation** — it stood down because a person is handling
  it. This is the behaviour you want.
- **the person replied after the decision was made** — stale, so discarded rather than
  acted on.
- **cooling down** — recently returned by a human, waiting the agreed period.

Open the **why** for the full reasoning on any decision.

---

## 4. Shadow

**What it answers:** did the nightly job actually run?

Short, and useful. If decisions look stale, check here first. It shows each run, when it
happened, and what it covered.

A run reporting no counts **did** run — it just has nothing to report. "Did not run" and
"ran and found nothing" are shown differently, and that difference is the point of this
tab.

---

## 5. Content

**What it answers:** what is the system allowed to say to this person, and what is it not?

Each row is a content rule: brand, offer family, programme, path, and whether it is
approved. **Only `approved` content is usable** — draft and pending count for nothing.

This is the tab that enforces the brand boundary above. When something was withheld, this
is where you find which rule withheld it, and the reasons name the dimension that failed:
wrong brand, wrong offer family, wrong programme, wrong path, not approved, outside its
date window, or explicitly restricted.

**A deny always beats an allow.** If any rule denies, the content is not used however many
others permit it — the cost of saying the wrong thing to the wrong brand's audience is
higher than the cost of saying nothing.

---

## 6. Handoffs

**The tab most of you will live in.** A handoff is the system saying "a human should take
this one."

**Creating a handoff notifies nobody.** It puts a row in a queue. You come to the queue;
it does not come to you — except for the weekday digest email, which lists what is
already assigned to you and contains no personal details about the people in it.

### Working the queue

Three moves, in order:

1. **Accept** — you are taking it. Do this before you contact anyone, so two people do
   not work the same person.
2. **Disposition** — you are done, and you say what happened. Requires a real reason, not
   a word.
3. **Release** — you are handing it back, because it is not yours or you cannot get to
   it. Releasing is a normal, good move. An unworked row sitting on your name is worse
   than a released one.

### The dispositions, and what each one actually does

| Disposition | What it means | What happens next |
|---|---|---|
| **qualified** | genuinely interested and a fit | held with you for 30 days by default |
| **converted** | they bought / enrolled | closed |
| **not ready** | real interest, wrong time | returned to the system after a 14-day cooldown |
| **nurture** | keep them warm | returned to the system after a 14-day cooldown |
| **no contact** | do not contact again | closed, no further automated contact |
| **disqualified** | not a fit | closed |

**"not ready" and "nurture" hand the person back to the system.** The others close them
out. Pick on that basis, not on which word sounds softest — choosing "nurture" for
someone who asked not to be contacted puts them back in the machine.

### Reading the queue honestly

- The ordering is **not** strictly "highest value first.** A handoff with no value
  recorded sorts above valued ones inside its urgency group, so the top of the list is not
  the most valuable item. The screen says so.
- **Paging is not stable.** Page 2 is another sample, not the remainder of page 1 — rows
  can move between pages as things change. Treat a page as a sample.
- **Priority is shown but is not what the list is sorted by.** It has its own column so
  nobody infers otherwise.
- A row showing **"no ticket"** was blocked from being assigned, and the reason is beside
  it: nobody assigned to that queue, the queue is at capacity, or capacity is not
  configured. "Capacity unknown" does **not** block anything.

---

## 7. Experiments

**What it answers:** does withholding our messaging change anything?

Some people are deliberately left alone — a **control group** — so the team can tell
whether the system's messages actually help, rather than assuming they do.

The number to read is the **lift**, and it comes with an interval. **The interval is the
finding, not the point estimate.** A lift of "5%, somewhere between −1% and +12%" has not
established anything yet; it means keep collecting. When the system cannot yet tell, it
says so instead of printing a number — by design, there is no figure to misread.

Four reasons a brand shows nothing here, kept separate because only one needs a person:

- **no policy** — nobody set up an experiment. Expected.
- **not active** — the experiment is paused.
- **settings invalid** — **this one needs a human.** The experiment is misconfigured.
- **lookup failed** — a temporary read problem.

No experiment is running today.

---

## 8. Performance

**What it answers:** how is the pipeline doing?

Rates for acceptance, connection, meetings, qualification, proposals and conversion, plus
how long each stage takes.

**The most important thing on this page is that a dash is not a zero.**

- **0%** means it happened and the answer was zero — every handoff was refused. That is a
  crisis.
- **—** means there was nothing to measure — no handoff was created. That is a quiet week.

A screen that printed 0% for both would tell you the opposite of the truth, so every dash
carries the specific reason beside it: nothing was created, nothing was accepted so
nothing could follow, or the window was too wide and the figures were **refused rather
than approximated** — narrow the window and ask again.

Timings behave the same way. A median needs at least three samples; with fewer the page
shows how many it had rather than a misleading average.

Below the rates are three more panels:

- **Execution receipts** — every individual thing the system did or declined to do, and
  why. This is the audit trail.
- **Outcomes** — what happened to people, as distinct from what the system did.
- **By programme and path** — the funnel per programme. A programme that has not started
  shows every figure as absent, never as zero: "nobody has arrived" and "people arrived
  and did nothing" are opposite findings.

One oddity, so you do not misread a number: the rates at the top come from fractions
while the by-programme table at the bottom is already in percentages. Both *display* as
percentages and you need convert nothing — but do not try to reconcile the two tables
against each other arithmetically.

---

## 9. Controls

**The only tab that changes anything.** Everything else reads.

### Pause — stop something

Use a pause when something is happening that should not be. It takes effect on work
**already in progress**, not just new work.

You must name what you are pausing — a brand, a programme, a channel, one specific person,
or a combination. **You cannot pause everything.** The form refuses it and says why: a
pause with no scope would be a second global stop switch, and the system deliberately has
exactly one. To stop everything you want the system-wide kill switch, which is not on this
screen.

Every pause needs a reason, recorded against your name.

### Rollout — widen something

A rollout is how a brand moves from "watching" to "doing", and it needs both a brand and
a programme — you cannot roll out to everything.

- **review** — actions are proposed and wait for a human. Nothing goes out unapproved.
- **limited** — actions go out, to a named list of up to 50 people, at most 25 per day.

**Ali's personal outreach can be paused here and cannot be started here.** It is
review-only by construction, so it does not appear in the rollout options. That asymmetry
is intentional.

### Clearing

Clearing a **pause** lets the scope resume. Clearing a **rollout** drops it back to
watching on the next run and does **not** cancel anything already in progress — use a
pause for that. Nothing is ever deleted: cleared controls stay visible, so there is always
a record of who stopped what and why.

---

## When something looks wrong

Ask these in order. Most "broken" reports are one of the first three.

1. **Is it switched off?** Overview says so plainly.
2. **Is the data seeded?** Overview says so plainly.
3. **Do you have access to this brand?** Every tab erroring the moment you pick a brand
   points here, not at the system.
4. **Is there a pause in the way?** Check Controls.
5. **Is there a reason beside the thing you expected?** Almost everything this system
   declines to do, it declines by name. Read the reason — it is the answer.

Two phrases you will see that mean something specific:

- **"not recorded"** — the field was empty in the source. Nobody typed the word
  "unknown".
- **"redacted"** — the value contained an email address and was deliberately masked
  before it reached this screen. No personal contact details appear anywhere in this
  workspace, by design.

If a count seems low and the page mentions being **truncated**, you are looking at a
floor rather than a total — the read hit its limit. Narrow the window.

---

## What this system will never do

- Contact anyone while execution is switched off — which it is.
- Send SMS or make calls. Those channels exist in the vocabulary only so they can be
  **refused by name**.
- Decide a cohort date, a price, a deadline, a seat count, a consent answer or a brand
  boundary on its own. Those are human facts, and the system treats them as such.
- Show you anyone's email address.

---

**Questions, or something that looks wrong:** report it with the brand, the programme, the
tab and the reason text you saw. The reason text is the most useful thing you can
include — it is usually the whole diagnosis.
