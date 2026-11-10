/**
 * collect - gather everything the Internship Portfolio Report needs, from the SAME services the
 * admin page /admin/internship renders from, so the report and the page can never disagree.
 * Read-only.
 *
 *   roster, training, pace, cert, 28-day activity, project  getConsoleRoster()            (Intern Console, Activity Timeline)
 *   per-intern timeline feed                                getInternConsoleDetail()       (Activity Timeline focus panel)
 *   weeks 1-3 gate + sessions                               internshipProjectReadiness()   (?view=projects "Ready for a project")
 *   agent builders: verified/total stories, next story      loadAgentNudgeStates()         (Agent nudges)
 *   gov pursuits and their assigned interns                 listGovContractsFor()          (sidebar GOV CONTRACTS)
 *   repo, recent commits, verified / next / overdue tasks   github_connections, student_tasks
 *   what each intern emailed Ali, and our last reply        inbox_emails
 *   report emails set up on each agent tab                  agent_report_subscriptions
 *
 * Failure modes: every source except the roster is fail-soft (logged with an error_class, empty
 * fallback), so one broken query cannot blank the report for every intern. The roster throwing
 * aborts the run: an empty report would read as "nobody did anything". No retries; a failed run
 * is simply re-run, and it is read-only, so that is always safe.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { getConsoleRoster, consoleCounts } from '../internConsoleRoster';
import { getInternConsoleDetail } from '../internConsoleDetail';
import { internshipProjectReadiness } from '../internshipProjectReadiness';
import { loadAgentNudgeStates } from '../agentNudgeState';
import { listGovContractsFor } from '../../factory/govContractsList';
import type { GovPipelineCard } from '../../factory/govPipeline';
import type { AgentTab, CollectedPortfolio, Conversation, FeedItem, InternEmail, LastOutbound, PrepTask, RecordedVideo, OurReply, ProjectFacts, PublishedArtifact, WeWrote } from './types';
import { repairMojibake } from '../../../utils/textEncoding';

// One window for the whole story: commits, verified stories, emails and replies all cover 21 days.
export const LOOKBACK_DAYS = 21;
export const EMAIL_LOOKBACK_DAYS = 21;
/** Ali's own test enrollment is on the roster; "what he emailed Ali" would be his whole outbox. */
export const OPERATOR_EMAILS = ['ali@colaberry.com'];

const PROJECT_SQL = `
  SELECT p.id AS project_id,
         g.repo_url, g.last_sync_at, g.commit_summary_json AS commits,
         NULLIF(p.project_variables->>'command_center_url', '') AS command_center_url,
         (SELECT json_agg(x ORDER BY x.verified_at DESC) FROM (
            SELECT t.story_id, t.title, t.verified_at FROM student_tasks t
             WHERE t.project_id = p.id AND t.verified_at > now() - interval '${LOOKBACK_DAYS} days'
             ORDER BY t.verified_at DESC LIMIT 15) x) AS recently_verified,
         (SELECT json_agg(x ORDER BY x.due_on NULLS LAST) FROM (
            SELECT t.story_id, t.title, t.due_on::text AS due_on, t.status FROM student_tasks t
             WHERE t.project_id = p.id AND t.verified_at IS NULL AND COALESCE(t.status,'') <> 'complete'
             ORDER BY t.due_on NULLS LAST, t.story_id LIMIT 3) x) AS next_tasks,
         (SELECT count(*)::int FROM student_tasks t
           WHERE t.project_id = p.id AND t.verified_at IS NULL AND COALESCE(t.status,'') <> 'complete'
             AND t.due_on < current_date) AS overdue,
         (SELECT json_agg(x ORDER BY x.due_on) FROM (
            SELECT t.story_id, t.title, t.due_on::text AS due_on FROM student_tasks t
             WHERE t.project_id = p.id AND t.verified_at IS NULL AND COALESCE(t.status,'') <> 'complete'
               AND t.due_on < current_date
             ORDER BY t.due_on LIMIT 6) x) AS overdue_tasks
    FROM projects p
    LEFT JOIN LATERAL (SELECT * FROM github_connections gc WHERE gc.project_id = p.id
                        ORDER BY gc.last_sync_at DESC NULLS LAST LIMIT 1) g ON TRUE
   WHERE p.id IN (:ids)`;

