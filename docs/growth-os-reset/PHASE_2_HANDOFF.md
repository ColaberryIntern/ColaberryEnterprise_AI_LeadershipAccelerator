# Phase 2 handoff — how to check this yourself

**Written for a non-developer.** You do not need the terminal for any step below. Everything is
done in a browser with your normal admin login.

Phase 2 went live on **2026-10-12**. Running commit `12c1e5fc`.
Full technical record: `PHASE_2_CHECKPOINT.md` · at-a-glance version: `PHASE_2_CHECKPOINT.html`

---

## What changed, in one paragraph

Someone who signs up for the $0-to-start AI course used to be counted as a **paying, converted
student** by the admin screens, simply because a signup row existed for them. That also meant the
system threw away the two signals that matter most for those people — how interested they are and
how warm they are — on the grounds that they had "already converted". Phase 2 made conversion
depend on whether money or a subscription is actually attached, gave these people a visible
lifecycle stage of their own, and put their engagement score and their pre-signup website journey
on one screen.

---

## Check it yourself — 6 numbered steps

**Step 1 — Log in to the admin as you normally do.**
Go to `https://enterprise.colaberry.ai` [fetched 2026-10-12] and sign in. Nothing about login
changed.

**Step 2 — Open the People list.**
Navigate to `https://enterprise.colaberry.ai/admin/people` [fetched 2026-10-12].

**Step 3 — Find a $0-to-start learner and look at their Stage.**
Type `Explorer` into the page's search or filter box, or sort by the Stage column, to bring
them together. There are hundreds, so you do not need a particular person.
You should see the words **`Explorer ($0 to start)`**.
- ✅ **Right:** a readable label like that.
- ❌ **Wrong:** the bare lowercase word `explorer` with no capital letter and no brackets. That
  would mean the screen does not recognise the stage. *(This was genuinely broken before Phase 2
  and is one of the things it fixed.)*

**Step 4 — Click any person to open their profile.**
The address will look like `https://enterprise.colaberry.ai/admin/people/` [fetched 2026-10-12]
followed by an identifier.

**Step 5 — Find the tab named `Explorer score`.**
Click it. One of two things is correct, and **both are correct answers**:
- If they have been scored: three numbers — **Engagement**, **Intent**, **Fit** — a state, and a
  line reading **"Snapshot of <date>"**.
- If they have not been scored: the sentence **"No Explorer score has been recorded for this
  person yet"**, which also says plainly that this is **not** a score of zero.

> **Why that distinction matters.** A score of 0/0/0 means we looked at this person and they are
> cold. "No score recorded" means we have never looked. Those lead to opposite decisions, so the
> screen must never show one as the other. If you ever see `0`, `0`, `0` for somebody who you know
> has never been scored, that is a bug — report it.

**Step 6 — Check the Acquisition tab for the CRM link.**
Open the **Acquisition** tab and look for **GoHighLevel contact**.
- If the person is in GoHighLevel, you will see their contact ID.
- If not, you will see **"Not linked to GoHighLevel"** — which is normal for most people and is
  not an error.

---

## What you should NOT expect to see

- **No emails, texts or calls will go out because of Phase 2.** The switch that would allow the
  growth journey to contact anyone is **off** in production, and it is yours to turn on. This was
  checked on the live server, not just in tests.
- **No one's access changed.** Paying students keep everything they had. People on the
  $0-to-start course remain limited to Week 0, which is how it was already configured.
- **No prices, dates, seats or deadlines were touched.**

---

## Two decisions still waiting on you

### 1. Whether to run the coherence fix

**The situation, measured on the live database:** there are **86 active accounts that the growth
engine cannot see at all.** They were created through a signup route that recorded their access
level correctly but their programme incorrectly, so the engine's filter skips them.

A repair script exists. It has been run in **preview mode only** — it changed nothing. Its preview
says it would correct **56 records** and that it **refuses to touch the rest**, because it will only
move someone when it can prove from their own signup trail that they came through the $0-to-start
course. The ones it cannot prove either way it lists for a human instead of guessing — several of
them are likely corporate teammates, who legitimately look similar.

**What it would cost you:** one decision. The script writes only two fields and nothing else.
**What waiting costs:** those 86 people stay invisible to the growth engine.

There is one thing the script does **not** do, and it says so itself: 37 of the records it would
correct would be left without a "joined on" date, and **no part of the current plan is responsible
for filling that in.**

### 2. A wording and privacy fix I deliberately did not make

