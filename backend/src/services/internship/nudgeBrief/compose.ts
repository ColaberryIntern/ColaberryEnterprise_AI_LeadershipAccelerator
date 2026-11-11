/**
 * compose - PURE. One SidecarIntern in, one long message out.
 *
 * The shape of the message is decided by the triage tier, because the tiers need genuinely
 * different messages and the old one-line composer gave them all the same one:
 *
 *   blocked_waiting_on_ali   an ANSWER. Their question is quoted first; an ask bolted onto an
 *                            unanswered question reads as not having been read.
 *   no_project_at_day_N      a CONVERSATION. Pick a project, or say honestly that this is not working.
 *   never_started_building   an ESCALATION. Four honest outs, and a reply required by a named day.
 *   overdue_backlog          an ORDERED PLAN, plus "tell me now what you will not have".
 *   quiet                    one SPECIFIC next step, naming the actual next story.
 *   on_track                 an ARTIFACT ASK.
 *
 * A deadline inside two weeks overrides the tier and leads the message, because days remaining is
 * the only fact that changes what someone does this afternoon.
 *
 * Everything here is deterministic: same sidecar in, same words out. Nothing is invented. Where a
 * fact is missing the sentence that would have used it is omitted rather than guessed, and the gap
 * is reported in `warnings` so a manager can see what the message is NOT saying.
 */
import type { SidecarIntern, TriageTier } from '../portfolioReport/sidecar/types';
import { briefProblems, type BriefDeadline, type BriefInputs, type BriefPromise, type NudgeBrief } from './types';
import {
  chooseFocus, close, lead, longDate, nextAction, subjectFor, theOneThing, wayThrough,
} from './shapes';

/** A deadline at or inside this many days leads the message instead of the tier. */
export const DEADLINE_LEADS_WITHIN_DAYS = 14;

const nf = (n: number) => new Intl.NumberFormat('en-US').format(n);

/** The day-word a promise was made with. Keeping the promise means naming this day again. */
const PROMISE_WHEN = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this week|next week)\b/i;

export function findPromises(intern: SidecarIntern): BriefPromise[] {
  const last = intern.last_ask;
  if (!last?.body_text || last.from?.toLowerCase().includes('@colaberry.com') === false) return [];
  const dated = /\b(by|before|on|this)\s+(monday|tuesday|wednesday|thursday|friday|week|today|tomorrow|\d{1,2}\s+\w+)\b/i;
  const commits = /\b(i will|you will have|i am getting you|will be made|with a date|i will tell you|you will get)\b/i;
  const out: BriefPromise[] = [];
  for (const raw of last.body_text.split(/(?<=[.!?])\s+|\n+/)) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (s.length < 20 || s.length > 240) continue;
    if (commits.test(s) && dated.test(s)) out.push({ sentAt: last.sent_at, subject: last.subject, quote: s });
    if (out.length === 4) break;
  }
  return out;
}

function askBlock(i: SidecarIntern): { lines: string[]; attachment: NudgeBrief['attachment'] } {
  const ask = i.asks[0];
  if (!ask) return { lines: [], attachment: null };
  const filename = `${ask.key.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`;
  return {
    lines: ['', ask.nudge, '', `The prompt is attached as ${filename}. Open Claude Code in your repository, paste it in, and correct what it gets wrong before you send it back.`],
    attachment: { filename, prompt: ask.prompt },
  };
}

/** The closing sentence, which is always a request for one specific reply. */
function signalsOf(i: SidecarIntern): NudgeBrief['signals'] {
  return {
    day: i.day ?? null,
    percentBuilt: i.percent_built ?? null,
    storiesVerified: i.stories_verified ?? null,
    storiesTotal: i.stories_total ?? null,
    overdueTasks: i.overdue_tasks ?? null,
    daysSinceBuildWork: i.days_since_build_work ?? null,
    artifacts: i.artifacts_real_count,
    trainingWeeksCompleted: i.training.weeks_completed,
    trainingWeeksTotal: i.training.weeks_total,
    gateCleared: i.training.gate_cleared,
    openQuestions: i.open_questions.length,
    hasRepo: Boolean(i.project?.repo_url),
  };
}

/**
 * The newest message FROM them that landed after our last message TO them, or null.
 *
 * Compared in milliseconds rather than on the date string, because the two timestamps routinely
 * fall on the same day and a date comparison would call a reply that arrived ninety minutes later
 * "not since".
 */
function inboundSince(i: SidecarIntern): string | null {
  const ours = i.last_ask ? Date.parse(i.last_ask.sent_at) : null;
  let newest: string | null = null;
  for (const q of i.open_questions) {
    const at = Date.parse(q.received_at);
    if (Number.isNaN(at)) continue;
    if (ours !== null && !Number.isNaN(ours) && at <= ours) continue;
    if (newest === null || at > Date.parse(newest)) newest = q.received_at;
  }
  return newest;
}

