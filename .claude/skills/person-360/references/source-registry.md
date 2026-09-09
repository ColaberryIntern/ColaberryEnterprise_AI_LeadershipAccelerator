# Person-keyed source registry

Every table in `accelerator_prod` that can be attached to a human being, with what
the 360 profile does about it.

**Measured 2026-09-09** against three real people chosen for different shapes:
`farhat@colaberry.com` (heavy learner, org member), `mungama2016@gmail.com`
(re-enrolled, one active + two withdrawn), `qninying@gmail.com` (13 failed payments,
client project work).

`Rows` = rows held for those three combined. It measures *whether a source is real*,
not its platform total.

Re-run the audit in `../SKILL.md` and diff against this file. **A table with rows that
is not listed here is a gap.**

---

## Wired — read by a panel

### Class and curriculum → `panels/classPanels.ts`

| Table | Key | Rows | Shown as |
|---|---|---|---|
| `timeline_card_progress` | enrollment_id | 3,884 | Curriculum completion, quiz scores, attempts, last completed |
| `attendance_records` | enrollment_id | 33 | Attendance rate and per-session register |
| `session_presence_events` | enrollment_id | 94 | Live-room joins and leaves |
| `session_poll_responses` | enrollment_id | 91 | Polls answered |
| `session_pulse` | enrollment_id | 23 | Pulse checks |
| `reflection_entries` | enrollment_id | 29 | Written reflections |
| `timeline_survey_responses` | enrollment_id | 29 | Surveys |
| `live_sessions` | (join) | — | Session titles and dates |
| `timeline_cards` | (join) | — | Card titles, types, week numbers |

### Work product → `panels/workPanels.ts`

| Table | Key | Rows | Shown as |
|---|---|---|---|
| `projects` | enrollment_id | 5 | Name, client org, stage, health/velocity/stability, repo, portfolio |
| `student_task_lists` | project_id | 32 | Open and done task counts per project |
| `capstone_records` | enrollment_id | 4 | Capstone status, visibility, publication |
| `case_studies` | **via `projects`** | 1 | Title, client org, capability, publication count |
| `case_study_publications` | case_study_id | — | Times published |
| `case_study_snapshots` | case_study_id | — | Snapshot count |
| `career_portfolio_pages` | enrollment_id | 2 | Portfolio page status |
| `runtime_portfolio_artifacts` | enrollment_id | 148 | Artifacts produced |
| `cert_sessions` | enrollment_id | 0 | Cert attempts (3 exist platform-wide) |
| `cert_evidence_mappings` | enrollment_id | 0 | Evidence mapped to objectives |

### Account and billing → `panels/accountPanels.ts`

| Table | Key | Rows | Shown as |
|---|---|---|---|
| `organizations` | owner_enrollment_id | — | Business accounts they own |
| `org_members` | enrollment_id | 1 | Seats they occupy, invite status |
| `lead_tenant_contexts` | lead_id | — | Which brand acquired them |
| `tenants` | (join) | — | Brand name |
| `sponsors` | contact_lead_id | — | Sponsor contact status |
| `subscriptions` | enrollment_id | 18 | Full history, **failures since last success** |
| `account_credits` | enrollment_id | 1 | Credits granted |
| `refunds` | enrollment_id | 1 | Refunds issued |
| `subscription_renewal_reminders` | enrollment_id | 4 | Last reminder sent |

### Development and context → `panels/growthPanels.ts`

| Table | Key | Rows | Shown as |
|---|---|---|---|
| `student_level` | enrollment_id | 4 | Level, rank, architect readiness |
| `student_competency` | enrollment_id | 52 | Domain confidence and evidence |
| `student_architecture_skill` | enrollment_id | 40 | Per-skill proficiency |
| `student_skill_evidence` | enrollment_id | 2,841 | Evidence count |
| `evidence_records` | enrollment_id | 173 | Records, validated share |
| `resume_skill_claims` | enrollment_id | 1 | Claims extracted from résumé |
| `xp_events` | enrollment_id | 589 | XP total |
| `student_points_events` | enrollment_id | 679 | Points total |
| `runtime_mentor_turns` | enrollment_id | 79 | Questions asked of the AI mentor |
| `learner_memory` | enrollment_id | 3 | What the mentor concluded about them |
| `runtime_assessment_attempts` | enrollment_id | 64 | Assessments, scores, pass/fail |
| `architect_evaluations` | enrollment_id | 1 | Weekly architect reviews |
| `podcast_views` | enrollment_id | 48 | Podcasts consumed |
| `blog_post_views` | enrollment_id | 86 | Articles read |
| `network_video_views` | enrollment_id | 86 | Videos watched |
| `today_feed_impressions` | enrollment_id | 712 | Feed served and interacted |
| `cape_ai_pulse_exposure` | enrollment_id | 38 | CAPE pulse exposures |
| `community_members` | enrollment_id | 4 | Level and points |
| `community_posts` | **via member_id** | 26 | Posts written |
| `community_likes` | member_id | 9 | Likes given |
| `community_points_events` | member_id | 19 | Points events |
| `community_contributions` | enrollment_id | 5 | Contributions |
| `room_memberships` | enrollment_id | 14 | Rooms joined |
| `room_messages` | enrollment_id | 8 | Messages sent |
| `friend_referrals` | enrollment_id | 1 | Friends referred |
| `user_curriculum_profiles` | enrollment_id | 2 | Company, role, goal, AI maturity |
| `onboarding_profiles` | enrollment_id | 4 | Résumé, LinkedIn |
| `github_connections` | enrollment_id | 5 | Connected repositories |

