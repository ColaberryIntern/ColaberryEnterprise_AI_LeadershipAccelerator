# Knowledge Operations System — Technical Specification

**Project:** Colaberry AI Accelerator — Cora Inbox & Synthflow Knowledge Base  
**Version:** 1.0 — Draft for Ali review  
**Date:** 2026-07-04  
**Authors:** Kes Delele, Claude Code (CC-20260703-m9x4)  
**Status:** Awaiting Ali approval before implementation begins

---

## 1. Problem Statement

The current knowledge base is split across three places that cannot talk to each other:

| Source | What it holds | Problem |
|---|---|---|
| Google Sheet rubric | Routing rules, escalation thresholds, responsible persons | Not queryable by Cora; must be manually kept in sync with Synthflow |
| Static JS files (`frontend/public/knowledge/`) | AI Accelerator Q&A content | Not editable without a code deploy; no routing metadata |
| Synthflow internal KB | Merged copy of the above | Becomes stale immediately; no single source of truth |

When a new cohort opens, dates appear in individual entry answers. Updating for Cohort 2 means hunting through every entry by hand — error-prone and guaranteed to miss something.

**Goal:** One database table as the single source of truth for both Q&A content and routing metadata. Dates, pricing, and URLs live in a `cohorts` record. Answer templates reference cohort fields via merge tags. Changing a cohort record propagates everywhere instantly.

---

## 2. Data Model

### 2.1 `courses`

One row per program offered by Colaberry.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | VARCHAR(200) | e.g. "AI Systems Architect Accelerator" |
| `slug` | VARCHAR(100) UNIQUE | e.g. "ai-architect" |
| `description` | TEXT | |
| `is_active` | BOOLEAN | Hide retired courses from admin UI |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### 2.2 `cohorts`

One row per class run. Only one cohort per course may have `is_active = true` at a time (enforced by partial unique index).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `course_id` | UUID FK → courses | |
| `name` | VARCHAR(100) | e.g. "Founding Cohort", "Cohort 2" |
| `cohort_number` | INTEGER | 1, 2, 3… |
| `open_house_date` | VARCHAR(100) | Human-readable: "Thursday, July 16, 2026" |
| `open_house_url` | VARCHAR(500) | |
| `start_date` | VARCHAR(100) | Human-readable: "Thursday, July 23, 2026" |
| `end_date` | VARCHAR(100) | |
| `expo_date` | VARCHAR(100) | e.g. "October 2026" |
| `price_annual` | INTEGER | Monthly rate on annual plan (cents or whole dollars) |
| `price_monthly` | INTEGER | Month-to-month rate |
| `seats_total` | INTEGER | |
| `seats_remaining` | INTEGER | |
| `enrollment_url` | VARCHAR(500) | |
| `waitlist_url` | VARCHAR(500) | |
| `is_active` | BOOLEAN | Exactly one TRUE per course |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

**Constraint:** `UNIQUE (course_id) WHERE is_active = true`

### 2.3 `cora_kb_entries`

One row per question type. Replaces the Google Sheet rubric and the static JS KB files.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `course_id` | UUID FK → courses, **nullable** | NULL = entry applies to all courses |
| `main_category` | VARCHAR(100) | Program Basics, Pricing & Enrollment, etc. |
| `sub_category` | VARCHAR(100) | |
| `question_pattern` | TEXT | How the question typically arrives |
| `answer_template` | TEXT | May contain `{{cohort.X}}` and `{{course.X}}` merge tags |
| `primary_person_id` | UUID FK → responsible_persons | Escalation target |
| `team_person_ids` | UUID[] | Day-to-day handlers (Postgres array) |
| `escalation_logic` | TEXT | Override; default thresholds apply if NULL |
| `priority` | ENUM('High','Medium','Low') | |
| `response_time` | VARCHAR(50) | e.g. "< 2 hours" |
| `automation_potential` | ENUM('High','Medium','Low') | |
| `emotional_tone` | VARCHAR(100) | |
| `calendar_link` | VARCHAR(500) | Auto-filled from primary_person |
| `email_examples` | TEXT | |
| `keywords` | TEXT | Comma-separated |
| `notes` | TEXT | Internal only |
| `is_active` | BOOLEAN | Inactive entries excluded from Cora + Synthflow |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### 2.4 `responsible_persons`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | VARCHAR(200) | |
| `email` | VARCHAR(200) | |
| `phone` | VARCHAR(50) | |
| `work_hours` | VARCHAR(100) | e.g. "Mon–Fri, 9AM–5PM" |
| `time_zone` | VARCHAR(50) | e.g. "CST (UTC−6)" |
| `calendar_link` | VARCHAR(500) | |
| `areas` | TEXT[] | Role tags: ["Admissions", "Customer Support"] |
| `shift_note` | VARCHAR(200) | For support staff with rotating shifts |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

## 3. Merge Tag System

