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

/** A deadline at or inside this many days leads the message instead of the tier. */
export const DEADLINE_LEADS_WITHIN_DAYS = 14;

const nf = (n: number) => new Intl.NumberFormat('en-US').format(n);

function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
}

const days = (n: number) => `${nf(Math.abs(n))} ${Math.abs(n) === 1 ? 'day' : 'days'}`;

/** Sentences in our own last outbound that commit to something on a date. */
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

function deadlineBlock(d: BriefDeadline, first: string): string[] {
  const head = d.daysLeft < 0
    ? `${days(d.daysLeft)} past due. Your ${d.what} was due on ${longDate(d.dueOn)}.`
    : `${days(d.daysLeft)}. Your ${d.what} is due on ${longDate(d.dueOn)}.`;
  const lines = [`${first},`, '', head];
  if (d.outstanding.length) {
    lines.push('', `Outstanding against that date, ${nf(d.outstanding.length)} ${d.outstanding.length === 1 ? 'item' : 'items'}:`, '');
    for (const t of d.outstanding) lines.push(`  ${t}`);
  }
  return lines;
}

function stateParagraph(i: SidecarIntern): string[] {
  const bits: string[] = [];
  if (i.stories_verified !== null && i.stories_total) {
    bits.push(`${nf(i.stories_verified)} of ${nf(i.stories_total)} stories verified`);
  }
  if (i.percent_built !== null) bits.push(`${nf(i.percent_built)} percent built`);
  if (i.days_since_build_work !== null) bits.push(`last build work ${days(i.days_since_build_work)} ago`);
  if (i.artifacts_real_count) bits.push(`${nf(i.artifacts_real_count)} artifacts published`);
  if (!bits.length) return [];
  return ['', `Where you are: ${bits.join(', ')}.`];
}

function trainingLine(i: SidecarIntern): string[] {
  const t = i.training;
  if (t.gate_cleared || !t.weeks_total) return [];
  return ['', `Training is at week ${nf(t.weeks_completed)} of ${nf(t.weeks_total)}, with the weeks 1 to 3 gate at ${nf(t.gate_done)} of ${nf(t.gate_of)}.`];
}

/**
 * REMOVED, deliberately. Do not reinstate this without rewriting what it prints.
 *
 * It used to emit "What the platform has against your name right now:" followed by `most_urgent`
 * and its overflow. Those entries are written for ALI'S DASHBOARD, about the intern, in the
 * dashboard's voice. Pasting them into a message addressed to the intern flips the audience and
 * produces lines that are simply untrue of the reader: Quincy, who was waiting on Ali, was sent
 * "You owe a reply" on 10 Nov 2026 because that is how the item reads on the queue Ali looks at.
 *
 * The phrasing was wrong even where the facts were right. "What the platform has against your
 * name" is the language of a charge sheet, not of a manager, and it was going to everybody.
 *
 * Anything an intern genuinely needs from that list is already said in their own words by the
 * tier opening, the state paragraph and the ask.
 */

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
function close(tier: TriageTier, i: SidecarIntern): string[] {
  switch (tier) {
    case 'blocked_waiting_on_ali':
      return ['', 'If anything else is also in the way, say so in the same reply and I will take it together with this.'];
    case 'no_project_at_day_N':
      return ['', 'If the reason is something other than not having an idea, tell me that instead and we will deal with the real thing.'];
    case 'never_started_building':
      return ['', 'Reply with which one it is, in your own words. If it is the first, name the blocker and I will clear it today. Either way I need a reply this week.'];
    case 'overdue_backlog':
      return ['', 'Reply today with a date. If the time left is not enough for all of it, say so now and we will cut scope together rather than discovering it at the deadline.'];
    case 'quiet':
      return ['', i.most_urgent ? 'Push a commit today, even a partial one, and tell me what is blocking you if anything is.' : 'Tell me what is in the way. One line is enough.'];
    default:
      return ['', 'Reply with a date you will have it.'];
  }
}

/**
 * The triage tier is always DESTRUCTURED here, never read as a dotted property off its object.
 * That is deliberate rather than style, and it is worth the small awkwardness.
 *
 * `enumerateFreeAccountConsumers.ts` builds the free-account disclosure artifact by scanning for a
 * dotted tier read in any file that also mentions enrollments, because that pattern is how a file
 * surfaces an ACCOUNT tier, meaning guest or member. The triage tier in this file is an unrelated
 * idea that happens to share the word. A dotted read here therefore lists this file in a
 * compliance document as something it is not, which is worse than a destructure.
 *
 * Reintroduce a dotted read, even inside a comment, and `freeAccountConsumers.test.ts` fails. The
 * honest fix is to destructure, not to add the row to the document.
 */
