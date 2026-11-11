import { composeBrief } from '../compose';
import { chooseFocus, nextRealTask, theirLastWord } from '../shapes';
import { briefProblems } from '../types';
import type { SidecarIntern, TriageTier } from '../../portfolioReport/sidecar/types';

/**
 * The rebuilt message: what it is ABOUT, and what it refuses to say.
 *
 * Every case here is a sentence that actually went to an intern on 2026-11-10, or a rule from
 * `.claude/skills/intern-nudges` rule 0, which was written from that batch.
 */

const NOW = new Date('2026-11-10T12:00:00Z');

function intern(over: Partial<SidecarIntern> = {}): SidecarIntern {
  return {
    name: 'Quincy Nkwain Ninying', first_name: 'Quincy', enrollment_id: 'e1',
    track: 'agent', track_label: 'Platform Automation', link: null, day: 41,
    status: { key: 'ok', label: 'On track' }, chips: [],
    narrative: 'Quincy is well underway. Their last build work was 3 days ago.', narrative_from_model: false, story: '',
    project: { name: 'Agent: Ellis', id: 'p1', kind: 'agent', repo_url: 'https://github.com/x/y', command_center_url: null, stage: 'build' },
    stories_verified: 47, stories_total: 136, percent_built: 35, overdue_tasks: 0,
    training: { weeks_completed: 12, weeks_total: 12, gate_cleared: true, gate_done: 3, gate_of: 3 },
    days_since_build_work: 3, build_work_in_window: true,
    counts: { verified: 47, commits: 20, asks: 1, blockers: 0, replies_from_ali: 4, stuck_events: 0, training_days: 30 },
    most_urgent: { kind: 'stuck', label: 'Stuck', detail: 'no commit or verified story since 11-05' },
    most_urgent_overflow: [], timeline: [], asking_you: [], asking_you_from_model: false,
    open_questions: [], nudge: '', artifacts: [], artifacts_raw_count: 0, artifacts_real_count: 24,
    asks: [{ key: 'capability_map', name: 'Capability Map', why: 'Build the one page per capability.', prompt: 'PROMPT', nudge: 'NUDGE' }],
    triage: { tier: 'on_track', reason: 'fine' },
    pacing: { day: 41, program_day_total: 84, program_day_total_basis: null, expected_training_week: 6, expected_basis: 'day_count', actual_training_week: 12, weeks_behind: 0 },
    last_ask: null,
    communications: [],
    delta: null,
    ...over,
  } as SidecarIntern;
}

const comm = (over: Record<string, unknown> = {}) => ({
  enrollment_id: 'e1', intern: 'Quincy', direction: 'from_intern',
  received_at: '2026-11-09T16:00:00Z', subject: 'The Capability Map, and where your decisions stand',
  excerpt: 'the set is empty on the board and what remains is R5 and above, which needs the live expor',
  score: 90, signals: ['decision'], answered: false,
  ...over,
}) as never;

const DEADLINE = { what: 'case study package', dueOn: '2026-11-12', daysLeft: 2, outstanding: ['Record Your Working-System Demo', 'Present at Demo Day'] };

describe('what the message is about', () => {
  /** The hardest truth wins. A countdown to an unreachable date is not the conversation. */
  it('tells someone who has built nothing that STARTING is the problem, not the date', () => {
    const i = intern({
      stories_verified: 0, percent_built: 0,
      counts: { ...intern().counts, commits: 0, verified: 0 },
      triage: { tier: 'never_started_building', reason: 'nothing built' },
    });
    expect(chooseFocus(i, DEADLINE)).toBe('never_started');
    const b = composeBrief({ intern: i, deadline: DEADLINE, now: NOW });
    expect(b.body).toContain('the date is not the real problem');
    expect(b.body).not.toContain('2 days to your');
  });

  it('leads a close deadline with what is at risk, for someone who IS building', () => {
    expect(chooseFocus(intern(), DEADLINE)).toBe('deadline_at_risk');
    const b = composeBrief({ intern: intern(), deadline: DEADLINE, now: NOW });
    expect(b.subject).toBe('2 days to your case study package');
    expect(b.body).toContain('Record Your Working-System Demo');
  });

  it('an unanswered question outranks everything else', () => {
    const i = intern({ triage: { tier: 'blocked_waiting_on_ali', reason: 'waiting' } });
    expect(chooseFocus(i, DEADLINE)).toBe('answer_owed');
  });

  it('no project outranks a deadline, because nothing can be built without one', () => {
    expect(chooseFocus(intern({ project: null }), DEADLINE)).toBe('no_project');
  });
});

