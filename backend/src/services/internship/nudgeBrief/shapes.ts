/**
 * shapes - what the message is ABOUT, and how it is said.
 *
 * This is the rebuild Ali asked for on 2026-11-10 after reading a batch of generated messages:
 *
 *     "How you are framing the responses is all wrong. You aren't even talking about the correct
 *      things in this email. Not sure how you got so far off."
 *
 * The old composer stapled five blocks together, each written for a different reader: a tier
 * opening, a statistics line, a dashboard urgency list, a training line and a generic ask. Every
 * message opened with a deficit and all six ended with the identical sentence telling the intern
 * to paste our prompt into Claude Code and correct what it gets wrong.
 *
 * ## The shape
 *
 * One message, one focus, in this order:
 *
 *   1. LEAD        what they did, or what actually changed. Never a deficit, never a count.
 *   2. THE ONE THING  the single item that decides their week.
 *   3. NEXT ACTION the specific thing to do, named, with where to do it.
 *   4. WAY THROUGH an option that is not quitting: cut scope, name the blocker.
 *   5. CLOSE       one reply, with a date.
 *
 * ## It reads their mail
 *
 * `intern.communications` is their own messages, ranked, both directions. Until 2026-11-10 the
 * brief path never received it: the database held 216 conversations and the composer could see
 * zero, for 13 of 13 interns. It is now the first thing consulted, because a message that does not
 * reference what somebody told you reads as not having been read.
 *
 * The excerpt is NOT quoted. It is a truncated snippet, and quoting one is how Quincy's message
 * ended mid-word at "the live expor". Reference it by subject and date instead.
 *
 * ## What it refuses to say
 *
 * No gate jargon. No count restated as a sentence. No diagnostic string presented as a task name,
 * which is how Kalkidan was told her next task was "no commit or verified story since 11-05". No
 * second date for the same piece of work. The rules are in `.claude/skills/intern-nudges`, rule 0.
 */
import type { Communication, SidecarIntern, SidecarNext } from '../portfolioReport/sidecar/types';
import type { BriefDeadline } from './types';

/** What this message is about. Exactly one is chosen, and it decides every line. */
export type Focus =
  | 'answer_owed'
  | 'deadline_at_risk'
  | 'no_project'
  | 'never_started'
  | 'stalled'
  | 'artifact_gap';

const DAY = 86400000;
const nf = (n: number) => new Intl.NumberFormat('en-US').format(n);

export function longDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
}

export const days = (n: number) => `${nf(Math.abs(n))} ${Math.abs(n) === 1 ? 'day' : 'days'}`;

/**
 * The focus, hardest truth first.
 *
 * A deadline no longer silently overrides everything: someone who has never started is told that
 * starting is the problem, not given a countdown to a date they cannot reach. That ordering was
 * how Anamelechi got a cheerful "14 days to your case study package" with 0 of 16 stories built.
 */
export function chooseFocus(i: SidecarIntern, deadline: BriefDeadline | null): Focus {
  if (i.triage.tier === 'blocked_waiting_on_ali') return 'answer_owed';
  if (!i.project) return 'no_project';

  const nothingEverBuilt = (i.stories_verified ?? 0) === 0 && (i.counts?.commits ?? 0) === 0;
  if (nothingEverBuilt) return 'never_started';

  if (deadline && deadline.daysLeft <= 14 && deadline.outstanding.length > 0) return 'deadline_at_risk';
  if ((i.days_since_build_work ?? 0) >= 4) return 'stalled';
  return 'artifact_gap';
}

/** Their most recent message to us, which is the thing a reply has to acknowledge. */
export function theirLastWord(i: SidecarIntern): Communication | null {
  const mine = (i.communications ?? []).filter((c) => c.direction === 'from_intern');
  if (!mine.length) return null;
  return [...mine].sort((a, b) => Date.parse(b.received_at) - Date.parse(a.received_at))[0];
}

/**
 * A `most_urgent` entry only when its `detail` is a real piece of work.
 *
 * `stuck` and `reply` details are diagnostics written for the dashboard, not task names. Kalkidan
 * was told her next task was "no commit or verified story since 11-05" because nothing checked.
 */