// Sequelize expands an array replacement into a comma list, hence IN (:x) and ARRAY[:x], never ANY(:x).
const EMAIL_SQL = `
  SELECT lower(from_address) AS email, subject,
         left(regexp_replace(COALESCE(body_text,''), '\\s+', ' ', 'g'), 400) AS snippet, received_at
    FROM inbox_emails
   WHERE lower(from_address) IN (:emails)
     AND received_at > now() - interval '${EMAIL_LOOKBACK_DAYS} days'
   ORDER BY received_at DESC`;

// Our side of the conversation: every outbound BCCs Ali and that copy is ingested (see agentNudgeState).
// Each message colaberry.com sent an intern in the window (the BCC copy), for the reply chips.
const REPLIES_SQL = `
  SELECT e AS email, x.subject, x.received_at
    FROM unnest(ARRAY[:emails]::text[]) AS e
    JOIN inbox_emails x ON lower(x.from_address) LIKE '%@colaberry.com'
                       AND x.to_addresses::text ILIKE '%' || e || '%'
                       AND x.received_at > now() - interval '${EMAIL_LOOKBACK_DAYS} days'
   ORDER BY x.received_at`;

const WE_WROTE_SQL = `
  SELECT e AS email, (SELECT max(x.received_at) FROM inbox_emails x
                       WHERE lower(x.from_address) LIKE '%@colaberry.com'
                         AND x.to_addresses::text ILIKE '%' || e || '%') AS last_we_wrote
    FROM unnest(ARRAY[:emails]::text[]) AS e`;

// Only artifacts the intern THEMSELVES made. `runtime_portfolio_artifacts` is an auto-generation
// store (runtime/portfolioService.generateArtifact writes LLM prose about the student and throws
// the student's own text away), so "has something to open" is not the same question as "is theirs".
// The three clauses below are the only evidence of authorship the table carries:
//   repo    repo_path + commit_sha   a file in their repository, and the commit that put it there
//   upload  stored_path              a file they uploaded themselves
//   link    artifact_url             something they built elsewhere and submitted
// Measured on prod 9 Nov 2026: this admits 199 of 809 rows. The 610 it drops are 294 rows of LLM
// prose, 151 of our own Colaberry curriculum field guides, 164 scenario-engine ADRs and 1 shell.
// The previous version admitted any row with body_html or 200+ letters of JSON, which is exactly
// how the field guides and the generated case studies reached Ali's report.
// Content itself is fetched only by the viewer page, never here.
const ARTIFACTS_SQL = `
  SELECT r.id, r.enrollment_id, r.card_id, r.kind, r.title, r.created_at,
         NULLIF(r.content->>'artifact_url', '') AS external_url,
         NULLIF(r.content->>'repo_path', '')    AS repo_path,
         NULLIF(r.content->>'commit_sha', '')   AS commit_sha,
         CASE WHEN coalesce(r.content->>'stored_path', '') <> ''
              THEN coalesce(NULLIF(r.content->>'filename', ''), 'uploaded file') END AS upload_name
    FROM runtime_portfolio_artifacts r
   WHERE r.enrollment_id IN (:enrollmentIds)
     AND (
          (coalesce(r.content->>'repo_path', '') <> '' AND coalesce(r.content->>'commit_sha', '') <> '')
          OR coalesce(r.content->>'stored_path', '') <> ''
          OR r.content->>'artifact_url' LIKE 'https://%'
         )   ORDER BY r.created_at DESC`;

const AGENT_SQL = `
  SELECT d.domain_key, d.agent_id, d.student_project_id, d.intended_builder, p.name AS project_name,
         lower(en.email) AS email,
         (SELECT json_agg(json_build_object('cadence', s.cadence, 'scope', s.content_scope,
                  'hour', s.delivery_hour_local, 'enabled', s.enabled, 'by', s.created_by_email))
            FROM agent_report_subscriptions s WHERE s.agent_id = d.agent_id) AS subscriptions
    FROM agent_domain_projects d
    JOIN projects p ON p.id = d.student_project_id
    LEFT JOIN enrollments en ON en.id = p.enrollment_id
   WHERE d.intended_builder IS NOT NULL`;

/**
 * Undo filenames stored double-encoded by the upload path (utils/textEncoding.ts has the root
 * cause). Applied where the rows enter the report, so the HTML and the JSON sidecar both read the
 * repaired text from this one place.
 */