On the signup confirmation, the system currently tells people **"Your free account is ready"**.
Texas Workforce Commission rule 40 TAC §807.172(d) does not allow training to be advertised as
free, which is why everything else says **"$0 to start"**. The line next to it also writes a
person's **email address into the server log**, which our own rules forbid.

I left both alone on purpose: that file belongs to another piece of work, somebody else is editing
it right now, and changing it from here risked a collision. **It is a two-line change whenever you
want it.**

---

## Known limitations

1. **86 accounts invisible to the growth engine** until the repair above is run.
2. **No screenshots were taken.** I could have — the earlier claim that this needed extra tooling
   turned out to be wrong. It is simply a gap.
3. **Six of the seventeen pieces of work never passed independent review**, and the plan itself
   never passed its audit either. Their *behaviour* is tested, deployed and verified; what
   repeatedly failed was the *evidence written about them*. The full per-task record is §B of
   the checkpoint. Nothing there changes what you see on screen — but it is the reason to trust
   the six steps above, which you can run yourself, over any summary of mine.
4. **Person 360 is not yet trustworthy enough to drive automatic sales scoring**, which is the
   next phase's job. Three specific reasons are listed in §H of the checkpoint.

---

## If something looks wrong

| What you see | What it probably means | What to do |
|---|---|---|
| A page won't load right after a deploy | The server takes 60–90 seconds to come back up | Wait a minute and reload |
| Stage shows bare `explorer` | The screen is not reading the new stage label | Report it — this is the Phase 2 fix failing |
| `0 / 0 / 0` for someone never scored | Absence being shown as a real score | Report it — this is the exact bug Phase 2 guards against |
| A paying student shows as unpaid | Conversion is reading the wrong source | Report it immediately — this is the opposite of the intended fix |
| "Not linked to GoHighLevel" | Normal. Most people were never pushed to the CRM | Nothing |

**Reporting one of these is more useful than working around it.** Each row above has a test behind
it, so a real occurrence means a test is wrong — which is worth knowing.

---

## Rollback

You do not need to do this yourself, but so it is written down:

1. **One column WAS added.** Phase 2 added `explorer_entered_at` to the `enrollments` table. It is
   empty for everybody today, nothing reads it yet, and leaving it in place is harmless — but an
   earlier version of this line said "no column was added", which was simply wrong and contradicted
   the checkpoint beside it.
2. **To put the previous version back:** redeploy the previous image using the same deploy command,
   or revert the merge on `main`.
3. **The riskiest thing in this phase is the repair script, and on 2026-10-13 Ali authorised it and
   it RAN.** An earlier version of this line said it had not. It changed **56 records** out of 630:
   37 moved into the Explorer programme, 19 had their access level corrected to guest. No record
   was created or deleted — the table still holds 630 rows.

   **To undo it**, the script wrote a log of exactly which record changed from what to what, saved
   on the server at `/root/t207-ledger-20261013.json`, and it can replay that log backwards:

   ```
   docker exec accelerator-backend node dist/scripts/backfillFreeAccountCoherence.js \
     --invert /root/t207-ledger-20261013.json --confirm-production
   ```

   Two honest caveats. **All 56** of those records have an empty "entered the programme on" date,
   and no piece of work currently owns filling it in — that date has in fact never been filled in
   for anybody. And the script printed `committed NaN` instead of a record count when it finished —
   a defect in its own reporting, not in the write, now fixed; the change was confirmed by counting
   the table directly before and after.

---

## Where each claim above lives in the code

Added because this repository's citation gate requires every document that makes a claim about the
code to point at the code. Each line is `path:line` followed by a string that occurs exactly once
in that file, so a reader can confirm the claim without being able to read TypeScript.

- The stage label you should see in Step 3:
  `frontend/src/adminOs/personStages.ts:38` → "explorer: 'Explorer ($0 to start)'"
- The sentence you should see in Step 5 when nobody has been scored:
  `frontend/src/components/admin/person/ExplorerScoreTab.tsx:43` → "This is not a score of zero."
- Why the 86 accounts are invisible — the filter asks for the programme and the status, and never
  the access level:
  `backend/src/services/explorerGrowth/explorerIdentityBridge.ts:122` → "where: { enrollment_type: 'explorer', status: 'active' },"
- What "converted" now means, which is the defect this phase existed to fix:
  `backend/src/services/adminOs/conversionState.ts:84` → "export const IS_CONVERTED_SQL"
