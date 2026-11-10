/**
 * summary - the 2-3 sentence "where are they" paragraph at the top of each intern's card.
 *
 * Ali, 9 Nov 2026: "tells me where they are in 2-3 sentences... be specific... what part they are
 * building... summarize from all information including the commits in their repo."
 *
 * The model writes it, because naming "what part they are building" means reading commit messages
 * and story titles, which rules cannot do well. But this report already caught the model inventing
 * a commit date, so its paragraph must PASS three checks or it is thrown away:
 *   1. every number in it appears in the facts it was given (no invented counts, days or dates)
 *   2. no he/she/his/her/him (the model gendered an intern before)
 *   3. 2-3 sentences, under 650 characters
 * Anything that fails, and any API error or timeout (30s), falls back to a deterministic paragraph
 * built from the same facts. No retries: the fallback is a complete answer.
 */
import type { ChatClient } from './narrate';
import { dayKey } from './timeline';
import type { InternCard, PortfolioReport } from './types';

export const SUMMARY_MODEL = process.env.INTERN_REPORT_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 30000;
const CONCURRENCY = 4;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Central-time "Nov 7", the same calendar day the timeline shows (UTC put evening work on the next day). */
const fmt = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const k = dayKey(d);
  return `${MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8, 10))}`;
};

const SYSTEM = [
  'You write a 2-3 sentence status paragraph for Ali, who runs an AI internship, about ONE intern.',
  'Start with the first name. Sentence 1 MUST say in plain words what lastWorkedOn describes (their most recent commit or verified story) and how far along the build is in words (buildStage), e.g. "Kalkidan is early in the Admissions build and last verified the six Command Center panels against the live portal." The project name alone is not an answer.',
  'Do NOT write story counts like "7 of 189" or "out of": the progress bar above the paragraph already shows them.',
  'If lastWorkedOn is null, say there has been no build work in the last 21 days.',
  'notStartedYet lists the next story and late tasks. They have NOT been worked on: never describe them as current work; they belong in the last sentence as what is next.',
  'If hasProject is false, say they have no project yet, describe their training (trainingDaysLast21, training weeks) and that a project needs to be started.',
  'Sentence 2: what happened recently: momentum, where they are stuck or waiting (use needsAttentionNow and theirAsks), anything late.',
  'Sentence 3: what is next (from notStartedYet or needsAttentionNow).',
  'Use ONLY the facts. Every number you write must appear in the facts. Do not invent dates.',
  'Refer to the intern by first name or "they", never he/she/his/her. Plain American English, no em-dashes, no praise, no hedging.',
  'Return JSON: {"summary": string}',
].join('\n');

/** "47 of 136 stories verified (35%)": the one phrase the paragraph must carry verbatim. */
export function progressPhrase(c: InternCard): string | null {
  const p = c.project;
  if (!p) return null;
  if (!p.tasksTotal) return 'no stories in the build plan yet';
  return `${p.tasksDone ?? 0} of ${p.tasksTotal} stories verified (${p.pct ?? 0}%)`;
}

/** How far along, in words, so the paragraph can say it without restating counts. */
export function buildStage(c: InternCard): string | null {
  const p = c.project;
  if (!p) return null;
  if (!p.tasksTotal) return 'not started: the build plan has no stories yet';
  const pct = p.pct ?? 0;
  if (pct >= 90) return 'nearly complete';
  if (pct >= 50) return 'more than half done';
  if (pct >= 15) return 'well underway';
  return 'early in the build';
}

/** Strip a leading "admissions.STORY-000:" style tag so the model reads the human part. */
const cleanCommit = (m: string): string => m.replace(/^[^\s:]+:\s*/, '').trim();

/** The newest real work, in words: what sentence 1 must describe. */
export function lastWorkedOn(c: InternCard): string | null {
  const p = c.project;
  if (!p) return null;
  const commit = p.commitsRecent[0];
  const story = p.verifiedRecent[0];
  if (!commit && !story) return null;
  const parts: string[] = [];
  if (commit) parts.push(`${fmt(commit.date)} commit: ${cleanCommit(commit.message)}`);
  if (story) parts.push(`${fmt(story.at)} verified story: ${story.title}`);
  return parts.join('; ');
}