export function composeBrief({ intern, deadline, now }: BriefInputs): NudgeBrief {
  const warnings: string[] = [];
  // Destructured, not dotted. See the note on opening() for why that matters here.
  const { tier } = intern.triage;
  const leads = deadline !== null && deadline.daysLeft <= DEADLINE_LEADS_WITHIN_DAYS;

  // ONE focus, chosen hardest truth first, and it decides every line below. The old code let a
  // near deadline silently override the tier, which is how somebody with nothing built at all got
  // a cheerful countdown instead of the conversation he needed.
  const focus = chooseFocus(intern, deadline);
  const awaitingAli = focus === 'answer_owed';

  const para = (xs: string[]): void => { if (xs.length) { if (lines.length) lines.push(''); lines.push(...xs); } };

  const lines: string[] = [`${intern.first_name},`];
  para(lead(intern, focus, now.getTime()));
  // Where the HEAD ends. The name line and the opener are structural: the sender and several
  // tests depend on the first line being their name, and `lead` is the one block that already
  // references their own words. A model rewriting the middle never touches either.
  const headLines = lines.length;

  para(theOneThing(intern, focus, deadline));
  para(nextAction(intern, focus, deadline));
  const ask = focus === 'artifact_gap' ? askBlock(intern) : { lines: [] as string[], attachment: null };
  if (ask.attachment) para([`A prompt to start it is attached as ${ask.attachment.filename}.`]);
  para(wayThrough(focus, deadline));
  const middleLines = lines.length;

  para(close(focus));


  if (awaitingAli) {
    warnings.push('This one needs YOUR answer. The generated text only acknowledges their question; it deliberately does not attempt to answer it, because the answer is a judgement and no judgement is in the database. Write the answer before sending.');
  }
  if (!intern.communications?.length) {
    warnings.push('No conversation history was found for this intern, so the message is written from build data alone and cannot reference anything they have said.');
  }
  if (intern.project && !intern.project.repo_url) {
    warnings.push('This project carries no repository URL. Repo provisioning writes to github_connections instead, so check there before telling them their project looks empty.');
  }
  const subject = subjectFor(intern, focus, deadline);

  const tidy = (xs: string[]): string => xs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const body = tidy(lines);
  /**
   * The same body in three pieces, so a model may rewrite the middle without being able to touch
   * the first line or the last. `assembleBody` in modelBody.ts puts it back together; keeping the
   * split here means the pieces can never drift from the body this function already returned,
   * which a second assembly site would allow.
   */
  const bodyParts = {
    head: tidy(lines.slice(0, headLines)),
    middle: tidy(lines.slice(headLines, middleLines)),
    tail: tidy(lines.slice(middleLines)),
  };

  /**
   * A dated promise WE made that today's message neither keeps nor re-dates.
   *
   * `findPromises` reads our own last outbound, so these are commitments Ali made to them. On
   * 2026-11-11 Quincy's brief carried "On the six: you will have them before Friday." verbatim and
   * his message did not contain the word Friday, or any content word from that sentence. The data
   * was present and the composer walked past it.
   *
   * This is a warning rather than a generated sentence on purpose: whether a promise is kept or
   * moved is a decision about what Ali will actually do, and no judgement of that kind is in the
   * database. The composer's job here is to make sure it cannot lapse in silence.
   */
  const promises = findPromises(intern);
  for (const p of promises) {
    const when = PROMISE_WHEN.exec(p.quote)?.[0];
    if (when && !new RegExp(`\\b${when}\\b`, 'i').test(body)) {
      warnings.push(
        `We promised them a date and this message does not mention it: "${p.quote}" Decide before sending whether today's message holds that date or gives them a new one.`,
      );
    }
  }

  warnings.push(...briefProblems(body));

  return {
    enrollmentId: intern.enrollment_id,
    name: intern.name,
    firstName: intern.first_name,
    email: null,
    tier,
    tierReason: intern.triage.reason,
    trackLabel: intern.track_label,
    projectName: intern.project?.name ?? null,
    projectId: intern.project?.id ?? null,
    openQuestions: intern.open_questions.map((q) => ({
      receivedAt: q.received_at, subject: q.subject, text: q.text,
    })),
    signals: signalsOf(intern),
    lastOutbound: intern.last_ask
      ? { sentAt: intern.last_ask.sent_at, subject: intern.last_ask.subject ?? null }
      : null,
    inboundSince: inboundSince(intern),
    deadline,
    promises,
    subject,
    body,
    // What ships when nobody has read it. Ali, 2026-11-11: an unattended send uses the
    // deterministic wording, and a model-written body stays in the console for approval. So this
    // field is never overwritten by the upgrade step, and the 48 hour worker sends THIS.
    deterministicBody: body,
    bodyFromModel: false,
    bodyParts,
    // Gated on the SAME condition as the ask lines. Dropping only the lines left Sarbjit's message
    // carrying `format-correction.md` with nothing in the body mentioning it: an unexplained
    // attachment on a four-line note, which reads as a mistake because it is one.
    attachment: awaitingAli ? null : ask.attachment,
    warnings,
    generatedAt: now.toISOString(),
  };
}