### Acquisition and sales → `panels/acquisitionPanels.ts`, `personTimelineService.ts`

| Table | Key | Rows | Shown as |
|---|---|---|---|
| `leads` | email | — | The 29-field acquisition panel |
| `visitor_sessions` | lead_id | — | Session count, sites, first/last seen |
| `page_events` | lead_id | — | Page views on the timeline |
| `behavioral_signals` | lead_id | — | Signals on the timeline |
| `intent_scores` | lead_id | — | Intent (suppressed post-conversion) |
| `activities` | lead_id | 75 | Sales activities |
| `interaction_outcomes` | lead_id | 88 | Call and email outcomes |
| `scheduled_emails` | lead_id | 66 | Emails sent |
| `communication_logs` | lead_id | 46 | Communication log |
| `campaign_leads` | lead_id | 6 | Campaign enrolment and step |
| `openclaw_responses` | lead_id | — | Outreach posts |
| `appointments` | lead_id | — | Booked appointments |
| `strategy_calls` | lead_id | — | Strategy calls |
| `automation_logs` | related_id | — | Automation runs |
| `enrollments` | email | — | Enrolment rows, stage derivation |
| `visitors` | lead_id | — | Visitor identity |

---

## Not yet wired — real rows, no panel

Each is a deliberate deferral, not an oversight. Wire when someone needs it.

| Table | Rows | Why deferred |
|---|---|---|
| `community_digest_logs` | 187 | Digest emails *sent to* them. Delivery telemetry, not behaviour. |
| `room_presence` | 43 | Ephemeral online/offline. `room_memberships` answers the durable question. |
| `community_leaderboard_entries` | 12 | Derived from points, already shown. |
| `community_notifications` | 11 | Notifications *sent to* them, not actions taken. |
| `reese_welcomes` | 10 | Outbound automation record; belongs in an automation view. |
| `build_intake` | 5 | Project intake answers. Fold into the project card when someone asks. |
| `room_booking_attendees` | 5 | Room bookings; low signal until rooms are used more. |
| `timeline_card_comments` | 3 | Comments on cards. Add to the timeline when volume justifies it. |
| `opportunity_scores` | 3 | Sales scoring; overlaps intent, which is suppressed post-conversion. |
| `lead_temperature_history` | 20 | Rendered on the Notes tab via the lead components, not as its own panel. |

---

## Excluded on purpose

| Table | Reason |
|---|---|
| `portal_handoff_tokens` | Auth credentials. Never render a token in an admin surface. |
| `delivery_client_signin_tokens` | Same. |
| `github_connections.access_token_encrypted` | Column excluded; the repo metadata is shown, the token is not. |
| `onboarding_profiles.resume_data` | Raw résumé bytes. Filename and date shown instead. |
| `*_backup_*` tables | Snapshots, not live records. Excluded by the audit query. |
| `admin_users`, `responsible_persons` | Staff identity, not the person being profiled. |

---

## Empty platform-wide — nothing to show yet

Verified `COUNT(*) = 0` across the whole table on 2026-09-09. A panel over these
would always look broken. Re-check on the next audit.

`skill_mastery` · `student_github_activity` · `student_navigation_events` ·
`delivery_engagements` · `delivery_projects` · `cohort_memberships` ·
`internship_applications` · `cert_responses` · `cert_readiness_snapshots` ·
`interview_sessions` · `mentor_review_items` · `diagnostic_attempts` · `project_dna` ·
`runtime_notes` · `artifacts` · `showcase_artifacts` · `sponsor_seats` ·
`tenant_memberships` · `case_study_collections` · `delivery_client_acceptances`

Nearly empty, worth knowing: `student_assessments` (1), `mentor_conversations` (1),
`capstone_review_approvals` (1), `cert_sessions` (3), `requirements_generation_jobs` (3).

---

## What the three test people actually looked like

Useful as a regression fixture — if a change makes these look different, ask why.

| | farhat@ | mungama2016@ | qninying@ |
|---|---|---|---|
| Enrolments | 1 active | 1 active + 2 withdrawn | 1 active |
| Stage | enrolled | **enrolled** (read "lapsed" before the `MAX` fix) | enrolled |
| Attendance | 9 present | 12 present, 1 late | 8 present, 2 late, 1 absent |
| Cards completed | 217 of 1,131 | 87 of 1,629 | 205 of 1,124 |
| Projects | 2 (Colaberry) | 1 (Keysy) | 2 (Oklahoma Turnpike Authority) |
| Case studies | 1 draft | — | — |
| Capstones | 1 draft | 1 draft | 2 draft |
| Account | org member, invited | individual | individual |
| Subscriptions | 1 active, no PaySimple | 1 active, 1 failed | 1 active, **13 failed**, 2 cancelled |
