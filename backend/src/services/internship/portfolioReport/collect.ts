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
import type { AgentTab, CollectedPortfolio, FeedItem, InternEmail, OurReply, ProjectFacts, WeWrote } from './types';

// One window for the whole story: commits, verified stories, emails and replies all cover 21 days.
export const LOOKBACK_DAYS = 21;
export const EMAIL_LOOKBACK_DAYS = 21;
/** Ali's own test enrollment is on the roster; "what he emailed Ali" would be his whole outbox. */
export const OPERATOR_EMAILS = ['ali@colaberry.com'];

const PROJECT_SQL = `
  SELECT p.id AS project_id,
         g.repo_url, g.last_sync_at, g.commit_summary_json AS commits,
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

export async function collectInternshipPortfolio({ now = new Date() }: { now?: Date } = {}): Promise<CollectedPortfolio> {
  const roster = await getConsoleRoster({ now });
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

  const [readiness, agentStates, projects, emailRows, weWrote, replies] = await Promise.all([
    soft('project readiness', () => internshipProjectReadiness(), []),
    soft('agent nudge state', () => loadAgentNudgeStates({ query: (s) => select(s), now: now.toISOString() }), []),
    soft('project detail', () => (projectIds.length ? select<ProjectFacts>(PROJECT_SQL, { ids: projectIds }) : Promise.resolve([])), []),
    soft('intern emails', () => (emails.length ? select<InternEmail>(EMAIL_SQL, { emails }) : Promise.resolve([])), []),
    soft('our last reply', () => (emails.length ? select<WeWrote>(WE_WROTE_SQL, { emails }) : Promise.resolve([])), []),
    soft('our replies', () => (emails.length ? select<OurReply>(REPLIES_SQL, { emails }) : Promise.resolve([])), []),
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
  };
}
