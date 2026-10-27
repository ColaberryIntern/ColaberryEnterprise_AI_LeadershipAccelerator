import type { AgentNudgeState, NudgeStory } from './agentNudgeComposer';

/**
 * agentNudgeState - assemble what we actually know about each agent builder.
 *
 * The composer is pure and knows nothing about the database. This is the half that reads
 * production, and it is kept separate for one reason: every interesting decision in the composer
 * is testable precisely because it never has to be handed a database.
 *
 * ── THE SEVEN, AND ONLY THE SEVEN ───────────────────────────────────────────────────────
 *
 * Ali, 23 Oct: "You can send it out but only to the 7 working on the Agent projects."
 *
 * That is enforced here as a refusal rather than honored as a convention. `loadAgentNudgeStates`
 * returns the assigned builders and nothing else, and `assertAgentBuilder` re-checks a recipient
 * against that list immediately before sending. A caller cannot reach a student by passing an
 * address, because no address a caller passes is ever used: the recipient comes from the roster.
 *
 * The repo's standing rule is that bulk mail to students is forbidden
 * (`ConsoleViewB.tsx` records it). This is the narrow, named exception Ali granted, so the code
 * states the boundary rather than leaving the next reader to wonder whether the rule was dropped.
 *
 * ── WHY GMAIL IS CONSULTED ──────────────────────────────────────────────────────────────
 *
 * "Are we still owed them a reply" took three attempts, and the first two were wrong against
 * production in opposite directions.
 *
 *   1. `email_send_ledger` holds only mail sent through the service layer. Replies sent by hand
 *      never reach it: on 23 Oct its newest row for any of the seven was from August, while two
 *      had been answered that week.
 *   2. Asking Gmail was worse. Mail sent through Mandrill never appears in Gmail's Sent folder at
 *      all, so the mailbox reported six of seven as unanswered, including someone last heard from
 *      79 days earlier.
 *
 * The answer was already in the database. Every outbound carries a BCC to Ali, that copy is
 * ingested like any other mail, and `to_addresses` records who it went to. So our side of the
 * conversation is sitting in `inbox_emails` next to theirs, and the comparison is one subquery
 * with no external call, no injected seam and nothing to mock.
 */

/**
 * How long an unanswered message keeps suppressing nudges.
 *
 * Being owed a reply is a live state, not a permanent one. Measured on 23 Oct, one builder read as
 * owed a reply because of an email she sent 79 days earlier: real, unanswered, and no longer a
 * conversation anybody is waiting on. Without a window that one old message would mute her
 * nudges forever, and the fix for a months-old miss is a reply, not silence.
 */
export const OWED_WINDOW_DAYS = 7;

/** Platform commits are not the intern working. Author and message are matched separately. */
const PLATFORM_AUTHOR = /build bot/i;
const PLATFORM_MESSAGE = /^chore\(colaberry\)/i;

/**
 * Shorten a commit subject on a word boundary.
 *
 * The daily report shipped with a hard `slice(0, 60)` and mailed lines reading "document the rol".
 * The same mistake would land here, in a message whose whole purpose is to read as if a person
 * wrote it, so the fix comes with the code rather than after the first send.
 */
