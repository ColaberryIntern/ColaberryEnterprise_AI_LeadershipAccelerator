# Sales Rep Configuration Contract and Multi-Brand Routing

**Phase 1, task 6.** Session `CC-20261005-r6h2`. Against `origin/main` @ `541305a6`.

§7 requires that the first rep be **rep #1, not the schema**. This document says which §7
fields already have a home, which do not, what the narrowest honest new model is, and how
routing works as configuration rather than as code.

Observed facts carry citations. Forward-looking choices are labelled **DECISION**.

---

## Part 1 — Does a rep configuration model exist today?

**No.** No model in `backend/src/models/` is keyed to the admin-user table as configuration.
The admin user carries eight columns and none of them is routing data:

`backend/src/models/AdminUser.ts:22` → "  declare role: string;"

The nearest two candidates are worth naming precisely, because §7 says to introduce a
dedicated model **only** if the existing one cannot safely hold the data.

### Candidate 1 — the journey policy table

It already holds brand, queue, assignee and daily capacity, and it is already wired into
assignment:

`backend/src/models/GrowthJourneyPolicy.ts:69` → "  declare owner_queue: string | null;"
`backend/src/models/GrowthJourneyPolicy.ts:70` → "  declare daily_capacity: number | null;"
`backend/src/models/GrowthJourneyPolicy.ts:73` → "  declare assigned_to_id: string | null;"

The assignment path reads exactly that row:

`backend/src/services/growthJourney/handoffs/assignment.ts:59` → "    where: { brand_id: row.brand_id, policy_type: 'queue_assignee', owner_queue: row.owner_queue, status: 'active' },"

**What it cannot hold:** it is keyed per **brand × queue**, not per person. A rep's timezone,
working hours, availability and external CRM identifiers are properties of the *human*, not
of a queue, and there is nowhere on this row for them. Putting them here would mean one
rep's timezone stored once per queue they own, with no single source for it.

### Candidate 2 — the knowledge-base contact directory

It carries exactly the human attributes the policy table lacks:

`backend/src/models/ResponsiblePerson.ts:24` → "  declare time_zone: string | null;"
`backend/src/models/ResponsiblePerson.ts:23` → "  declare work_hours: string | null;"
`backend/src/models/ResponsiblePerson.ts:25` → "  declare calendar_link: string | null;"

**What it cannot hold:** it has no account link, no brand, and no capacity. It is a
"who answers this question" directory for knowledge-base answers, and nothing in the handoff,
assignment or campaign path reads it. Overloading it would couple answer rendering to send
routing.

---

## Part 2 — Every §7 field, and whether it has a home

| §7 field | Home today | Where |
|---|---|---|
| internal user/admin id | **yes** | admin user table |
| display name | **yes** | admin user table |
| active / inactive | **yes** | policy `status` |
| brand assignments | **yes** | policy `brand_id` |
| programme / offer assignments | **partly** | brand-offer policy governs legality, not rep ownership |
| owner queue(s) | **yes** | policy `owner_queue` |
| timezone | **no home on an account** | exists only on the KB directory |
| daily capacity | **yes** | policy `daily_capacity` |
| working status / availability | **no** | `ABSENT` |
| GHL account / sub-account key | **no** | `ABSENT` on every staff model |
| GHL location id | **no** | `ABSENT` on every staff model |
| GHL user id | **no** | `ABSENT` on every staff model |
| GHL calendar id | **no** | `ABSENT` on every staff model |
| calendar enabled | **no** | `ABSENT` |
| future priority / weight | **no** | `ABSENT` |
| last successful GHL sync | **no** | `ABSENT` |
| routing fallback rules | **partly** | the default-account fallback exists for GHL accounts, not for reps |

**Six of seventeen have a real home; four more are partial; seven are absent.** No staff
model in the repo has a CRM-identifier field at all, for anyone — this is not a gap specific
to one rep.

---

## Part 3 — DECISIONS

### DECISION 1 — One new per-human model, narrowly scoped, and nothing is moved into it

A dedicated rep-configuration model is introduced in Phase 4, holding **only** the fields
with no home: timezone, availability, the four GHL identifiers, calendar-enabled, the
optional distribution weight, and the last-sync timestamp. It is keyed to the admin user.

**Brand, queue, assignee and capacity stay where they are.** They work, they are wired into
assignment, and moving them would be a migration with no benefit. §7's test is whether the
existing model can *safely hold* the data — for those four it can, and for the other seven
it cannot.