export function repairArtifactText(a: PublishedArtifact): PublishedArtifact {
  return { ...a, title: repairMojibake(a.title), upload_name: repairMojibake(a.upload_name) ?? null, repo_path: repairMojibake(a.repo_path) ?? null };
}

// Both sides of every conversation with the interns in the email window, with enough body to judge
// what it says (sidecar `communications`; the HTML does not use it). Their mail by sender; ours by
// a colaberry.com sender addressed to them. Body capped at 1,500 characters, whitespace collapsed.
const COMMS_SQL = `
  SELECT lower(from_address) AS from_address, to_addresses::text AS to_text, subject,
         left(regexp_replace(COALESCE(body_text, ''), '\\s+', ' ', 'g'), 1500) AS body, received_at
    FROM inbox_emails
   WHERE received_at > now() - interval '${EMAIL_LOOKBACK_DAYS} days'
     AND (lower(from_address) IN (:emails)
          OR (lower(from_address) LIKE '%@colaberry.com' AND to_addresses::text ILIKE ANY (ARRAY[:likes]::text[])))
   ORDER BY received_at DESC
   LIMIT 2000`;

// Every demo video an intern recorded in the Presentation Studio (Zoom practice-room takes ingested
// to disk). Measured 10 Nov 2026: 4 intern recordings exist and NONE wrote a portfolio artifact
// (that only happens on a task hand-in), so the report reads the recordings themselves.
const VIDEOS_SQL = `
  SELECT r.id AS recording_id, asg.enrollment_id, asg.story_id, r.presentation_type, asg.template_slug,
         r.duration_seconds, r.created_at, a.attempt_no, a.mode, a.is_final_take, r.has_audio, r.has_shared_screen
    FROM presentation_recordings r
    JOIN presentation_attempts a ON a.id = r.attempt_id
    JOIN presentation_assignments asg ON asg.id = a.assignment_id
   WHERE r.ingest_status = 'ingested' AND asg.enrollment_id IN (:enrollmentIds)
   ORDER BY r.created_at DESC`;

// The presentation tasks on each intern's projects (PREP-1..5 = the five recorded presentation
// types, PREP-6 = Demo Day), with the due dates the build schedule gave them.
const PREP_SQL = `
  SELECT p.enrollment_id, t.story_id, t.title, t.status, t.due_on, t.verified_at
    FROM student_tasks t JOIN projects p ON p.id = t.project_id
   WHERE p.enrollment_id IN (:enrollmentIds) AND t.story_id LIKE 'PREP-%'
   ORDER BY t.story_id`;

// The most recent message sent TO each intern from a colaberry.com address (Ali's own sends are
// BCC'd into his inbox mirror, so they are here). Feeds the sidecar's `last_ask`; the HTML does
// not use it. Body capped so one long thread cannot bloat the report.
const LAST_ASK_SQL = `
  SELECT e AS email, x.received_at AS sent_at, x.subject, left(x.body_text, 8000) AS body_text,
         length(x.body_text) > 8000 AS body_truncated, x.from_address
    FROM unnest(ARRAY[:emails]::text[]) AS e
    JOIN LATERAL (
      SELECT i.received_at, i.subject, i.body_text, i.from_address
        FROM inbox_emails i
       WHERE lower(i.from_address) LIKE '%@colaberry.com'
         AND i.to_addresses::text ILIKE '%' || e || '%'
       ORDER BY i.received_at DESC
       LIMIT 1) x ON true`;

async function soft<T>(source: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const e = err as Error;
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'internship-portfolio-report', event: 'source_unavailable',
      outcome: 'partial', error_class: e?.name || 'UnknownError', context: { source, message: e?.message },
    }));
    return fallback;
  }
}

function select<T>(sql: string, replacements: Record<string, unknown> = {}): Promise<T[]> {
  return sequelize.query(sql, { type: QueryTypes.SELECT, replacements }) as Promise<T[]>;
}

/**
 * `enrollmentIds` narrows the roster before anything else is derived from it. Every query below is
 * already keyed on `emails`, `ids` or `enrollmentIds`, so narrowing the roster narrows all of them,
 * and the per-intern detail loop shrinks from the whole cohort to one. That is what makes an
 * on-demand single-intern render cheap enough to run while a manager waits for it.
 *
 * Passing an empty array means "nobody" and is honoured; passing undefined means the whole roster.
 */