export function nextRealTask(i: SidecarIntern): SidecarNext | null {
  const all = [i.most_urgent, ...(i.most_urgent_overflow ?? [])].filter((x): x is SidecarNext => !!x);
  return all.find((n) => n.kind === 'next' || n.kind === 'late') ?? null;
}

/**
 * The opening: what they did, or what changed. Never a deficit.
 *
 * Prefers their own last message, because referencing it is the clearest possible proof that this
 * was written after reading rather than before.
 */
export function lead(i: SidecarIntern, focus: Focus, nowMs: number): string[] {
  const word = theirLastWord(i);
  if (word) {
    const age = Math.round((nowMs - Date.parse(word.received_at)) / DAY);
    if (age <= 14) {
      const owed = word.answered === false ? ' I have not answered it yet, and that is on me.' : '';
      return [`Thank you for your note of ${longDate(word.received_at)} about "${word.subject}".${owed}`];
    }
  }

  const built = i.percent_built;
  const verified = i.stories_verified ?? 0;
  if (focus !== 'no_project' && focus !== 'never_started' && built !== null && verified > 0) {
    const recent = (i.days_since_build_work ?? 99) <= 3 ? ', and you were committing this week' : '';
    return [`Your build on ${i.project?.name ?? i.track_label} is ${nf(built)} percent through${recent}.`];
  }

  switch (focus) {
    case 'no_project':
      return ['I want to get your project settled, because everything else waits on it.'];
    case 'never_started':
      return ['I am going to be straight with you, because the calendar is not.'];
    default:
      return [`A short one about ${i.project?.name ?? i.track_label}.`];
  }
}

/** The single item that decides their week. */
export function theOneThing(i: SidecarIntern, focus: Focus, deadline: BriefDeadline | null): string[] {
  switch (focus) {
    case 'answer_owed':
      return ['Nothing else from me until I have answered you properly.'];

    case 'deadline_at_risk': {
      const d = deadline!;
      const when = d.daysLeft < 0
        ? `was due on ${longDate(d.dueOn)}`
        : `is due on ${longDate(d.dueOn)}, ${days(d.daysLeft)} from now`;
      const n = d.outstanding.length;
      return [
        `What is at risk is the recording. Your ${d.what} ${when}, and ${nf(n)} ${n === 1 ? 'piece is' : 'pieces are'} still outstanding.`,
      ];
    }

    case 'no_project':
      return [
        `It is day ${i.day ?? 'this far in'} and there is still no project on your name. The build, the stories and the artifacts all hang off it, so none of them can start until it does.`,
      ];

    case 'never_started': {
      const dl = deadline ? ` Your case study package is dated ${longDate(deadline.dueOn)}, and that is not enough time to build the system and record six presentations on top of it.` : '';
      return [
        `Nothing has been built on ${i.project?.name ?? 'your project'} yet. No verified story and no commit.${dl} So the date is not the real problem. Starting is.`,
      ];
    }

    case 'stalled': {
      const q = i.days_since_build_work;
      const task = nextRealTask(i);
      const next = task ? ` The next thing on it is "${task.detail}".` : '';
      return [`There has been no commit or verified story for ${days(q ?? 0)}.${next}`];
    }

    default: {
      const ask = i.asks[0];
      return ask ? [`The one thing still missing is your ${askNoun(ask.name)}.`] : ['There is one small thing I would like from you.'];
    }
  }
}

/**
 * The ask as a NOUN, so it can follow "your" without reading like a command spliced into a clause.
 *
 * `asks[].name` is a mixture: "Capability Map" and "Command Center" are nouns, while the
 * presentation asks arrive as "Record your Project introduction". Used raw, the latter produced
 * "The one gap is your Record your Project introduction."
 */
export function askNoun(name: string): string {
  const m = name.match(/^record your (.+)$/i);
  return m ? `${m[1]} recording` : name;
}

