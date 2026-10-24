/**
 * Project Presentation Studio — storage schema.
 *
 * The Studio is the workspace a student opens from a demo-prep card (PREP-1..PREP-6)
 * to learn a presentation format, prepare a story, build a deck, rehearse in a
 * recorded room, present, and submit an approved take to the community.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO.
 *
 * It does not own task completion. `markTaskVerifiedComplete`
 * (services/projects/projectWriteService.ts) remains THE ONLY writer that may set a
 * student_tasks row to 'complete', and nothing here may mint one. These tables record
 * what a student DID; whether that satisfies a task is still decided by the canonical
 * writer, and points are still gated by the unique index student_points_events_unique.
 * Keeping the two apart is what stops "a recording exists" from silently becoming
 * "the task is done" — PREP-6 in particular stays staff-verified.
 *
 * It also does not re-model what already exists. room_bookings ALREADY carries
 * related_project_id, agenda, outcome, artifact_prompt, reflection_prompt,
 * idempotency_key, recording_policy and a legal variant of 'demo'. Those columns are
 * written today and never read back, so the Studio projects them rather than
 * duplicating them. The only booking-shaped thing stored here is the attempt's
 * reference to a booking.
 *
 * FIVE INDEPENDENT STATE MACHINES, NOT ONE "complete" FLAG. Preparation status,
 * session status, recording status, evaluation result and publication status are
 * genuinely different facts about an attempt, and collapsing them into one badge is
 * how a student ends up told their demo is finished because a webhook fired. Each
 * has its own column and its own vocabulary.
 *
 * CONVENTIONS FOLLOWED FROM THE EXISTING ensure* MODULES:
 *   - bare-UUID references, not real FKs across domain boundaries
 *   - every write-facing flag defaults to the CLOSED state (nothing is public,
 *     approved or required until something explicitly says so)
 *   - partial unique indexes where a row may legitimately recur after withdrawal
 *   - every statement idempotent and safe to re-run; each is individually
 *     try/caught by the ensure function so one failure self-heals on next boot
 *
 * THE ADD COLUMN TRAP, HONOURED EXPLICITLY. `CREATE TABLE IF NOT EXISTS` is a no-op
 * against a table that already exists, so a column added to the CREATE body later is
 * never applied to a database that already ran this module — and Sequelize then
 * silently drops every write to it, forever. Unlike the older modules that only warn
 * about this, every column below ALSO appears as an explicit
 * `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. The CREATE is for a fresh database; the
 * ALTERs are what actually keep an existing one correct. Add a column in BOTH places
 * or it does not exist in production.
 *
 * AND THE SAME TRAP ONE LEVEL DEEPER: `ADD COLUMN IF NOT EXISTS` is equally a no-op
 * against a column that already exists, so WIDENING one is not covered by editing its
 * ADD COLUMN line. `audience` shipped as VARCHAR(60) while its Zod schema accepted 200,
 * and on 2026-10-08 a learner-length answer - 84 characters, an ordinary sentence -
 * passed validation and then threw at the database as a 500. Changing a column's TYPE
 * needs an explicit `ALTER COLUMN ... TYPE`, below. Widening a varchar in Postgres is
 * metadata-only, so it is safe to re-run and does not rewrite the table.
 */

import { sequelize } from '../config/database';
import { AUDIENCE_MAX } from '../schemas/presentationFieldLimits';

/** Tables this module owns. Order matters: parents before children. */
export const PRESENTATION_STUDIO_TABLES = [
  'presentation_assignments',
  'presentation_attempts',
  'presentation_recordings',
  'presentation_feedback',
  'presentation_showcases',
  'presentation_recording_views',
] as const;

/**
 * Columns added to an EXISTING table rather than created with a new one. Kept in its
 * own export so the parity suite can tell "we created this" apart from "we extended
 * someone else's table", which carries a different blast radius.
 */
export const PRESENTATION_STUDIO_FOREIGN_TABLE_COLUMNS = [
  'projects.external_url',
  'projects.external_owner',
  'projects.evidence_provenance',
  'projects.external_verified',
] as const;