Answer templates may embed merge tags. At resolution time (Cora query, Synthflow export, admin preview), the system substitutes the tag value from the active cohort for the relevant course.

### 3.1 Available tags

| Tag | Resolves to | Example |
|---|---|---|
| `{{cohort.name}}` | Cohort name | Founding Cohort |
| `{{cohort.number}}` | Cohort number | 1 |
| `{{cohort.open_house_date}}` | Open house date string | Thursday, July 16, 2026 |
| `{{cohort.open_house_url}}` | Open house registration URL | enterprise.colaberry.ai |
| `{{cohort.start_date}}` | First class date string | Thursday, July 23, 2026 |
| `{{cohort.end_date}}` | End date string | October 15, 2026 |
| `{{cohort.expo_date}}` | Expo/demo date string | October 2026 |
| `{{cohort.price_annual}}` | Annual plan monthly rate | $149 |
| `{{cohort.price_monthly}}` | Month-to-month rate | $199 |
| `{{cohort.seats_total}}` | Total seats | 40 |
| `{{cohort.seats_remaining}}` | Remaining seats | 12 |
| `{{cohort.enrollment_url}}` | Enrollment page URL | enterprise.colaberry.ai |
| `{{cohort.waitlist_url}}` | Waitlist page URL | enterprise.colaberry.ai/waitlist |
| `{{course.name}}` | Course full name | AI Systems Architect Accelerator |
| `{{course.slug}}` | Course slug | ai-architect |

### 3.2 Fallback behavior

If a merge tag references a field that is empty or NULL on the active cohort, the tag resolves to `[TBD]` and the entry is flagged in the admin UI as **incomplete** (amber warning). Synthflow export skips entries with unresolved `[TBD]` tags unless the operator overrides.

### 3.3 Resolution scope

- **Cora Inbox:** resolves against the active cohort for the course matched by the routing logic.
- **Synthflow export:** resolves against active cohort at export time; exports plain text.
- **Admin preview:** resolves live against the selected cohort in the preview dropdown.
- **Course-agnostic entries** (`course_id = NULL`): merge tags are resolved against the most recently active cohort across all courses (best-effort; flag in UI if ambiguous).

---

## 4. New Cohort Workflow (Admin)

When a new class opens:

1. **Courses tab → Add Cohort** — fill in the cohort form (dates, pricing, URLs, seat count). Save as inactive.
2. **Review entries** — use the Preview button in each entry modal to verify resolved answers look correct for the new cohort.
3. **Activate cohort** — toggle `is_active` on the new cohort. The system automatically deactivates the previous cohort for that course.
4. **Export to Synthflow** — KB Entries tab → Export for Synthflow. Tags are resolved against the newly active cohort. Upload CSV to Synthflow.

No code changes. No entry edits. One form per cohort.

---

## 5. Admin UI Specification

### 5.1 KB Entries tab

**Changes from current mockup:**
- Entry table gains a **Course** filter dropdown.
- Entry edit modal gains:
  - **Course** dropdown (NULL = all courses).
  - **Answer Template** textarea with a **Preview** button. Preview resolves merge tags against the active cohort for the selected course and displays rendered text below the textarea.
  - **Merge Tag Reference** collapsible panel listing all available tags with their current resolved values.
- Entries with unresolved `[TBD]` tags show an amber warning badge in the table row.

### 5.2 Responsible Persons tab

No structural changes. Person cards already show multiple role areas and shift notes.

### 5.3 Cohorts tab (new)

**Layout:** One accordion section per course. Inside each section:

- **Active cohort card** — highlighted, shows all date/price/seat fields, edit button.
- **Past cohorts table** — name, dates, seats filled, deactivated date.
- **Add Cohort button** — opens the cohort form modal.

**Cohort form modal fields:**

| Field | Type |
|---|---|
| Course | Dropdown (required) |
| Cohort Name | Text (e.g. "Cohort 2") |
| Cohort Number | Integer |
| Open House Date | Text (human-readable, feeds `{{cohort.open_house_date}}`) |
| Open House URL | URL |
| Start Date | Text (human-readable, feeds `{{cohort.start_date}}`) |
| End Date | Text |
| Expo / Demo Date | Text |
| Annual Price ($/mo) | Number |
| Monthly Price ($/mo) | Number |
| Total Seats | Number |
| Remaining Seats | Number |
| Enrollment URL | URL |
| Waitlist URL | URL |
| Set as Active | Toggle |

**Validation:** If "Set as Active" is toggled on, the modal warns that the current active cohort for this course will be deactivated. Requires explicit confirmation.

---

## 6. Synthflow Export

The 16-column CSV format matches the existing Google Sheet rubric structure. At export time:

1. Fetch all `is_active = true` entries for the selected course (or all courses).
2. Resolve all merge tags against the active cohort for each entry's course.
3. Skip entries with unresolved `[TBD]` tags (log skipped count).
4. Write CSV: Main Category, Sub Category, Question from Email, Response Type, Template Answer, Responsible Person, Escalation Logic, Priority, Response Time, Automation Potential, Emotional Tone, Calendar Link, Email Examples, Common Patterns, Keywords, Notes.

Column mapping:

| CSV Column | Source |
|---|---|
| Template Answer | `answer_template` with merge tags resolved |
| Responsible Person | `responsible_persons.name` via `primary_person_id` |
| Calendar Link | `responsible_persons.calendar_link` via `primary_person_id` |
| Common Patterns | Comma-joined names of all `team_person_ids` members |

---

## 7. Cora Integration

Cora queries `cora_kb_entries` at runtime via the existing `/api/portal/cora` endpoint. Changes required:

- Pass `course_id` context with each query (derived from the incoming email's program context).
- Join against `cohorts WHERE is_active = true AND course_id = ?` to get merge tag values.
- Resolve merge tags in `answer_template` before returning the answer.
- Return `primary_person_id` and `team_person_ids` as part of the routing payload.

The existing `coraKnowledgeBase.ts` and `coraKnowledgeBaseQA.ts` are replaced by this DB-backed query. The static files are retired once the DB is seeded and verified.

---

## 8. API Endpoints Required

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/kb/entries` | List entries (filterable by course, category, active) |
| POST | `/api/admin/kb/entries` | Create entry |
| PUT | `/api/admin/kb/entries/:id` | Update entry |
| DELETE | `/api/admin/kb/entries/:id` | Soft-delete (set is_active=false) |
| GET | `/api/admin/kb/persons` | List responsible persons |
| POST | `/api/admin/kb/persons` | Create person |
| PUT | `/api/admin/kb/persons/:id` | Update person |
| GET | `/api/admin/kb/courses` | List courses |
| GET | `/api/admin/kb/cohorts` | List cohorts (filterable by course) |
| POST | `/api/admin/kb/cohorts` | Create cohort |
| PUT | `/api/admin/kb/cohorts/:id` | Update cohort |
| POST | `/api/admin/kb/cohorts/:id/activate` | Activate cohort (deactivates current) |
| GET | `/api/admin/kb/export/synthflow` | Download Synthflow CSV (resolved) |
| GET | `/api/admin/kb/preview` | Preview resolved answer for a given entry + cohort |

All admin endpoints gated by `requireAdmin` middleware.

---

## 9. Phase Plan

### Phase 1 — Core (estimated: 3–4 days)

- DB migrations: `courses`, `cohorts`, `cora_kb_entries`, `responsible_persons`
- Seed: AI Accelerator Founding Cohort + 26 entries + 8 persons
- API: all endpoints above
- Admin UI: KB Entries tab + Cohorts tab (replaces static file editing)
- Cora reads from DB (retire `coraKnowledgeBase.ts`)
- Synthflow export with merge tag resolution

### Phase 2 — Public KB site (estimated: 1–2 days)

- `frontend/public/knowledge/` static JS files replaced by DB queries
- Public-facing KB page reads same `cora_kb_entries` table filtered to `is_active = true`
- No more git-deploy required to update KB content

### Phase 3 — Multi-course (estimated: 1 day, when needed)

- Second course added to `courses` table
- Course-scoped entries created for the second program
- Course filter exposed in admin UI

---

## 10. Ali-Confirmed Decisions (2026-07-06)

| # | Decision | Impact |
|---|---|---|
| 1 | Portal URL: `enterprise.colaberry.ai` | All enrollment links and `cohorts.enrollment_url` seed value updated |
| 2 | Community: program portal (enterprise.colaberry.ai) + WhatsApp — no Discord, no Skool | Entry #14 (Community Access) updated accordingly |
| 3 | AI Mentor: concept carries over but will be rebuilt fresh against app data, decoupled from SQL Server / CCPP. Legacy `cai@aiagent.colaberry.com` does not carry over as-is. | AI Mentor entries in the KB use a `[PHASE 2 — NOT YET ACTIVE]` placeholder until the new agent ships |
| 4 | Single source of truth: `enterprise.colaberry.ai/knowledge/#home` | Cora Rubric + Synthflow content both map into `cora_kb_entries`; public KB reads from same table |
| 5 | Phase 1 approved: proceed | Implementation starts on `workstream/kb-ops-phase1` branch |

---

## 11. Open Questions (Kes to confirm)

- Kes's direct email and phone for the `responsible_persons` seed (currently using placeholder values).
- Confirm Balamurali Nair's email (`supportagent33@colaberry.com` is a placeholder).
- Confirm whether Jackie handles WhatsApp group *moderation only* or also direct DM support.

---

*This document was generated from the admin UI mockup session. The interactive HTML mockup is at `docs/admin-knowledge-ops-mockup.html` in the repo.*