export function clipSubject(s: unknown, max = 60): string {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, '')}...`;
}

/** The names the interns chose. Until AF10.6 stores them, they are named here, not regexed. */
export const AGENT_NAMES: Record<string, string> = {
  platform: 'Ellis',
  product_experience: 'Maru',
  sales: 'Vic',
  admissions: 'Maya',
  internship: 'Pip',
  curriculum: 'Dara',
  marketing: 'Ava',
};

interface RawRow {
  domain: string;
  builder: string | null;
  email: string | null;
  commits: unknown;
  stories: number;
  verified: number;
  overdue: number;
  gradeable: number;
  next_story: NudgeStory | null;
  last_verified: string | null;
  last_wrote: string | null;
  last_we_wrote: string | null;
  prior_nudges: number;
}

/**
 * One query. Every figure the composer can use, keyed on the project that owns the domain, so it
 * cannot disagree with the roster about who builds what.
 */
export const AGENT_NUDGE_SQL = `
  SELECT d.domain_key AS domain,
         d.intended_builder AS builder,
         lower(e.email) AS email,
         g.commit_summary_json AS commits,
         (SELECT count(*)::int FROM student_tasks t
           WHERE t.project_id = d.student_project_id) AS stories,
         (SELECT count(*)::int FROM student_tasks t
           WHERE t.project_id = d.student_project_id AND t.verified_at IS NOT NULL) AS verified,
         (SELECT count(*)::int FROM student_tasks t
           WHERE t.project_id = d.student_project_id AND t.verified_at IS NULL
             AND t.due_on IS NOT NULL AND t.due_on < current_date) AS overdue,
         (SELECT count(*)::int FROM student_tasks t
           WHERE t.project_id = d.student_project_id AND t.acceptance IS NOT NULL
             AND jsonb_typeof(t.acceptance::jsonb) = 'array'
             AND jsonb_array_length(t.acceptance::jsonb) > 0) AS gradeable,
         (SELECT json_build_object(
                   'storyId', t.story_id, 'title', t.title, 'dueOn', t.due_on::text,
                   'gradeable', (t.acceptance IS NOT NULL
                     AND jsonb_typeof(t.acceptance::jsonb) = 'array'
                     AND jsonb_array_length(t.acceptance::jsonb) > 0))
            FROM student_tasks t
           WHERE t.project_id = d.student_project_id AND t.verified_at IS NULL
           ORDER BY t.due_on NULLS LAST, t.story_id LIMIT 1) AS next_story,
         (SELECT t.story_id FROM student_tasks t
           WHERE t.project_id = d.student_project_id AND t.verified_at IS NOT NULL
           ORDER BY t.verified_at DESC LIMIT 1) AS last_verified,
         (SELECT max(x.received_at)::text FROM inbox_emails x
           WHERE lower(x.from_address) = lower(e.email)) AS last_wrote,
         -- Our side, visible because every outbound BCCs Ali and that copy is ingested.
         -- Any colaberry.com sender counts: an answer from a colleague is still an answer.
         (SELECT max(x.received_at)::text FROM inbox_emails x
           WHERE lower(x.from_address) LIKE '%@colaberry.com'
             AND x.to_addresses::text ILIKE '%' || lower(e.email) || '%') AS last_we_wrote,
         (SELECT count(*)::int FROM email_send_ledger l
           WHERE lower(l.recipient) = lower(e.email)
             AND l.business_event_id LIKE 'agent-nudge-%' AND l.status = 'sent') AS prior_nudges
    FROM agent_domain_projects d
    JOIN projects p ON p.id = d.student_project_id
    JOIN enrollments e ON e.id = p.enrollment_id
    LEFT JOIN github_connections g ON g.project_id = d.student_project_id
   WHERE d.intended_builder IS NOT NULL
     AND e.email IS NOT NULL
   ORDER BY d.domain_key`;

export interface LoadDeps {
  query: (sql: string) => Promise<any[]>;
  /** Server time, so every derived age agrees. */
  now: string;
}

const parseTs = (v: string | null): number | null => {
  if (!v) return null;
  const ms = Date.parse(String(v).replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  return Number.isNaN(ms) ? null : ms;
};

/** Floor to whole days. A partial day is not a day. */
function daysBetween(thenMs: number | null, nowMs: number): number | null {
  if (thenMs === null) return null;
  return Math.floor((nowMs - thenMs) / 86400000);
}

/** Ported from internConsoleActivity.bandFor, which owns this rule. */
function bandFor(days: number | null): AgentNudgeState['band'] {
  if (days === null) return 'unknown';
  if (days <= 0) return 'green';
  if (days <= 3) return 'yellow';
  if (days <= 6) return 'orange';
  if (days <= 9) return 'red';
  return 'black';
}

/** The trailing part of a story id, so the same story can be compared across domains. */
const storySuffix = (id: string): string => String(id ?? '').split('.').pop() ?? '';

export async function loadAgentNudgeStates(deps: LoadDeps): Promise<AgentNudgeState[]> {
  const rows = (await deps.query(AGENT_NUDGE_SQL)) as RawRow[];
  const nowMs = parseTs(deps.now) ?? Date.now();

  // Who else has already verified the story each person is next on. One pass over the same rows,
  // so no second query and no chance of the two disagreeing.
  const verifiedByDomain = new Map<string, Set<string>>();
  for (const r of rows ?? []) {
    if (r.last_verified) {
      if (!verifiedByDomain.has(r.domain)) verifiedByDomain.set(r.domain, new Set());
      verifiedByDomain.get(r.domain)!.add(storySuffix(r.last_verified));
    }
  }

  const out: AgentNudgeState[] = [];
  for (const r of rows ?? []) {
    const commits = Array.isArray(r.commits) ? (r.commits as any[]) : [];
    const own = commits.filter((c) => !PLATFORM_AUTHOR.test(String(c?.author ?? ''))
      && !PLATFORM_MESSAGE.test(String(c?.message ?? '').trim()));
    const latestCommit = own.map((c) => c?.date).filter(Boolean).sort().pop() ?? null;
    const recent = own
      .filter((c) => c?.date && (parseTs(c.date) ?? 0) > nowMs - 86400000)
      .map((c) => clipSubject(c?.message));

    const email = String(r.email ?? '').trim().toLowerCase();
    const wroteMs = parseTs(r.last_wrote);
    const weWroteMs = parseTs(r.last_we_wrote);
    // Owed only if their last message is newer than our last one to them AND recent enough to
    // still be a live conversation. Someone who has never written is owed nothing, which is why
    // the null case is false rather than true.
    const awaitingOurReply = wroteMs !== null
      && (weWroteMs === null || wroteMs > weWroteMs)
      && (nowMs - wroteMs) <= OWED_WINDOW_DAYS * 86400000;

    const days = daysBetween(parseTs(latestCommit), nowMs);
    const next = r.next_story;
    const peers = next
      ? [...verifiedByDomain.entries()]
        .filter(([dom, set]) => dom !== r.domain && set.has(storySuffix(next.storyId))).length
      : 0;

    out.push({
      domain: r.domain,
      agent: AGENT_NAMES[r.domain] ?? null,
      firstName: String(r.builder ?? '').trim().split(/\s+/)[0] ?? '',
      email,
      band: bandFor(days),
      daysSinceCommit: days,
      verified: r.verified,
      stories: r.stories,
      overdue: r.overdue,
      gradeableStories: r.gradeable,
      nextStory: next,
      lastVerifiedStoryId: r.last_verified,
      recentCommitSubjects: recent,
      daysSinceTheyWrote: daysBetween(wroteMs, nowMs),
      awaitingOurReply,
      peersDoneWithNextStory: peers,
      priorNudgeCount: r.prior_nudges ?? 0,
    });
  }
  return out;
}

/**
 * The guard that makes "only the seven" a property of the code.
 *
 * Throws rather than returning false. A caller that forgets to check a boolean sends the mail;
 * a caller that forgets to catch gets a 500 and sends nothing, and of the two failures only one
 * of them reaches a person who should never have been mailed.
 */
export function assertAgentBuilder(email: string, states: AgentNudgeState[]): AgentNudgeState {
  const wanted = String(email ?? '').trim().toLowerCase();
  const hit = states.find((s) => s.email === wanted);
  if (!hit) {
    throw new Error(`refusing to nudge ${wanted || '(empty)'}: not one of the agent builders`);
  }
  return hit;
}

/** One nudge per builder per day, whatever angle it used. */
export function agentNudgeEventId(domain: string, now: Date): string {
  return `agent-nudge-${domain}-${now.toISOString().slice(0, 10)}`;
}