export const PRESENTATION_STUDIO_STATEMENTS: string[] = [
  // ---------------------------------------------------------------------------
  // presentation_assignments — "this student owes this presentation for this task"
  //
  // One row per (project, prep task). story_id is the PREP-n string, NOT a uuid:
  // it matches student_tasks.story_id, which is the identity the whole prep
  // subsystem already keys on (unique index student_tasks_unique_story). Using the
  // same key is what lets an assignment find its task without inventing a mapping
  // table that could drift.
  //
  // template_version is stored as a value, not a pointer. An instructor editing a
  // template must not retroactively change what a student was asked to do, so the
  // version in force at assignment time is frozen here.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_assignments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     project_id UUID NOT NULL,
     story_id VARCHAR(60) NOT NULL,
     enrollment_id UUID,
     cohort_id UUID,
     template_slug VARCHAR(80) NOT NULL,
     template_version INTEGER NOT NULL DEFAULT 1,
     audience VARCHAR(${AUDIENCE_MAX}),
     duration_seconds INTEGER,
     due_on DATE,
     required BOOLEAN NOT NULL DEFAULT FALSE,
     prep_state VARCHAR(30) NOT NULL DEFAULT 'not_started',
     checklist_json JSONB NOT NULL DEFAULT '{}'::jsonb,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // ---------------------------------------------------------------------------
  // WHO WATCHED A DEMO - distinct people, not requests.
  //
  // A video player issues MANY range requests for one viewing: a HEAD-ish probe, a
  // tail read for the moov atom, then a request per seek. A counter incremented per
  // request would report hundreds of "views" for one watch and be worse than no
  // number at all, because a learner would believe it.
  //
  // So a row per (recording, viewer) and the count is the row count. Naturally
  // idempotent, immune to how chatty the player is, and it answers the question a
  // student actually asks - how many PEOPLE have seen this.
  //
  // `last_viewed_at` moves on each watch so a rewatch is visible without inflating
  // the count.
  `CREATE TABLE IF NOT EXISTS presentation_recording_views (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     recording_id UUID NOT NULL,
     viewer_enrollment_id UUID NOT NULL,
     first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_recording_views ADD COLUMN IF NOT EXISTS recording_id UUID`,
  `ALTER TABLE presentation_recording_views ADD COLUMN IF NOT EXISTS viewer_enrollment_id UUID`,
  `ALTER TABLE presentation_recording_views ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_recording_views ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ DEFAULT NOW()`,
  // The dedupe key, and what makes the count mean "people".
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_recording_views_one_per_viewer
     ON presentation_recording_views (recording_id, viewer_enrollment_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_recording_views_recording
     ON presentation_recording_views (recording_id)`,

  // ---------------------------------------------------------------------------
  // ONE PORTFOLIO ARTIFACT PER HANDED-IN RECORDING.
  //
  // `runtime_portfolio_artifacts` is a SHARED table - case studies, cert evidence
  // and the classroom portfolio rail all write it - and it carries no unique
  // constraint of any kind. A handed-in rehearsal must land there exactly once, and
  // the hand-in path can be retried, so the guard is a constraint rather than a
  // read-then-write that two requests can both win.
  //
  // PARTIAL, on `kind = 'presentation'`, so it can only ever constrain rows this
  // subsystem writes. No other kind is affected, which is what makes it safe to add
  // a presentation-specific index to somebody else's table from this module.
  //
  // Keyed on the recording ref inside the JSONB rather than on (enrollment, task):
  // the ref IS the identity of the thing being filed, and a learner who re-hands-in
  // a different take should get a second artifact, not silently overwrite the first.
  `CREATE UNIQUE INDEX IF NOT EXISTS runtime_portfolio_artifacts_one_per_recording
     ON runtime_portfolio_artifacts ((content->>'recordingRef'))
   WHERE kind = 'presentation'`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS project_id UUID`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS story_id VARCHAR(60)`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS enrollment_id UUID`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS cohort_id UUID`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS template_slug VARCHAR(80)`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS template_version INTEGER DEFAULT 1`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS audience VARCHAR(${AUDIENCE_MAX})`,
  // Widening, not adding. The ADD COLUMN above does nothing where the column is
  // already present at its old width, which is every database that ran an earlier
  // build of this module. Metadata-only in Postgres, and idempotent.
  `ALTER TABLE presentation_assignments ALTER COLUMN audience TYPE VARCHAR(${AUDIENCE_MAX})`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS due_on DATE`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS required BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS prep_state VARCHAR(30) DEFAULT 'not_started'`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS checklist_json JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // One assignment per task. This is the constraint that makes a double-submitted
  // "start preparing" click produce one row instead of two competing assignments.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_assignments_unique_task
     ON presentation_assignments (project_id, story_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_assignments_enrollment
     ON presentation_assignments (enrollment_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_assignments_cohort
     ON presentation_assignments (cohort_id)`,

  // ---------------------------------------------------------------------------
  // presentation_attempts — one try at delivering the assignment
  //
  // A student may rehearse many times; each attempt is its own row with its own
  // booking, its own recording and its own feedback. Retrying must never overwrite
  // the evidence of the previous try, which is why attempt_no is part of the key
  // rather than a mutable "latest" pointer.
  //
  // occurrence_uuid is the PROVIDER's immutable id for a specific meeting
  // occurrence. A Zoom meeting id is reused across recurrences, so matching a
  // recording on meeting id alone attaches part of Tuesday's session to Thursday's
  // attempt. The occurrence uuid is the only id that distinguishes them.
  //
  // checklist_snapshot_json is a SNAPSHOT, not a live reference: the audience and
  // recording acknowledgement a student confirmed for THIS attempt, frozen, so a
  // later edit to the checklist cannot rewrite what they agreed to.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_attempts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     assignment_id UUID NOT NULL,
     attempt_no INTEGER NOT NULL,
     mode VARCHAR(30) NOT NULL DEFAULT 'practice_solo',
     booking_id UUID,
     room_id UUID,
     occurrence_uuid VARCHAR(120),
     audience VARCHAR(${AUDIENCE_MAX}),
     checklist_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
     selected_material_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
     attempt_state VARCHAR(30) NOT NULL DEFAULT 'draft',
     recording_state VARCHAR(30) NOT NULL DEFAULT 'expected',
     is_final_take BOOLEAN NOT NULL DEFAULT FALSE,
     reflection_notes TEXT,
     join_intent_at TIMESTAMPTZ,
     started_at TIMESTAMPTZ,
     ended_at TIMESTAMPTZ,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  // WHAT THE REHEARSAL PARTNER SAID, in the learner's own words.
  //
  // PREP-4 asks for "one real rehearsal in front of one real person" and then had
  // nowhere to put what that person told you. The Reflect step was a placeholder
  // reading and writing nothing, so the notes a partner gave lived in the
  // learner's head or not at all.
  //
  // ON THE ATTEMPT, not the recording: the notes are about the rehearsal, which is
  // the session, and a learner who records three takes in one sitting got one set
  // of feedback.
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS reflection_notes TEXT`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS assignment_id UUID`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS attempt_no INTEGER`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS mode VARCHAR(30) DEFAULT 'practice_solo'`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS booking_id UUID`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS room_id UUID`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS occurrence_uuid VARCHAR(120)`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS audience VARCHAR(${AUDIENCE_MAX})`,
  // The attempt SNAPSHOTS the assignment's audience, so the two widths must move
  // together or a 200-character audience truncates on its way into the snapshot.
  `ALTER TABLE presentation_attempts ALTER COLUMN audience TYPE VARCHAR(${AUDIENCE_MAX})`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS checklist_snapshot_json JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS selected_material_ids JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS attempt_state VARCHAR(30) DEFAULT 'draft'`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS recording_state VARCHAR(30) DEFAULT 'expected'`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS is_final_take BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS join_intent_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_attempts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // A double-clicked "practice now" must produce ONE attempt. A deliberate retry
  // increments attempt_no and is therefore a different row.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_attempts_unique_try
     ON presentation_attempts (assignment_id, attempt_no)`,
  `CREATE INDEX IF NOT EXISTS presentation_attempts_booking
     ON presentation_attempts (booking_id)`,
  // Recording ingestion matches on this. room_bookings.google_event_id and
  // live_sessions.zoom_meeting_id are both unindexed today despite being webhook
  // lookup keys; this one is indexed from the start.
  `CREATE INDEX IF NOT EXISTS presentation_attempts_occurrence
     ON presentation_attempts (occurrence_uuid)`,
  // At most one final take per assignment. Partial, because an attempt that is not
  // the final take must be free to recur.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_attempts_one_final_take
     ON presentation_attempts (assignment_id) WHERE is_final_take`,

  // ---------------------------------------------------------------------------
  // presentation_recordings — the parts of an attempt's recording
  //
  // ONE ATTEMPT CAN HAVE MANY PARTS. Zoom splits a recording when a host stops and
  // restarts, so "a recording exists for this attempt" is the exact check that
  // permanently hides the second half of a session — the booking ingestion path
  // has that bug today (sessionRecordingService.ts:428-435). A row here is a PART,
  // and the unique key is the part's own identity, so arriving twice is a conflict
  // and arriving late is just another part.
  //
  // The dedupe key is (occurrence_uuid, provider_file_id) and it is a REAL UNIQUE
  // INDEX. The existing pipeline dedupes by reading metadata @> {zoom_uuid} and
  // then inserting, which is a read-then-write race: a webhook and the 30-minute
  // cron sweep both see "not present" and both ingest. A constraint cannot race.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_recordings (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     attempt_id UUID NOT NULL,
     resource_id UUID,
     occurrence_uuid VARCHAR(120) NOT NULL,
     provider_file_id VARCHAR(160) NOT NULL,
     part_no INTEGER NOT NULL DEFAULT 1,
     parts_total INTEGER,
     recording_type VARCHAR(60),
     presentation_type VARCHAR(40),
     starts_at TIMESTAMPTZ,
     ends_at TIMESTAMPTZ,
     duration_seconds INTEGER,
     ingest_status VARCHAR(30) NOT NULL DEFAULT 'expected',
     ingest_provenance VARCHAR(30),
     has_audio BOOLEAN,
     has_shared_screen BOOLEAN,
     review_reason TEXT,
     recovery_url TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS attempt_id UUID`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS resource_id UUID`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS occurrence_uuid VARCHAR(120)`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS provider_file_id VARCHAR(160)`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS part_no INTEGER DEFAULT 1`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS parts_total INTEGER`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS recording_type VARCHAR(60)`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS ingest_status VARCHAR(30) DEFAULT 'expected'`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS ingest_provenance VARCHAR(30)`,
  // WHAT KIND OF PRESENTATION THIS TAKE IS, chosen by the learner in Practice.
  //
  // NOT `recording_type`, which is Zoom's word for the layout it captured
  // (`active_speaker`, `shared_screen_with_speaker_view`). This is the learner's
  // own answer to "what am I presenting" and comes from the seven template ids the
  // Learn stage already uses — one vocabulary, so a demo filed as a
  // `working_system_demo` means the same thing everywhere.
  //
  // PER TAKE, not per task: the task has a template, but a learner records several
  // takes against it and may deliberately record a short project introduction and a
  // full showcase in the same booked room.
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS presentation_type VARCHAR(40)`,
  // THE BACKFILL THE COLUMN SHIPPED WITHOUT, AND WHY IT IS NOT COSMETIC.
  //
  // The column was added and left NULL on every existing row. Readers fall back to
  // the TASK's current template when a take has no type of its own — which is right
  // for display and catastrophic as a resting state, because the task's template
  // MOVES. Clicking an empty portfolio slot deep-links to Learn and persists that
  // type onto the assignment, exactly as the spec asks. The side effect nobody
  // intended: every unclassified take on that task silently re-labels itself.
  //
  // Observed in production on 2026-10-23. Three takes recorded as
  // `project_introduction` moved to `ai_visual_presentation` the moment an empty
  // slot was clicked, and the portfolio's filled slot jumped with them.
  //
  // A take's type is a fact about the day it was recorded. Freezing it is what
  // makes it a fact rather than a view of whatever the task points at today — and
  // it is a precondition for paying points per type, because a type that moves is
  // a type that can be collected twice.
  //
  // Idempotent: only ever touches rows that have no type, so a re-run is a no-op
  // and a learner's own re-classification is never overwritten.
  `UPDATE presentation_recordings r
      SET presentation_type = asg.template_slug
     FROM presentation_attempts a
     JOIN presentation_assignments asg ON asg.id = a.assignment_id
    WHERE a.id = r.attempt_id
      AND r.presentation_type IS NULL
      AND asg.template_slug IS NOT NULL`,
  // WHAT ONE RECORDED PRESENTATION TYPE PAYS.
  //
  // Ali, 2026-10-23: "give them points for every one of these videos they do."
  // The whole prep week paid on hand-in only, so recording seven different kinds
  // of presentation — the actual work the portfolio asks for — paid nothing.
  //
  // 30 builder / 10 community is not invented. It is `ai_video_feedback`'s
  // builder rate, which is the nearest existing row for "a video the learner
  // records", and `demo`'s community rate. Seven types is therefore 210 builder
  // at most: well under one verified story (800), and in the same range as the
  // five prep hand-ins it sits beside (40 each).
  //
  // A ROW, NOT A CONSTANT, so the rate is one admin edit rather than a deploy.
  // ON CONFLICT DO NOTHING means a rate Ali has already tuned always wins, and a
  // re-run never resets it.
  `INSERT INTO points_config (scope, key, learning_xp, builder_xp, community_xp, is_active)
        VALUES ('type_default', 'presentation_recording', 0, 30, 10, true)
   ON CONFLICT (scope, key) DO NOTHING`,
  // THE SHARING BONUS. Ali, 2026-10-24: "give extra points to encourage sharing."
  //
  // 15, half the recording rate. Deliberately smaller than the thing it is a
  // bonus on: putting your face in front of the cohort should be rewarded, and
  // it must never be so valuable that declining feels like a penalty. Seven
  // types is 105 builder at most on top of the 210 for recording them.
  `INSERT INTO points_config (scope, key, learning_xp, builder_xp, community_xp, is_active)
        VALUES ('type_default', 'presentation_shared', 0, 15, 10, true)
   ON CONFLICT (scope, key) DO NOTHING`,
  // THE TEXT HAND-IN NOW PAYS NOTHING. Ali, 2026-10-24: "The points should be
  // moved from here. This is not a good place to collect points."
  //
  // Seeded explicitly at zero rather than left absent, so the row is visible in
  // admin and turning the hand-in back on is an edit rather than a deploy. A
  // zero-priced task drops out of `prepPointsMap`, and every surface already
  // reads that as "no badge" — so "Submit · +40 pts" simply stops claiming it.
  `INSERT INTO points_config (scope, key, learning_xp, builder_xp, community_xp, is_active)
        VALUES ('type_default', 'prep_handin', 0, 0, 0, true)
   ON CONFLICT (scope, key) DO NOTHING`,
  // ONE PREP TASK, ONE PRESENTATION TYPE — the backfill Ali asked for on
  // 2026-10-24: "make sure they match one per presentation type."
  //
  // `template_slug` is written by the UI as a side effect of navigating, so it
  // drifted into nonsense: one project had PREP-1 ("Write the demo narrative")
  // carrying `architecture_review`. The pairing is a curriculum fact and now
  // lives in `prepTaskVideoTypes.ts`; this aligns the stored rows to it.
  //
  // THE VALUES ARE REPEATED HERE AS LITERALS ON PURPOSE. A boot-time DDL list
  // cannot import application code, and generating this string from the module
  // would make a schema migration depend on a service that may be refactored
  // under it. `prepTaskVideoTypes.canonicalBackfillMatchesSchema` is the test
  // that keeps the two copies honest, and it fails loudly when they diverge.
  //
  // RECORDINGS ARE NOT TOUCHED. A take's own `presentation_type` is frozen at
  // ingest and is a fact about the day it was recorded; re-pointing the task it
  // belongs to must never retroactively re-label footage that already exists.
  `UPDATE presentation_assignments SET template_slug = v.type_id, updated_at = NOW()
     FROM (VALUES
       ('PREP-1', 'project_introduction'),
       ('PREP-2', 'working_system_demo'),
       ('PREP-3', 'ai_visual_presentation'),
       ('PREP-4', 'stakeholder_update'),
       ('PREP-5', 'final_showcase'),
       ('PREP-6', 'architecture_review'),
       ('PREP-7', 'client_handoff')
     ) AS v(story_id, type_id)
    WHERE presentation_assignments.story_id = v.story_id
      AND presentation_assignments.template_slug IS DISTINCT FROM v.type_id`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS has_audio BOOLEAN`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS has_shared_screen BOOLEAN`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS review_reason TEXT`,
  // Where the student says the file actually is, when Zoom never delivered one.
  // A row carrying this is a RECOVERY, not an ingest: nothing was fetched, nobody
  // verified the contents, and `ingest_provenance = 'student_recovery'` says so.
  // It is the only URL this table holds, and it is deliberately the student's own
  // public link rather than anything of ours — see presentationRecoveryService.
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS recovery_url TEXT`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_recordings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // The constraint that makes duplicate/late/out-of-order webhook delivery safe.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_recordings_unique_part
     ON presentation_recordings (occurrence_uuid, provider_file_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_recordings_attempt
     ON presentation_recordings (attempt_id, part_no)`,
  // The operations queue reads this: anything needing a human decision.
  `CREATE INDEX IF NOT EXISTS presentation_recordings_needs_review
     ON presentation_recordings (ingest_status) WHERE ingest_status IN ('missing', 'failed', 'review')`,

  // ---------------------------------------------------------------------------
  // presentation_feedback — coaching, peer notes and official grading, kept apart
  //
  // AI coaching, a peer's note and an instructor's score are three different things
  // with three different authorities, and merging them is how a practice suggestion
  // ends up looking like a grade. evaluator_role keeps them distinct.
  //
  // modality_analyzed records what was ACTUALLY available — transcript only, audio,
  // video, slides. A reviewer that saw only a transcript must not make claims about
  // delivery or confidence, and storing the modality is what lets the UI say "not
  // assessable" honestly instead of rendering an empty score as a zero.
  //
  // visibility defaults to 'private': a rehearsal score belongs to the student until
  // they decide otherwise.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_feedback (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     attempt_id UUID NOT NULL,
     evaluator_role VARCHAR(30) NOT NULL,
     evaluator_id VARCHAR(160),
     rubric_version VARCHAR(40) NOT NULL DEFAULT 'v1',
     modality_analyzed JSONB NOT NULL DEFAULT '[]'::jsonb,
     score_json JSONB,
     findings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
     improvements_json JSONB NOT NULL DEFAULT '[]'::jsonb,
     visibility VARCHAR(20) NOT NULL DEFAULT 'private',
     model_provenance JSONB,
     review_state VARCHAR(30) NOT NULL DEFAULT 'draft',
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS attempt_id UUID`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS evaluator_role VARCHAR(30)`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS evaluator_id VARCHAR(160)`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS rubric_version VARCHAR(40) DEFAULT 'v1'`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS modality_analyzed JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS score_json JSONB`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS findings_json JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS improvements_json JSONB DEFAULT '[]'::jsonb`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'private'`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS model_provenance JSONB`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS review_state VARCHAR(30) DEFAULT 'draft'`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // One verdict per evaluator per rubric version. Re-running the AI reviewer against
  // the same rubric updates its row instead of stacking duplicates; bumping the
  // rubric version is a genuinely new assessment and gets its own row.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_feedback_unique_verdict
     ON presentation_feedback (attempt_id, evaluator_role, rubric_version)`,
  `CREATE INDEX IF NOT EXISTS presentation_feedback_attempt
     ON presentation_feedback (attempt_id)`,

  // ---------------------------------------------------------------------------
  // presentation_showcases — the approved, published take
  //
  // content_hash is the approval's binding. Approval applies to the CONTENT that was
  // reviewed, not to the attempt in perpetuity: swap the recording or the deck after
  // sign-off and the hash no longer matches, so the publication is no longer
  // approved and has to go back through review. Storing the hash is what makes that
  // enforceable rather than a policy nobody can check.
  //
  // Both approvals default NULL — author and staff must each act. Nothing is
  // published by omission.
  // ---------------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS presentation_showcases (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     attempt_id UUID NOT NULL,
     recording_id UUID,
     audience VARCHAR(30) NOT NULL DEFAULT 'private',
     draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
     content_hash VARCHAR(80),
     author_approved_at TIMESTAMPTZ,
     staff_approved_at TIMESTAMPTZ,
     staff_approved_by VARCHAR(160),
     published_at TIMESTAMPTZ,
     publication_ref VARCHAR(160),
     withdrawn_at TIMESTAMPTZ,
     withdrawn_reason TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS attempt_id UUID`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS audience VARCHAR(30) DEFAULT 'private'`,
  // The portfolio artifact this showcase publishes. The two stores are NOT copies of
  // each other - the artifact is "what the learner made", the showcase is "who may
  // see it and who signed off" - but a showcase that cannot name its artifact leaves
  // the gallery and the portfolio describing the same rehearsal with no link between
  // them. Nullable: showcases predate artifacts, and a missing link is a gap to
  // backfill rather than a reason to refuse a publish.
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS artifact_id UUID`,

  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS draft_json JSONB DEFAULT '{}'::jsonb`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS content_hash VARCHAR(80)`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS author_approved_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS staff_approved_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS staff_approved_by VARCHAR(160)`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS publication_ref VARCHAR(160)`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS withdrawn_reason TEXT`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
  // THE SHOWCASE IS KEYED ON THE RECORDING, NOT THE ATTEMPT.
  //
  // It was keyed on the attempt until 2026-10-18, and that made "share this take" a
  // promise the data could not keep. An attempt is one booked room, and it collects
  // takes for as long as the learner keeps using it — Ali's PREP-4 attempt holds
  // three, recorded across five days. Attempt-level keying published all three
  // together and took all three down together, so a per-take switch would have
  // flipped two takes the learner never touched while appearing to flip one.
  //
  // A learner records several takes in order to choose ONE. The thing being shared
  // is the take.
  `ALTER TABLE presentation_showcases ADD COLUMN IF NOT EXISTS recording_id UUID`,
  // Backfill before the new index exists, or legacy rows could collide under it.
  // Idempotent: only rows that have no recording yet, and only live ones — a
  // withdrawn showcase is history and does not need re-pointing. Picks the attempt's
  // most recent ingested take, which is the one a learner sharing "the attempt"
  // almost certainly meant.
  `UPDATE presentation_showcases s
      SET recording_id = (
            SELECT r.id FROM presentation_recordings r
             WHERE r.attempt_id = s.attempt_id AND r.ingest_status = 'ingested'
             ORDER BY r.created_at DESC LIMIT 1)
    WHERE s.recording_id IS NULL AND s.withdrawn_at IS NULL`,
  // The attempt-level uniqueness has to GO, not merely be supplemented: while it
  // exists, a learner cannot publish a second take from the same room, which is the
  // ordinary case this change exists to support.
  `DROP INDEX IF EXISTS presentation_showcases_one_live`,
  // One LIVE showcase per RECORDING — a publish retried after a timeout must not
  // produce a second post. Partial on withdrawn_at so a withdrawn showcase can be
  // legitimately replaced by a new one later. NULL recording_id never collides in a
  // Postgres unique index, so any legacy row the backfill could not resolve (an
  // attempt with no ingested take) stays put rather than blocking the index.
  `CREATE UNIQUE INDEX IF NOT EXISTS presentation_showcases_one_live_per_recording
     ON presentation_showcases (recording_id) WHERE withdrawn_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS presentation_showcases_recording
     ON presentation_showcases (recording_id)`,
  `CREATE INDEX IF NOT EXISTS presentation_showcases_audience
     ON presentation_showcases (audience) WHERE published_at IS NOT NULL AND withdrawn_at IS NULL`,
  // Plain lookup by attempt. The partial unique index above only covers rows that
  // are still live, so without this a withdrawn showcase could only be found by a
  // sequential scan — and withdrawal history is exactly what an audit reads.
  // It is also the index the Sequelize model declares; model and DDL must agree.
  `CREATE INDEX IF NOT EXISTS presentation_showcases_attempt
     ON presentation_showcases (attempt_id)`,

  // ---------------------------------------------------------------------------
  // projects — external-project linkage (ADDITIVE, on an existing table)
  //
  // A student may showcase work built outside the platform. It must be linkable
  // without implying the platform verified it, so external_verified defaults FALSE
  // and evidence_provenance records where the claim came from. Publishing a showcase
  // never sets external_verified — only an explicit verification step may.
  // ---------------------------------------------------------------------------
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS external_url TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS external_owner VARCHAR(160)`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS evidence_provenance VARCHAR(60)`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS external_verified BOOLEAN DEFAULT FALSE`,
];

/**
 * Columns the assert post-condition requires, as `table.column`. Derived by hand
 * from the CREATE bodies above rather than parsed, so that a column dropped from a
 * CREATE without being dropped here fails loudly instead of silently shrinking the
 * contract the parity suite checks.
 */
export const PRESENTATION_STUDIO_REQUIRED_COLUMNS: string[] = [
  'presentation_assignments.id',
  'presentation_assignments.project_id',
  'presentation_assignments.story_id',
  'presentation_assignments.template_slug',
  'presentation_assignments.template_version',
  'presentation_assignments.prep_state',
  'presentation_attempts.id',
  'presentation_attempts.assignment_id',
  'presentation_attempts.attempt_no',
  'presentation_attempts.occurrence_uuid',
  'presentation_attempts.attempt_state',
  'presentation_attempts.recording_state',
  'presentation_attempts.is_final_take',
  'presentation_recordings.id',
  'presentation_recordings.attempt_id',
  'presentation_recordings.occurrence_uuid',
  'presentation_recordings.provider_file_id',
  'presentation_recordings.part_no',
  'presentation_recordings.ingest_status',
  'presentation_feedback.id',
  'presentation_feedback.attempt_id',
  'presentation_feedback.evaluator_role',
  'presentation_feedback.rubric_version',
  'presentation_feedback.modality_analyzed',
  'presentation_feedback.visibility',
  'presentation_showcases.id',
  'presentation_showcases.attempt_id',
  'presentation_showcases.audience',
  'presentation_showcases.content_hash',
  'presentation_showcases.withdrawn_at',
  'projects.external_url',
  'projects.external_verified',
];

/**
 * The uniqueness guarantees this module exists to provide. Named explicitly because
 * each one is load-bearing against a specific failure the Studio would otherwise
 * have: a duplicate assignment, a double-clicked attempt, a twice-ingested recording
 * part, a stacked AI verdict, and a retried publish posting twice.
 */
export const PRESENTATION_STUDIO_REQUIRED_INDEXES: string[] = [
  'presentation_assignments_unique_task',
  'presentation_attempts_unique_try',
  'presentation_attempts_one_final_take',
  'presentation_recordings_unique_part',
  'presentation_feedback_unique_verdict',
  'presentation_showcases_one_live',
];

/** Attempt lifecycle. Deliberately separate from recording state. */
export const PRESENTATION_ATTEMPT_STATES = [
  'draft', 'scheduled', 'live', 'recorded', 'reviewed', 'final_selected',
] as const;

/**
 * Recording lifecycle. 'expected' and 'processing' are NOT success: a webhook
 * receipt proves an event arrived, never that a playable file exists.
 */
export const PRESENTATION_RECORDING_STATES = [
  'expected', 'processing', 'ready', 'missing', 'failed', 'review', 'superseded',
] as const;

export async function ensurePresentationStudioSchema(): Promise<void> {
  for (const sql of PRESENTATION_STUDIO_STATEMENTS) {
    try {
      await sequelize.query(sql);
    } catch (err: any) {
      console.warn('[DB] presentation studio stmt skipped:', err?.message);
    }
  }
  console.log('[DB] Presentation Studio schema ensured (5 tables + projects linkage)');
}

/**
 * Verify the post-condition. Every statement above is swallowed into a console.warn,
 * so `ensure` resolving proves only that it ran — never that anything applied. This
 * is the function that actually answers "is the schema there?".
 */
export async function assertPresentationStudioSchema(): Promise<{ ok: boolean; missing: string[] }> {
  const missing: string[] = [];
  try {
    const [tables] = await sequelize.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    ) as [{ table_name: string }[], unknown];
    const present = new Set(tables.map((t) => t.table_name));
    for (const table of PRESENTATION_STUDIO_TABLES) {
      if (!present.has(table)) missing.push(`table ${table}`);
    }

    const [columns] = await sequelize.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
    ) as [{ table_name: string; column_name: string }[], unknown];
    const presentColumns = new Set(columns.map((c) => `${c.table_name}.${c.column_name}`));
    for (const column of PRESENTATION_STUDIO_REQUIRED_COLUMNS) {
      if (!presentColumns.has(column)) missing.push(`column ${column}`);
    }

    const [indexes] = await sequelize.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
    ) as [{ indexname: string }[], unknown];
    const presentIndexes = new Set(indexes.map((i) => i.indexname));
    for (const index of PRESENTATION_STUDIO_REQUIRED_INDEXES) {
      if (!presentIndexes.has(index)) missing.push(`index ${index}`);
    }
  } catch (err: any) {
    console.warn('[DB] presentation studio assert failed:', err?.message);
    return { ok: false, missing: ['assert query failed'] };
  }

  if (missing.length > 0) {
    console.error('[DB] Presentation Studio schema INCOMPLETE:', missing.join(', '));
  }
  return { ok: missing.length === 0, missing };
}