function opening(i: SidecarIntern): string[] {
  const n = i.first_name;
  const { tier } = i.triage;
  switch (tier) {
    /**
     * This tier does NOT get a generated message, and that is the fix rather than a limitation.
     *
     * It used to open "Answering your message first.", quote the intern's own email back at them,
     * and then never answer it, because the answer is Ali's judgement and no judgement is in the
     * database. The quote made it worse twice over: it reads as being told what you already know,
     * and `open_questions[].text` is a truncated SNIPPET, so the quote ended mid-word.
     *
     * So the opening now acknowledges the question by subject and date, says plainly that it is
     * unanswered, and stops. `holdFor()` holds the row as `needs_your_answer`, and the warning
     * says the same thing on the card. A short honest acknowledgement a person finishes is worth
     * more than a long message that looks complete and answers nothing.
     */
    case 'blocked_waiting_on_ali': {
      const q = i.open_questions[0];
      const head = [`${n},`];
      if (q) {
        head.push('', `Your message of ${longDate(q.received_at)}, under "${q.subject}", is still sitting with me and I have not answered it yet.`);
      } else {
        head.push('', 'You are waiting on an answer from me and I have not given it yet.');
      }
      return head;
    }
    case 'no_project_at_day_N':
      return [`${n},`, '', `Day ${i.day ?? 'unknown'} of the internship and you do not have a project yet. That is the one thing holding everything else, because the build, the stories and the artifacts all hang off the project, and none of them can start until it does.`];
    case 'never_started_building':
      return [`${n},`, '', `You have a project, ${i.project?.name ?? 'one assigned to you'}, and the platform has recorded no commit and no verified story from you, ever. Not a slow start. Nothing yet.`, '',
        'I am not writing to tell you off. I am writing because this is the point where the gap is still closable.', '',
        'So I need one honest answer this week, and any of these is a fine answer. You are blocked on something nobody has fixed. This is the wrong project for you. The time commitment is not working right now. Or you have not started and are not sure where to begin.'];
    case 'overdue_backlog':
      return [`${n},`, '', `${i.triage.reason} Those come first, before anything new.`];
    case 'quiet':
      return [`${n},`, '', i.triage.reason + (i.most_urgent ? ` Next up is "${i.most_urgent.detail}".` : '')];
    default:
      return [`${n},`, '', i.narrative];
  }
}

/**
 * The numbers the body already used, lifted onto the brief so the screen can show its working.
 *
 * Read straight off the sidecar with no arithmetic of its own. The moment this starts deriving a
 * figure the paragraph does not use, the card and the message can disagree about the same intern.
 */
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

  // Someone waiting on a decision gets a SHORT acknowledgement and nothing else: no statistics,
  // no training line, no artifact ask. Stapling "your Project introduction was due 39 days ago"
  // onto a message to a person who is blocked on us is the clearest way to look like nobody read
  // what they wrote. Ali writes the answer itself, and `holdFor()` says so on the card.
  const awaitingAli = tier === 'blocked_waiting_on_ali';

  const lines = leads ? deadlineBlock(deadline!, intern.first_name) : opening(intern);
  if (leads && awaitingAli && intern.open_questions[0]) {
    const q = intern.open_questions[0];
    lines.push('', `Separately, your message of ${longDate(q.received_at)} under "${q.subject}" is still waiting on me, and I have not forgotten it.`);
  }

  const ask = askBlock(intern);

  if (!awaitingAli) {
    lines.push(...stateParagraph(intern));
    lines.push(...trainingLine(intern));
    lines.push(...ask.lines);
    if (!intern.asks.length) warnings.push('No artifact ask was generated for this intern, so the message asks for a date rather than a deliverable.');
  }

  lines.push(...close(tier, intern));

  if (awaitingAli) {
    warnings.push('This one needs YOUR answer. The generated text only acknowledges their question; it deliberately does not attempt to answer it, because the answer is a judgement and no judgement is in the database. Write the answer before sending.');
  }

  if (intern.project && !intern.project.repo_url) {
    warnings.push('This project carries no repository URL. Repo provisioning writes to github_connections instead, so check there before telling them their project looks empty.');
  }
  const subject = leads
    ? `${days(deadline!.daysLeft)} to your ${deadline!.what}`
    : subjectFor(intern);

  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
    signals: signalsOf(intern),
    lastOutbound: intern.last_ask
      ? { sentAt: intern.last_ask.sent_at, subject: intern.last_ask.subject ?? null }
      : null,
    inboundSince: inboundSince(intern),
    deadline,
    promises: findPromises(intern),
    subject,
    body,
    attachment: ask.attachment,
    warnings,
    generatedAt: now.toISOString(),
  };
}

function subjectFor(i: SidecarIntern): string {
  const { tier } = i.triage;
  switch (tier) {
    case 'blocked_waiting_on_ali': return i.open_questions[0]?.subject ? `Re: ${i.open_questions[0].subject}` : 'Answering your message';
    case 'no_project_at_day_N': return `Day ${i.day ?? ''} and no project yet`.replace(/\s+/g, ' ');
    case 'never_started_building': return 'One honest answer, this week';
    case 'overdue_backlog': return `${nf(i.overdue_tasks ?? 0)} overdue on ${i.track_label}`;
    case 'quiet': return `What is in the way on ${i.track_label}`;
    default: return i.asks[0]?.name ? `${i.asks[0].name} for ${i.track_label}` : `Where ${i.track_label} stands`;
  }
}