*Rejected alternative: extend the KB directory.* It has the human attributes and none of the
account linkage, and it is read by answer rendering. Adding routing to it would make a
knowledge-base row load-bearing for sends.

*Rejected alternative: put everything in the policy table's JSON settings column.* It would
avoid a migration and make a rep's timezone unqueryable, duplicated per queue, and invisible
to a schema reader.

### DECISION 2 — Credentials never live on the rep row

Per the standing constraints: per-rep **identifiers** (location id, user id, calendar id) are
configuration and may sit on the rep row. **Credentials stay in the settings store**, keyed
by account, exactly as the GHL account keys already are. A rep row names *which* account it
uses; it never carries the key to it.

### DECISION 3 — Routing is configuration, and the evidence is that no special case exists

A repo-wide search for a name-based rep special case — `name === 'Rose'` and its variants
across `backend/src` and `frontend/src` — returns **nothing**. Routing is already decided by
the policy row quoted in Part 1, not by an identity check in code. That property must survive
Phase 4.

The four routing lines §7 names, expressed as configuration over the existing shape:

| Brand | Queue | Assignee | Needs new code? |
|---|---|---|---|
| Colaberry Training → first rep | `admissions` | policy row | no |
| AI Flotation → future rep B | `solution_architect` | policy row | no |
| Colaberry Enterprise → future rep C | `sales` | policy row | no |
| CPN paid-conversion → configured rep | `admissions` | policy row | no |

**None of the four needs code.** Each is one row in the existing policy table, which is the
property §7 is asking for. The brand slugs those rows key on are real and seeded — for example:

`backend/src/seeds/ecosystemSeedData.ts:129` → "        slug: 'colaberry-training',"

Eight brands are seeded in total and four carry journey programmes; the full list is in
`CURRENT_STATE_INVENTORY.md`. (Named in prose here rather than cited one by one, and prose is
not evidence — the one citation above is.)

### DECISION 4 — Queue ownership stays a policy string, not an RBAC role

The standing constraints forbid a new RBAC role, and the existing design already treats a
queue as a string an operator maps to a person. That stays. The only role-model work in
Phase 4 is making two existing vocabularies agree, which is gap E3.

---

## Part 4 — What the repo knows about the first rep

§7 says to discover authoritative values rather than invent them, and to make it a checkpoint
question if they cannot be found. So, precisely:

**The name in this repo is spelled `Roselen`, not `Rose`.**

`backend/src/seeds/seedKbData.ts:60` → "      name: 'Roselen',"

That is a knowledge-base contact row. She also appears in project-management scripts with the
role "Admissions & Sales" and a note that she is not yet provisioned on the project board.

**`Rose` as a standalone word appears exactly once in `backend/src` and `frontend/src`**, and
it is a comment in a one-off script, not an entity. Positive control for that search: the
string `Roselen` matches 11 files under `backend/src`, so the search form finds what is there.

**What does not exist, each verified by its own search:** no admin-user row for her, no brand
assignment, no queue-assignee policy row, no daily capacity, no GHL account key, no GHL
location id, no GHL user id, no GHL calendar id. The only calendar field that exists for her
at all is the KB directory's link column, and it is unset.

Four other people *are* provisioned with the sales role in provisioning scripts. She is in
none of them.

**So three of the four Phase 1 checkpoint questions are genuinely for Ali** — which brands
she owns, which GHL sub-account she uses, and whether she already has an authoritative GHL
user and calendar. None is discoverable, and none should be guessed. What this document *has*
done is reduce them from open questions to a short list of values that drop into named
configuration fields.

---

## Part 5 — What a Phase 4 reviewer should be able to check

1. Adding a second rep requires **zero** code changes — only rows.
2. No name-based identity check exists anywhere in the rep path, asserted rather than assumed.
3. A rep row carries identifiers and never a credential, asserted by a test.
4. A rep configured for a brand they do not own cannot receive that brand's handoffs.
5. Timezone and availability have exactly one home, and it is not the KB directory.
6. The brand × queue policy rows are unchanged by the new model's introduction.

## Part 6 — Known limits

- **The seventeen-field table counts fields, not columns.** "Has a home" means some existing
  model can hold it safely, not that anything writes it today — most of these are unwritten.
- **Nothing here is implemented.** Every DECISION is intent for Phase 4.
- **The absence findings are source-level.** A production database could in principle hold a
  policy row for her that no seed creates; this phase takes no database read, so the honest
  claim is that nothing in source provisions one.