export async function collectInternshipPortfolio(
  { now = new Date(), enrollmentIds }: { now?: Date; enrollmentIds?: readonly string[] } = {},
): Promise<CollectedPortfolio> {
  const all = await getConsoleRoster({ now });
  const wanted = enrollmentIds ? new Set(enrollmentIds) : null;
  const roster = wanted ? all.filter((r) => wanted.has(r.enrollment_id)) : all;
  const emails = roster.map((r) => String(r.email ?? '').toLowerCase()).filter((e) => e && !OPERATOR_EMAILS.includes(e));

  const agentTabs = await soft('agent tabs', () => select<AgentTab>(AGENT_SQL), []);
  const govList = await soft('gov contracts', () => listGovContractsFor({ email: 'ali@colaberry.com', sections: ['program'] }), null);
  const govPursuits = ((govList?.projects ?? []) as GovPipelineCard[]).filter((g) => g.hasActiveIntern);
  // A gov intern's build lives on the pursuit and an agent builder's on the agent tab; either can
  // differ from the intern's newest console project (one builder's newest is a personal project).
  const projectIds = [...new Set([
    ...roster.map((r) => r.project?.project_id),
    ...govPursuits.map((g) => g.build?.studentProjectId),
    ...agentTabs.map((a) => a.student_project_id),
  ].filter((x): x is string => !!x))];

  const enrollmentIds = roster.map((r) => r.enrollment_id);
  const [readiness, agentStates, projects, emailRows, weWrote, replies, lastOutbound, artifacts, conversations, videos, prepTasks] = await Promise.all([
    soft('project readiness', () => internshipProjectReadiness(), []),
    soft('agent nudge state', () => loadAgentNudgeStates({ query: (s) => select(s), now: now.toISOString() }), []),
    soft('project detail', () => (projectIds.length ? select<ProjectFacts>(PROJECT_SQL, { ids: projectIds }) : Promise.resolve([])), []),
    soft('intern emails', () => (emails.length ? select<InternEmail>(EMAIL_SQL, { emails }) : Promise.resolve([])), []),
    soft('our last reply', () => (emails.length ? select<WeWrote>(WE_WROTE_SQL, { emails }) : Promise.resolve([])), []),
    soft('our replies', () => (emails.length ? select<OurReply>(REPLIES_SQL, { emails }) : Promise.resolve([])), []),
    soft('last outbound', () => (emails.length ? select<LastOutbound>(LAST_ASK_SQL, { emails }) : Promise.resolve([])), []),
    soft('published artifacts', () => (roster.length ? select<PublishedArtifact>(ARTIFACTS_SQL, { enrollmentIds: roster.map((r) => r.enrollment_id) }).then((rows) => rows.map(repairArtifactText)) : Promise.resolve([])), []),
    soft('conversations', () => (emails.length ? select<Conversation>(COMMS_SQL, { emails, likes: emails.map((e) => `%${e}%`) }) : Promise.resolve([])), []),
    soft('demo videos', () => (enrollmentIds.length ? select<RecordedVideo>(VIDEOS_SQL, { enrollmentIds }) : Promise.resolve([])), []),
    soft('presentation tasks', () => (enrollmentIds.length ? select<PrepTask>(PREP_SQL, { enrollmentIds }) : Promise.resolve([])), []),
  ]);

  // Sequential on purpose: ~14 interns, each detail is a handful of queries.
  const feeds: Record<string, FeedItem[]> = {};
  const cutoff = now.getTime() - LOOKBACK_DAYS * 86400000;
  for (const r of roster) {
    const d = await soft(`detail ${r.enrollment_id}`, () => getInternConsoleDetail(r.enrollment_id, { now }), null);
    feeds[r.enrollment_id] = ((d?.feed ?? []) as unknown as FeedItem[]).filter((f) => Date.parse(f.occurredAt) > cutoff);
  }

  return {
    generatedAt: now.toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    emailLookbackDays: EMAIL_LOOKBACK_DAYS,
    counts: consoleCounts(roster),
    roster,
    feeds,
    readiness,
    agentStates,
    agentTabs,
    govPursuits,
    projects,
    emails: emailRows,
    weWrote,
    replies,
    artifacts,
    lastOutbound,
    conversations,
    videos,
    prepTasks,
  };
}