/** Everything we know about one intern, compact, for the model and for the checks. */
export function summaryFacts(c: InternCard): Record<string, unknown> {
  const p = c.project;
  return {
    firstName: c.firstName,
    hasProject: !!p,
    project: p?.name ?? null,
    track: c.trackLabel,
    dayOfInternship: c.day,
    progressPhrase: progressPhrase(c),
    buildStage: buildStage(c),
    lastWorkedOn: lastWorkedOn(c),
    recentCommits: (p?.commitsRecent ?? []).slice(0, 12).map((x) => `${fmt(x.date)}: ${cleanCommit(x.message)}`),
    recentlyVerified: (p?.verifiedRecent ?? []).slice(0, 8).map((v) => `${fmt(v.at)}: ${v.title}`),
    notStartedYet: [p?.next?.title, ...(p?.overdueTasks ?? []).map((t) => `late: ${t.title}`)].filter(Boolean),
    status: c.status.label,
    statusReasons: c.status.reasons,
    needsAttentionNow: c.timeline.next.map((n) => `${n.label}: ${n.detail}`),
    last21Days: c.timeline.story,
    trainingDaysLast21: new Set(c.timeline.strip.filter((x) => x.kinds.includes('training')).map((x) => x.day)).size,
    training: { weeksDone: c.training.weeksCompleted, weeksTotal: c.training.weeksTotal, weeks1to3Gate: `${c.training.gateDone}/3` },
    gov: c.gov && { pursuit: c.gov.title, stage: c.gov.stage },
    certification: c.cert && { sittings: c.cert.sittings, scored: c.cert.completed },
    theirAsks: c.asks,
    waitingOnAliReply: c.emails.awaitingReply,
  };
}