/** The specific thing to do, named, and where. Never a category. */
export function nextAction(i: SidecarIntern, focus: Focus, deadline: BriefDeadline | null): string[] {
  switch (focus) {
    case 'answer_owed':
      return [];

    case 'deadline_at_risk': {
      const first = deadline!.outstanding[0];
      if (!first) return [];
      const local = i.project?.repo_url
        ? ' Run it locally with your server up rather than from a published link, because those screens call your own API.'
        : '';
      return [`Start with "${first}". It is the one an employer actually watches.${local} The Presentation Studio in your project is where you record it.`];
    }

    case 'no_project':
      return ['Send me one paragraph on what you want to build and who it is for. One paragraph is enough to pick it; I will do the rest.'];

    case 'never_started':
      return [
        'Tell me which of these is true, in your own words. You are blocked on something we have not fixed. The project is wrong for you. The hours are not there at the moment. Or you have not known where to begin.',
      ];

    case 'stalled': {
      const task = nextRealTask(i);
      return task
        ? [`Push whatever you have on "${task.detail}" today, even partially, so I can see where it stands.`]
        : ['Push whatever you have today, even partially, so I can see where it stands.'];
    }

    /**
     * Written here rather than taken from `ask.why` or `ask.nudge`.
     *
     * Both of those are composed for Ali's dashboard and are in the third person: `why` on the
     * presentation ask reads "It is the next presentation in THEIR project plan". Pasting either
     * into the message reintroduced the exact defect the third-person fix removed, and `nudge`
     * additionally carries the "paste the prompt and correct what it gets wrong" boilerplate and
     * repeats the due date a second time.
     */
    default: {
      const ask = i.asks[0];
      if (!ask) return [];
      const where = /^presentation/i.test(ask.key)
        ? 'Record it in the Presentation Studio in your project. Fifteen minutes is enough, and it does not need to be perfect.'
        : 'Build it in your repository and send me the link when it is live.';
      return [where];
    }
  }
}

/** An option that is not quitting. */
export function wayThrough(focus: Focus, deadline: BriefDeadline | null): string[] {
  switch (focus) {
    case 'deadline_at_risk': {
      const n = deadline?.outstanding.length ?? 0;
      if (n <= 1) return [];
      return [`If all ${nf(n)} is not realistic in the time left, tell me today which ones you want to keep and I will move the rest. I would rather cut scope with you now than discover it on the day.`];
    }
    case 'never_started':
      return ['Any of those is a fine answer and none of them ends your internship. The one I cannot work with is silence.'];
    case 'no_project':
      return ['If the reason is something other than not having an idea, say that instead and we will deal with the real thing.'];
    case 'stalled':
      return ['If something is in the way, name it and I will clear it rather than ask you again.'];
    default:
      return [];
  }
}

/** One reply, with a date. */
export function close(focus: Focus): string[] {
  switch (focus) {
    case 'answer_owed':
      return ['If anything else is also in the way, say so in the same reply and I will take it together with this.'];
    case 'deadline_at_risk':
      return ['Reply today with the day you will have the first one recorded.'];
    case 'no_project':
      return ['Send me the paragraph by Thursday.'];
    case 'never_started':
      return ['One line back, by Thursday.'];
    case 'stalled':
      return ['Tell me today where it stands, even if the answer is that it has not moved.'];
    default:
      return ['Reply with the day you will have it.'];
  }
}

/** The subject line, which names the one thing rather than a status. */
export function subjectFor(i: SidecarIntern, focus: Focus, deadline: BriefDeadline | null): string {
  switch (focus) {
    case 'answer_owed': {
      const word = theirLastWord(i);
      return word?.subject ? `Re: ${word.subject}` : 'Answering your message';
    }
    case 'deadline_at_risk':
      return `${days(deadline!.daysLeft)} to your ${deadline!.what}`;
    case 'no_project':
      return 'Your project, and getting it picked this week';
    case 'never_started':
      return 'One honest answer, this week';
    case 'stalled':
      return `Where ${i.project?.name ?? i.track_label} stands`;
    default:
      return i.asks[0]?.name ? `${i.asks[0].name} for ${i.project?.name ?? i.track_label}` : `Where ${i.track_label} stands`;
  }
}