describe('it reads their mail', () => {
  /**
   * REPLACES an assertion that required the literal opener "Thank you for your note of
   * November 9". That assertion encoded the defect: measured on production 2026-11-11, all
   * thirteen generated messages opened with that same sentence, whether the person had reported a
   * blocker, asked a question, or sent a status update. The opener now says which of those it was.
   */
  it('opens by naming their own last message, not by a deficit', () => {
    const b = composeBrief({
      intern: intern({ communications: [comm()], days_since_build_work: 9 }),
      deadline: null, now: NOW,
    });
    expect(b.body).toContain('November 9');
    expect(b.body).toContain('"The Capability Map, and where your decisions stand"');
    // Not a deficit, and not a count.
    expect(b.body.split('\n')[2] ?? '').not.toMatch(/^(There has been no|It is day|Nothing has been)/);
  });

  it('opens differently depending on WHAT they sent', () => {
    const open = (over: Record<string, unknown>) => composeBrief({
      intern: intern({ communications: [comm(over)], days_since_build_work: 9 }),
      deadline: null, now: NOW,
    }).body;

    // A blocker. "Thank you for your note" is the wrong thing to say to somebody stuck behind one.
    expect(open({ subject: 'Read route needed for admissions enrichment', excerpt: 'I am blocked on this and cannot get access.' }))
      .toContain('You flagged something in the way on');

    // A question.
    expect(open({ subject: 'Can you confirm the agent naming', excerpt: 'Could you confirm which name to use.' }))
      .toContain('You asked me something on');

    // A plain status update, which is the only case the old single opener actually fitted.
    expect(open({ subject: 'Saratoga project update', excerpt: 'Here is where the system stands today. Ten of eleven stories are verified.' }))
      .toContain('Thank you for the update of');
  });

  /**
   * Omolola Makinde, 2026-11-11. Her brief was held `unsendable_text` and the only offending
   * character in it was the en dash SHE typed in her own subject line. See `inherited.ts`.
   */
  it('repeats their subject back without the dash that made it unsendable', () => {
    const subject = 'Saratoga Springs Municipal System – project update and stakeholder briefing';
    const b = composeBrief({
      intern: intern({
        communications: [comm({ subject, excerpt: 'Here is where it stands. Ten of eleven stories are verified.', answered: false })],
        triage: { tier: 'blocked_waiting_on_ali', reason: 'waiting' },
      }),
      deadline: null, now: NOW,
    });
    expect(b.body).toContain('Saratoga Springs Municipal System - project update');
    expect(b.body).not.toMatch(/[–—]/);
    expect(b.subject).not.toMatch(/[–—]/);
    expect(b.warnings).not.toContain('contains an em or en dash');
  });

  /** The excerpt is a truncated snippet. Quoting one is how a message ended at "the live expor". */
  it('never quotes the excerpt', () => {
    const b = composeBrief({ intern: intern({ communications: [comm()] }), deadline: null, now: NOW });
    expect(b.body).not.toContain('the live expor');
    expect(b.body).not.toContain('the set is empty');
  });

  it('owns the unanswered reply when they are still waiting', () => {
    const b = composeBrief({ intern: intern({ communications: [comm({ answered: false })] }), deadline: null, now: NOW });
    expect(b.body).toContain('that is on me');
  });

  it('warns when it has no conversation at all, rather than pretending', () => {
    const b = composeBrief({ intern: intern({ communications: [] }), deadline: null, now: NOW });
    expect(b.warnings.join(' ')).toContain('No conversation history');
  });

  it('picks their most RECENT message, not the highest scoring one', () => {
    const i = intern({ communications: [
      comm({ subject: 'older but louder', received_at: '2026-11-01T10:00:00Z', score: 99 }),
      comm({ subject: 'newest', received_at: '2026-11-09T10:00:00Z', score: 10 }),
    ] });
    expect(theirLastWord(i)?.subject).toBe('newest');
  });
});

