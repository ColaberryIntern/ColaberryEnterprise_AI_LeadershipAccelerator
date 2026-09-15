# Human Ownership Map (Program Phase 0)

**Session:** CC-20260915-a1x7 · **Date:** 2026-09-15 · **Source of truth:** read-only queries against `accelerator_prod` (`org_members`, `admin_users`, `enrollments`, `ai_agents`), run on 2026-09-15. Nothing here was inferred from a first name; every match is an exact row.

The mission supplied eight names and left two owners to be resolved. `reports_to_type: 'human'` targets `org_members.id` (observed on all six human-targeted `ai_agents` rows today), so an accountable human must have an `org_members` row in the Colaberry organisation. A manager can only reach the Agent Detail / Talk surface with an `admin_users` login whose email matches that `org_members.email`, so that column matters too.

## Resolution table

| # | Domain | Named | Exact `org_members` row (org Colaberry) | Full name (`enrollments`) | Team | `admin_users` login | Status |
|---|---|---|---|---|---|---|---|
| 1 | Learner Success (Reese) | *resolve* | `kesetebirhan@gmail.com` `3df017df-affa-49ab-884f-a99a4bd2ef4e` | Kesetebirhan Delele | Operations | none | **DECIDE** (see Reese's chain below) |
| 2 | Marketing Intelligence & Brand | Sohail | `sohail@colaberry.com` `4e255894…` | Sohail Syed | Marketing | yes, `admin` | resolved |
| 3 | Product Experience & UI/UX | Aleem | `aleem@colaberry.com` `d2efd70b…` | Mohammed Abdul Aleem | Marketing | **none** | resolved; no login |
| 4 | Curriculum, Learning & Certification | Swait | no row matches "Swait"; `swati@colaberry.com` `5db87b51…` | Swati Raman | Operations | **none** | **ASK once: is Swait = Swati Raman?** |
| 5 | Admissions & Applicant Experience | Taiwo | `taiwooludimimu@gmail.com` `1fbb5316…` | Taiwo Oludimimu | Operations | **none** | resolved; already `reports_to` target for 4 agents; no login |
| 6 | Sales, Enrollment & Subscriptions | Roselyn | **no row in `org_members`, `admin_users`, or `enrollments`** | — | — | none | **ASK once: absent from every identity table** |
| 7 | Internship & Career Readiness | Dhee | **no `org_members` row** | — | — | yes, `dhee@colaberry.com` `admin` | **ASK once: needs an `org_members` row before `reports_to` can point at Dhee** |
| 8 | Website Portfolio & Conversion | Tejesh | `saitejesh@colaberry.com` `5ebf1a6f…` | Sai Tejesh Kowtharapu | Marketing | yes, `admin` (plus `saitejesh+sales@` `sales`) | resolved |
| 9 | Platform Automation & Reliability | Kes | `kesetebirhan@gmail.com` `3df017df…` | Kesetebirhan Delele | Operations | **none** | resolved; already `reports_to` target for `workforce_intelligence_engine`; no login |
| 10 | Executive Intelligence & Governance | *resolve with Ali* | `ali@colaberry.com` `f179c222-284e-4180-a335-cca9e4918b2e` is the only `org_members` row with role `manager` (team Exec) | Ali Muwwakkil | Exec | yes, `super_admin` | **DECIDE with Ali; not assumed** |

Full ids are in the run directory (`.loop-architect/runs/20260915-ai-employee-consolidation/`) and reproducible with the queries below.

## Reese's current chain, verified

```
Reese  --reports_to (agent)-->  workforce_intelligence_engine  --reports_to (human)-->  Kes (kesetebirhan@gmail.com)
                                 ^ enabled = false
```

Reese's accountable human today is **Kes**, one hop removed, through an agent that is **disabled**. The mission's Section 11 says missing manager identity blocks release; a chain through a disabled intermediary resolves, but it is not the "verified chain to one real human" the mission asks for. Decision for Ali: keep Kes as Reese's human (direct, not via the engine), or name someone else for Learner Success. Kes is also the roster's Platform owner; the mission allows one human to oversee several employees.

## The fleet's reporting graph today

| Target | Kind | Agents reporting to it |
|---|---|---|
| CoryBrain | agent (→ Ali) | 12 |
| workforce_intelligence_engine | agent (→ Kes), disabled | 5 |
| Taiwo Oludimimu | human | 4 |
| Ali Muwwakkil | human | 1 (CoryBrain) |
| Kes Delele | human | 1 (workforce_intelligence_engine) |
| *(none)* | | **223 of 246**, of which **160 are enabled** |

## Program prerequisite: manager access

Four resolved owners, Aleem, Swati, Taiwo and Kes, have **no `admin_users` login**, so they cannot open their employee's Agent Detail or Talk tab today. `MANAGER_AUTHORIZATION_MAP.md` (2026-08-27) proposed resolving the manager by `OrgMember.email = AuthPayload.email`; that requires an admin login per accountable human. Each employee's Phase 1 must state how its manager will reach it (an `admin_users` row with a scoped `mgmt_role`, or an alternative surface), and Phase 5 must verify the manager actually did.

## Open questions for Ali (asked once, here)

1. **Swait:** confirm Swati Raman (`swati@colaberry.com`) is the Curriculum owner, or name the right person.
2. **Roselyn:** no record exists. Provide the email, or name a different Sales owner.
3. **Dhee:** has an admin login but no `org_members` row. Approve adding one (additive, one row, `dhee@colaberry.com`, org Colaberry) when the Internship employee's Phase 1 begins, or name a different owner.
4. **Reese:** keep Kes as her accountable human (directly), or reassign Learner Success.
5. **Executive:** name the accountable human. Ali is the only `manager` in `org_members`; the mission forbids assuming.

## Queries used (read-only)

```sql
select om.email, om.role, om.invite_status, om.id from org_members om join organizations o on o.id=om.org_id where om.email ilike '%<name>%';
select email, role, display_name, id from admin_users where email ilike '%<name>%' or display_name ilike '%<name>%';
select om.email, e.full_name, om.team, om.role from org_members om left join enrollments e on e.id=om.enrollment_id where om.email in (...);
with recursive chain as (...) -- Reese's reports_to walk, depth-bounded at 6
select a.reports_to_type, coalesce(om.email, a2.agent_name) target, count(*) from ai_agents a left join org_members om on om.id=a.reports_to_id left join ai_agents a2 on a2.id=a.reports_to_id where a.reports_to_id is not null group by 1,2;
```
