# Team Roster + How To Tag Each Other

**Source of truth for who's who on the AI Systems Architect Accelerator launch. Use Basecamp @-mentions; CB watches them and acts when tagged.**

---

## The roster

| Handle | Name | Role | Basecamp ID | Email | Their brief |
|---|---|---|---|---|---|
| `ali` | Ali Muwwakkil | Executive Sponsor | 17454835 | ali@colaberry.com | `19-ali-decisions.md` |
| `kes` | Kes Delele | AI Systems Architect | 52330127 | kes@colaberry.com | `10-kes-ai-systems.md` |
| `sohail` | Sohail Syed | Marketing Lead | 47335940 | sohail@colaberry.com | `13-sohail-marketing.md` |
| `swati` | Swati Raman | Curriculum + TWC Compliance | 48041031 | swatiraman1511@gmail.com | `11-swati-curriculum-twc.md` |
| `aleem` | Aleem | Creative Director | 47335967 | aleem@colaberry.com | `12-aleem-creative.md` |
| `tejesh` | Sai Tejesh | Website Lead (`training.colaberry.com`) | 50567410 | saitejesh@colaberry.com | `14-tejesh-website-training.md` |
| `jackie` | Jackie Chalk | Community + Events | 37184021 | jackie@colaberry.com | `15-jackie-events.md` |
| `taiwo` | Taiwo Oludimimu | Admissions Operations | 33623344 | taiwo@colaberry.com | `16-taiwo-admissions.md` |
| `roselen` | Roselen | Sales / Admissions human-in-the-loop | **BLOCKED** | (pending) | `18-roselen-sales.md` |
| `dhee` | Dheeraj Garg | Operations Assistant (Ali, India) | 34920126 | dhee@colaberry.com | `17-dheeraj-ops.md` |
| `cb` | CB System | AI Execution Queue | 37708014 | vishnu@colaberry.com | `05-cb-pmo-contract.md` |

**Roselen blocker:** not yet on Basecamp account 3945211. Ali to provision. Sales tasks land "unassigned" until then; CB will reassign automatically once `roselen` appears in `launchPmoTeam.js`.

---

## Who approves what

**Design Approval:** Ali + Aleem
**Marketing Approval:** Ali + Sohail
**Curriculum Approval:** Swati + Ali
**System Approval:** Kes + Ali
**Final Launch Approval:** Ali (single signer)

---

## When to tag whom

| You need... | Tag |
|---|---|
| Strategic decision | `@Ali` |
| AI / platform implementation help | `@Kes` (architect) + `@CB` (executor) |
| Marketing copy / message refinement | `@Sohail` |
| Curriculum content + TWC question | `@Swati` |
| Design opinion / visual sign-off | `@Aleem` |
| `training.colaberry.com` change | `@Sai Tejesh` |
| Open House / event question | `@Jackie` |
| Enrollment / subscription data | `@Taiwo` |
| Sales call / customer-facing | `@Roselen` (once on BC; until then `@CB` flags it) |
| Manual research / admin task | `@Dheeraj` |
| Anything CB v1 can execute autonomously | `@CB System` |

---

## How CB handles your @-mention

When you `@CB System` on any todo or comment in the project, CB's inbound dispatcher picks it up within ~3 min (cron poll). If your request is:

- **A clean keyword recipe** (`grep:`, `ccpp:`, `gmail:` followed by query) — CB returns the result inline.
- **Open-ended** (most things) — CB classifies via gpt-4o, picks the right tool, executes if possible, otherwise queues a follow-up + summarizes what it queued in a reply to you.

Every CB reply is signed (you see it from "CB System" in Basecamp). If something looks wrong, just reply on the same thread — CB reads conversation history.

---

## Escalation cadence (CB enforces)

| Days overdue | What CB does |
|---|---|
| 1 | Reminder comment on the task |
| 3 | Escalation comment + tag area lead |
| 5 | Notify Ali (daily exec email + a comment on the task) |
| 7 | Tagged `CRITICAL_RISK` on the Launch Readiness Dashboard |

---

## Basecamp project link

**AI Systems Architect Accelerator:** https://3.basecamp.com/3945211/projects/47502609

Open this, drill into your area todolist, your assigned todos are in there with full briefs.

---

## How to add yourself to a different brief

If you find that another brief contains a task you should be doing (or you find a task in your brief that should belong to someone else), comment on the Basecamp todo `@CB System` and CB will reassign. Don't reassign manually in BC; CB tracks all moves.