describe('what it refuses to say', () => {
  const tiers: TriageTier[] = ['no_project_at_day_N', 'never_started_building', 'blocked_waiting_on_ali', 'overdue_backlog', 'quiet', 'on_track'];
  const every = (over: Partial<SidecarIntern> = {}) => tiers.map((tier) =>
    composeBrief({ intern: intern({ triage: { tier, reason: 'because' }, ...over }), deadline: null, now: NOW }));

  /** Kalkidan was told her next task was "no commit or verified story since 11-05". */
  it('never presents a diagnostic string as the name of a task', () => {
    for (const b of every()) expect(b.body).not.toContain('no commit or verified story since');
  });

  it('uses most_urgent only when it names real work', () => {
    expect(nextRealTask(intern())).toBeNull(); // kind: 'stuck' is a diagnostic
    expect(nextRealTask(intern({ most_urgent: { kind: 'next', label: 'Up next', detail: 'Wire the exporter' } }))?.detail)
      .toBe('Wire the exporter');
  });

  it('never uses gate jargon or restates the training count', () => {
    for (const b of every()) {
      expect(b.body).not.toContain('gate at');
      expect(b.body).not.toContain('weeks 1 to 3');
    }
  });

  it('never addresses a dashboard item to the intern', () => {
    for (const b of every({ most_urgent: { kind: 'reply', label: 'You owe a reply', detail: 'x' } })) {
      expect(b.body).not.toContain('What the platform has against your name');
      expect(b.body).not.toContain('You owe a reply');
    }
  });

  it('never refers to the intern in the third person', () => {
    for (const b of every()) {
      const afterGreeting = b.body.slice(b.body.indexOf('\n'));
      expect(afterGreeting).not.toContain('Quincy is');
      expect(afterGreeting).not.toMatch(/\bTheir\b/);
    }
  });

  it('never produces a body the sender would refuse', () => {
    for (const b of every()) expect(briefProblems(b.body)).toEqual([]);
    for (const b of every({ communications: [comm()] })) expect(briefProblems(b.body)).toEqual([]);
  });
});

describe('the artifact ask reads like a sentence', () => {
  /** `asks[].name` arrives as a command for presentations: "Record your Project introduction". */
  it('turns a command-shaped ask name into a noun', () => {
    const b = composeBrief({
      intern: intern({ asks: [{ key: 'presentation_prep_1', name: 'Record your Project introduction', why: 'It is the next presentation in their project plan.', prompt: 'P', nudge: 'N' }] }),
      deadline: null, now: NOW,
    });
    expect(b.body).toContain('your Project introduction recording');
    expect(b.body).not.toContain('your Record your');
  });

  /** `ask.why` and `ask.nudge` are dashboard copy: `why` says "THEIR project plan". */
  it('never pastes the dashboard-voiced why or nudge into the message', () => {
    const b = composeBrief({
      intern: intern({ asks: [{ key: 'presentation_prep_1', name: 'Record your Project introduction', why: 'It is the next presentation in their project plan.', prompt: 'P', nudge: 'Hi Quincy, paste the prompt below into Claude Code.' }] }),
      deadline: null, now: NOW,
    });
    expect(b.body).not.toContain('their project plan');
    expect(b.body).not.toContain('Claude Code');
    expect(b.body).toContain('Presentation Studio');
  });

  it('says where to do it, differently for a recording and for a build', () => {
    const rec = composeBrief({ intern: intern({ asks: [{ key: 'presentation_prep_1', name: 'Record your Project introduction', why: 'w', prompt: 'P', nudge: 'N' }] }), deadline: null, now: NOW });
    const build = composeBrief({ intern: intern(), deadline: null, now: NOW });
    expect(rec.body).toContain('Presentation Studio');
    expect(build.body).toContain('send me the link when it is live');
  });

  it('mentions the attachment once, before the close, and without disclaiming it', () => {
    const b = composeBrief({ intern: intern(), deadline: null, now: NOW });
    const mentions = (b.body.match(/attached as/g) ?? []).length;
    expect(mentions).toBe(1);
    expect(b.body.indexOf('attached as')).toBeLessThan(b.body.lastIndexOf('Reply with the day'));
    expect(b.body).not.toContain('correct what it gets wrong');
  });
});

describe('the attachment is earned', () => {
  /** All six tiers used to end with the same "paste the prompt into Claude Code" sentence. */
  it('attaches a prompt ONLY where a prompt is the deliverable', () => {
    const artifact = composeBrief({ intern: intern(), deadline: null, now: NOW });
    expect(artifact.attachment?.filename).toBe('capability-map.md');

    for (const [i, d] of [
      [intern({ triage: { tier: 'blocked_waiting_on_ali', reason: 'w' } }), null],
      [intern({ project: null }), null],
      [intern(), DEADLINE],
    ] as Array<[SidecarIntern, typeof DEADLINE | null]>) {
      const b = composeBrief({ intern: i, deadline: d, now: NOW });
      expect(b.attachment).toBeNull();
      expect(b.body).not.toContain('correct what it gets wrong');
    }
  });
});