const numbersIn = (s: string): string[] => (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
const head = (t: string): string => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

/** Returns the cleaned paragraph, or the reason it was rejected. */
export function validateSummary(text: unknown, facts: Record<string, unknown>): { ok: true; summary: string } | { ok: false; reason: string } {
  const s = String(text ?? '').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim();
  if (!s) return { ok: false, reason: 'empty' };
  if (/\b(he|she|his|her|hers|him)\b/i.test(s)) return { ok: false, reason: 'gendered pronoun' };
  const sentences = s.split(/(?<=[.!?])\s+(?=[A-Z"])/).filter((x) => x.trim().length > 0);
  if (sentences.length < 2 || sentences.length > 3) return { ok: false, reason: `${sentences.length} sentences` };
  if (s.length > 650) return { ok: false, reason: 'too long' };
  const name = String(facts.firstName ?? '');
  if (name && !s.toLowerCase().startsWith(name.toLowerCase())) return { ok: false, reason: 'does not start with their name' };
  // Counts live in the progress bar above the paragraph. Restating them is where "46 of 136"
  // (the real number was 47) and "4 days out of 12" came from, so the paragraph may not.
  if (/\d+\s+(?:[a-z]+\s+)?(?:out\s+)?of\s+(?:a\s+total\s+of\s+)?\d+/i.test(s)) return { ok: false, reason: 'restates a count' };
  // Training is activity: "has not worked on anything" about someone who trained is false.
  if (Number(facts.trainingDaysLast21 ?? 0) > 0 && /not (?:worked on|done) anything|no (?:recorded )?activit|not made any progress|no progress/i.test(s)) {
    return { ok: false, reason: 'says no activity but they trained' };
  }
  // Sentence 1 is current work; the next story and late tasks are not.
  const last = String(facts.lastWorkedOn ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const first = sentences[0].toLowerCase().replace(/[^a-z0-9 ]/g, '');
  for (const t of (facts.notStartedYet as string[] | undefined) ?? []) {
    // Word overlap, not an exact prefix: the model inflects ("review" -> "reviewing").
    const words = head(t.replace(/^late: /, '')).split(' ').filter((w) => w.length >= 4);
    if (words.length < 3) continue;
    const share = (text: string): number => words.filter((w) => text.includes(w)).length / words.length;
    if (share(first) >= 0.7 && share(last) < 0.7) return { ok: false, reason: 'next/late story described as current work' };
  }
  const allowed = new Set(numbersIn(JSON.stringify(facts)));
  const invented = numbersIn(s).filter((n) => !allowed.has(n));
  if (invented.length) return { ok: false, reason: `number not in facts: ${invented.join(', ')}` };
  return { ok: true, summary: s };
}

/** The paragraph without a model: specific where the data is, silent where it is not. */
export function fallbackSummary(c: InternCard): string {
  const p = c.project;
  const out: string[] = [];
  if (!p) {
    const trained = new Set(c.timeline.strip.filter((x) => x.kinds.includes('training')).map((x) => x.day)).size;
    out.push(`${c.firstName} has no project yet; training is at week ${c.training.weeksCompleted} with the weeks 1-3 gate at ${c.training.gateDone}/3${trained ? `, with training activity on ${trained} of the last 21 days` : ''}.`);
  } else {
    const commit = p.commitsRecent[0];
    const story = p.verifiedRecent[0];
    const did = commit && story
      ? `last committed "${cleanCommit(commit.message)}" and last verified "${story.title}"`
      : commit ? `last committed "${cleanCommit(commit.message)}"`
        : story ? `last verified "${story.title}"` : 'has no build work in the last 21 days';
    out.push(p.tasksTotal
      ? `${c.firstName} is ${buildStage(c)} on ${p.name} and ${did}.`
      : `${c.firstName} is on ${p.name}, whose build plan has no stories yet, and ${did}.`);
  }
  const quiet = c.timeline.quietNow;
  if (p && quiet !== null) out.push(quiet === 0 ? 'They built today.' : `Their last build work was ${quiet} ${quiet === 1 ? 'day' : 'days'} ago.`);
  const n = c.timeline.next[0];
  if (n) out.push(`Right now: ${n.label.toLowerCase()}, ${n.detail}.`);
  return out.slice(0, 3).join(' ');
}

async function summarizeOne(client: ChatClient, c: InternCard): Promise<string | null> {
  const facts = summaryFacts(c);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const resp = await client.chat.completions.create({
      model: SUMMARY_MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(facts) }],
    }, { signal: ctl.signal });
    let parsed: unknown;
    try { parsed = JSON.parse(String(resp?.choices?.[0]?.message?.content ?? '')); } catch { parsed = null; }
    const v = validateSummary((parsed as { summary?: unknown } | null)?.summary, facts);
    if (v.ok) return v.summary;
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'internship-portfolio-report', event: 'summary_rejected', outcome: 'partial', error_class: 'ContractViolation', context: { intern: c.firstName, reason: v.reason } }));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Sets every card's `summary` (model when it passes the checks, fallback otherwise). */
export async function summarizeInterns(report: PortfolioReport, client: ChatClient | null): Promise<{ fromModel: number; total: number }> {
  const cards = report.groups.flatMap((g) => g.interns);
  for (const c of cards) { c.summary = fallbackSummary(c); c.summaryFromModel = false; }
  if (!client) return { fromModel: 0, total: cards.length };
  let cursor = 0;
  let ok = 0;
  const worker = async (): Promise<void> => {
    while (cursor < cards.length) {
      const c = cards[cursor++];
      try {
        const s = await summarizeOne(client, c);
        if (s) { c.summary = s; c.summaryFromModel = true; ok += 1; }
      } catch (err) {
        const e = err as Error;
        console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'internship-portfolio-report', event: 'summary_failed', outcome: 'partial', error_class: e?.name === 'AbortError' ? 'TimeoutError' : 'UpstreamUnavailable', context: { intern: c.firstName, message: e?.message } }));
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return { fromModel: ok, total: cards.length };
}