describe('it offers a way through, not only a way out', () => {
  it('offers to cut scope rather than only naming the deadline', () => {
    const b = composeBrief({ intern: intern(), deadline: DEADLINE, now: NOW });
    expect(b.body).toContain('cut scope with you now');
  });

  it('tells someone who has not started that none of the answers ends their internship', () => {
    const b = composeBrief({
      intern: intern({ stories_verified: 0, percent_built: 0, counts: { ...intern().counts, commits: 0 } }),
      deadline: null, now: NOW,
    });
    expect(b.body).toContain('none of them ends your internship');
  });

  it('always ends by asking for one reply', () => {
    const bodies = [
      composeBrief({ intern: intern(), deadline: DEADLINE, now: NOW }),
      composeBrief({ intern: intern({ project: null }), deadline: null, now: NOW }),
      composeBrief({ intern: intern({ days_since_build_work: 9 }), deadline: null, now: NOW }),
    ];
    for (const b of bodies) expect(b.body).toMatch(/(Reply|Tell me|Send me|One line)/);
  });
});

describe('length', () => {
  it('stays short enough that a person reads all of it', () => {
    const b = composeBrief({ intern: intern(), deadline: DEADLINE, now: NOW });
    expect(b.body.length).toBeLessThan(1100);
  });

  it('is deterministic: the same intern composes byte-identical twice', () => {
    const a = composeBrief({ intern: intern({ communications: [comm()] }), deadline: DEADLINE, now: NOW });
    const b = composeBrief({ intern: intern({ communications: [comm()] }), deadline: DEADLINE, now: NOW });
    expect(a.body).toBe(b.body);
  });
});

/**
 * A promise WE made cannot lapse in silence.
 *
 * Measured 2026-11-11: Quincy's brief carried the quote "On the six: you will have them before
 * Friday." in `promises`, and his generated message contained no content word from that sentence
 * and never mentioned Friday. The data was present; the composer walked past it. The skill has
 * this as rule 5, and the brief had already done the hard part of finding it.
 */
describe('a dated promise in our last message', () => {
  const withPromise = (over: Record<string, unknown> = {}) => intern({
    last_ask: {
      sent_at: '2026-11-10T21:13:37Z',
      subject: 'Re: The Capability Map, and where your decisions stand',
      from: 'ali@colaberry.com',
      body_text: 'Thanks for the list. On the six: you will have them before Friday.',
    },
    days_since_build_work: 9,
    ...over,
  } as Record<string, unknown>);

  it('POSITIVE CONTROL: the promise is actually found', () => {
    const b = composeBrief({ intern: withPromise(), deadline: null, now: NOW });
    expect(b.promises.map((p) => p.quote)).toEqual(['On the six: you will have them before Friday.']);
  });

  it('warns when today message neither keeps it nor re-dates it', () => {
    const b = composeBrief({ intern: withPromise(), deadline: null, now: NOW });
    expect(b.body).not.toMatch(/friday/i);
    expect(b.warnings.join(' ')).toContain('We promised them a date and this message does not mention it');
    expect(b.warnings.join(' ')).toContain('before Friday');
  });

  it('stays quiet when the message does name the day', () => {
    // `close()` for no_project says "Send me the paragraph by Thursday", so a Thursday promise is
    // already honoured by the body and must not be flagged.
    const b = composeBrief({
      intern: withPromise({
        project: null,
        last_ask: {
          sent_at: '2026-11-10T21:13:37Z', subject: 'Your project', from: 'ali@colaberry.com',
          body_text: 'I will send you two options by Thursday.',
        },
      }),
      deadline: null,
      now: NOW,
    });
    expect(b.promises).toHaveLength(1);
    expect(b.body).toMatch(/Thursday/);
    expect(b.warnings.join(' ')).not.toContain('does not mention it');
  });

  it('says nothing when there was no promise to keep', () => {
    const b = composeBrief({ intern: intern({ days_since_build_work: 9 }), deadline: null, now: NOW });
    expect(b.promises).toEqual([]);
    expect(b.warnings.join(' ')).not.toContain('We promised them a date');
  });
});
