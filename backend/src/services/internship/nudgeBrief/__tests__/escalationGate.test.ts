/**
 * The regression this file exists for is a real message, sent to a real person on 2026-11-12.
 *
 * It is reproduced verbatim in `HARSH_MESSAGE` below, and the first test is simply: would this
 * have gone out. Everything else establishes the boundary either side of that answer, because a
 * gate that only ever says no is not a gate, it is an outage.
 */
import {
  PRESSURE_SILENT_DAYS,
  ULTIMATUM_SILENT_DAYS,
  checkEscalation,
  escalationLevel,
  escalationWarrant,
} from '../escalationGate';
import type { SidecarIntern } from '../../portfolioReport/sidecar/types';

const NOW = new Date('2026-11-13T12:00:00Z');
const DAY = 86400000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

/** The message that went out on 12 November, trimmed of the signature the sender appends. */
const HARSH_MESSAGE = [
  'Harpreet,',
  '',
  'I want to be straight with you about a pattern, rather than send another request.',
  '',
  'Over the last three weeks I have written to you five times and heard back once.',
  '',
  'I am not writing to tell you off.',
  '',
  'Tell me which one of these is closest to true:',
  '',
  '4. You have decided you are done with the internship and have not wanted to say so.',
  '',
  'What I cannot do is keep writing into silence and call that a program.',
].join('\n');

function intern(over: Partial<SidecarIntern> = {}): SidecarIntern {
  return {
    name: 'Test Person',
    first_name: 'Test',
    enrollment_id: 'e1',
    triage: { tier: 'quiet', reason: 'quiet' },
    project: { name: 'ToolSmithAI', id: 'p1', kind: 'build', repo_url: null, command_center_url: null, stage: null },
    stories_total: 16,
    open_questions: [],
    communications: [],
    ...over,
  } as unknown as SidecarIntern;
}

/** `n` messages from us, all after their last word, which was `silentDays` ago. */
function silentFor(silentDays: number | null, outbound: number, over: Partial<SidecarIntern> = {}): SidecarIntern {
  const comms = [];
  if (silentDays !== null) {
    comms.push({ direction: 'from_intern', received_at: ago(silentDays), subject: 's', excerpt: 'e' });
  }
  for (let k = 0; k < outbound; k += 1) {
    comms.push({ direction: 'from_ali', received_at: ago(Math.max(0, (silentDays ?? 30) - k - 1)), subject: 's', excerpt: 'e' });
  }
  return intern({ communications: comms as never, ...over });
}

describe('the message that should not have been sent', () => {
  it('is classified as an ultimatum', () => {
    expect(escalationLevel(HARSH_MESSAGE).level).toBe('ultimatum');
  });

  it('is refused for an intern with no project assigned, which was the real case', () => {
    // The production row on 12 November: active_project_id null, and the only projects row on her
    // name was a nameless shell created the day before.
    const warrant = escalationWarrant(silentFor(30, 5, { project: null }), NOW);
    expect(warrant.hasAssignedProject).toBe(false);
    expect(warrant.level).toBe('none');

    const gate = checkEscalation(HARSH_MESSAGE, warrant);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.found).toBe('ultimatum');
      expect(gate.allowed).toBe('none');
      expect(gate.reason).toMatch(/No project has been assigned/);
    }
  });

  it('is refused for a nameless project shell, which is not an assignment', () => {
    const shell = { name: '   ', id: 'p1', kind: 'build', repo_url: null, command_center_url: null, stage: null };
    expect(escalationWarrant(silentFor(30, 5, { project: shell as never }), NOW).hasAssignedProject).toBe(false);
  });

  it('is allowed when the same silence sits on a real assigned project', () => {
    const warrant = escalationWarrant(silentFor(30, 5), NOW);
    expect(warrant.level).toBe('ultimatum');
    expect(checkEscalation(HARSH_MESSAGE, warrant).ok).toBe(true);
  });
});

describe('who the gap belongs to', () => {
  it('refuses any escalation while their mail is waiting on us', () => {
    const owed = silentFor(30, 5, {
      open_questions: [{ received_at: ago(30), subject: 'q', text: 'q', kind: 'question' }] as never,
    });
    const warrant = escalationWarrant(owed, NOW);
    expect(warrant.weOweThemAnAnswer).toBe(true);
    expect(warrant.level).toBe('none');
    expect(warrant.reason).toMatch(/no standing/);
  });

  it('refuses it on the blocked tier too, where the open question list may be empty', () => {
    const blocked = silentFor(30, 5, { triage: { tier: 'blocked_waiting_on_ali', reason: 'r' } });
    expect(escalationWarrant(blocked, NOW).level).toBe('none');
  });
});

describe('the silence has to be real', () => {
  it('will not name a pattern after one unanswered message', () => {
    expect(escalationWarrant(silentFor(PRESSURE_SILENT_DAYS + 1, 1), NOW).level).toBe('none');
  });

  it('will not name a pattern while they wrote this week', () => {
    expect(escalationWarrant(silentFor(PRESSURE_SILENT_DAYS - 1, 4), NOW).level).toBe('none');
  });

  it('allows pressure at two unanswered messages and a week of silence', () => {
    expect(escalationWarrant(silentFor(PRESSURE_SILENT_DAYS, 2), NOW).level).toBe('pressure');
  });

  it('stops short of an ultimatum at a week, even with many messages', () => {
    expect(escalationWarrant(silentFor(PRESSURE_SILENT_DAYS, 6), NOW).level).toBe('pressure');
  });

  it('allows an ultimatum at three messages and a fortnight', () => {
    expect(escalationWarrant(silentFor(ULTIMATUM_SILENT_DAYS, 3), NOW).level).toBe('ultimatum');
  });

  it('treats never having heard from them as maximally silent rather than unknown', () => {
    const w = escalationWarrant(silentFor(null, 3), NOW);
    expect(w.daysSinceTheirLastWord).toBeNull();
    expect(w.level).toBe('ultimatum');
  });
});

describe('the gate fails closed', () => {
  it('treats a missing warrant as no warrant at all', () => {
    const gate = checkEscalation(HARSH_MESSAGE, null);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.allowed).toBe('none');
  });

  it('accepts a bare ceiling as well as a full warrant', () => {
    expect(checkEscalation(HARSH_MESSAGE, 'ultimatum').ok).toBe(true);
    expect(checkEscalation(HARSH_MESSAGE, 'pressure').ok).toBe(false);
  });
});

describe('ordinary manager mail is untouched', () => {
  const ORDINARY = [
    'Thank you for the update of 11 November about "ToolSmithAI".',
    '',
    'What is at risk is the recording. Your case study package is due on 20 November, 7 days from now,',
    'and 3 pieces are still outstanding.',
    '',
    'Start with "Record Your Working-System Demo". Run it locally with your server up.',
    '',
    'Reply today with the day you will have the first one recorded.',
  ].join('\n');

  it('is not classified as an escalation', () => {
    expect(escalationLevel(ORDINARY).level).toBe('none');
  });

  it('passes even on the strictest possible warrant', () => {
    expect(checkEscalation(ORDINARY, 'none').ok).toBe(true);
  });

  it('does not fire on a deadline message that uses the word cannot', () => {
    const body = 'If all 6 is not realistic in the time left, tell me today which ones you want to keep.';
    expect(escalationLevel(body).level).toBe('none');
  });
});

describe('the counted outbound is a lower bound', () => {
  it('ignores our messages that predate their last word', () => {
    const comms = [
      { direction: 'from_ali', received_at: ago(40), subject: 's', excerpt: 'e' },
      { direction: 'from_ali', received_at: ago(39), subject: 's', excerpt: 'e' },
      { direction: 'from_intern', received_at: ago(20), subject: 's', excerpt: 'e' },
      { direction: 'from_ali', received_at: ago(10), subject: 's', excerpt: 'e' },
    ];
    const w = escalationWarrant(intern({ communications: comms as never }), NOW);
    expect(w.unansweredOutbound).toBe(1);
    expect(w.level).toBe('none');
  });
});

/**
 * On 2026-11-13 the DEPLOYED composer was run against that morning's real sidecar, all thirteen
 * interns, with nothing sent. It produced the `never_started` exit offer for three of them. The
 * three are reproduced here from their actual sidecar fields, because two of the holes they
 * exposed were in this gate rather than in the composer.
 */
describe('the live roster of 13 November 2026', () => {
  /** Project row name IS NULL in production; the report renders that as the string "Project". */
  const harpreet = intern({
    name: 'Harpreet Kaur',
    triage: { tier: 'never_started_building', reason: 'Has the project "Project" but no commit and no verified story, ever.' },
    project: { name: 'Project', id: '50a24430', kind: 'build', repo_url: null, command_center_url: null, stage: null } as never,
    stories_total: 0,
    open_questions: [],
    communications: [{ direction: 'from_intern', received_at: ago(3), subject: 'ToolSmithAI Repository and Project Storyline', excerpt: 'e' }] as never,
  });

  /** A real project with fifteen stories, and an unanswered "I am unable to access my portal". */
  const samrawit = intern({
    name: 'SAmrawit mekonen',
    triage: { tier: 'never_started_building', reason: 'Has the project but no commit and no verified story, ever.' },
    project: { name: 'RFP - Harris County Constable Precinct 4', id: 'ee486ef2', kind: 'build', repo_url: null, command_center_url: null, stage: null } as never,
    stories_total: 15,
    open_questions: [{ received_at: ago(3), subject: 'Re: Can you sign in?', text: 'Hello Ali, I am unable to access my portal.', kind: 'stuck' }] as never,
    communications: [{ direction: 'from_intern', received_at: ago(3), subject: 'Re: Can you sign in?', excerpt: 'e' }] as never,
  });

  /** A properly named project whose plan was never materialised: zero stories to build. */
  const megan = intern({
    name: 'Megan Dimiyo-Mbenoun',
    triage: { tier: 'never_started_building', reason: 'Has the project "TalentSignal" but no commit and no verified story, ever.' },
    project: { name: 'TalentSignal', id: '7594f3fb', kind: 'build', repo_url: null, command_center_url: null, stage: null } as never,
    stories_total: 0,
    open_questions: [{ received_at: ago(1), subject: 'Background check instructions', text: 'Could Juliet please confirm in writing', kind: 'question' }] as never,
    communications: [{ direction: 'from_intern', received_at: ago(1), subject: 'Background check instructions', excerpt: 'e' }] as never,
  });

  it.each([
    ['Harpreet', harpreet],
    ['Samrawit', samrawit],
    ['Megan', megan],
  ])('refuses the exit offer the composer would have sent to %s', (_name, who) => {
    const warrant = escalationWarrant(who, NOW);
    expect(warrant.level).toBe('none');
    expect(checkEscalation(HARSH_MESSAGE, warrant).ok).toBe(false);
  });

  it('refuses Harpreet on the project test and not merely on the clock', () => {
    // The first version of this gate passed her: the sidecar's "Project" read as a real name, and
    // she was spared only because she had written three days earlier. Had she gone quiet for a
    // fortnight, the condition the gate was built for would still not have fired.
    expect(escalationWarrant(harpreet, NOW).hasAssignedProject).toBe(false);

    const quietForAMonth = intern({
      ...harpreet,
      communications: [
        { direction: 'from_intern', received_at: ago(40), subject: 's', excerpt: 'e' },
        { direction: 'from_ali', received_at: ago(9), subject: 's', excerpt: 'e' },
        { direction: 'from_ali', received_at: ago(6), subject: 's', excerpt: 'e' },
        { direction: 'from_ali', received_at: ago(1), subject: 's', excerpt: 'e' },
      ] as never,
    });
    const w = escalationWarrant(quietForAMonth, NOW);
    expect(w.unansweredOutbound).toBe(3);
    expect(w.daysSinceTheirLastWord).toBe(40);
    expect(w.level).toBe('none');
    expect(w.reason).toMatch(/No project has been assigned/);
  });

  it('refuses Megan although her project has a real name', () => {
    const w = escalationWarrant(megan, NOW);
    expect(w.hasAssignedProject).toBe(false);
    expect(w.weOweThemAnAnswer).toBe(true);
  });
});

describe('a report is a rendering, not the record', () => {
  it.each(['Project', 'project', '  Project  ', 'Untitled', 'Untitled Project'])(
    'does not accept %p as a project title, because that is what a NULL name renders as',
    (title) => {
      const w = escalationWarrant(silentFor(30, 5, { project: { name: title } as never }), NOW);
      expect(w.hasAssignedProject).toBe(false);
      expect(w.level).toBe('none');
    },
  );

  it('does not accept a named project that carries no stories to build', () => {
    expect(escalationWarrant(silentFor(30, 5, { stories_total: 0 }), NOW).hasAssignedProject).toBe(false);
  });

  it('treats a missing story count as nothing assigned rather than as unknown', () => {
    expect(escalationWarrant(silentFor(30, 5, { stories_total: null }), NOW).hasAssignedProject).toBe(false);
  });
});

describe('silence that cannot be proved is not punished', () => {
  /** Ten entries is the cap in communications.ts, and the list is ranked by interest, not time. */
  const saturated = (silentDays: number) => {
    const comms = [{ direction: 'from_intern', received_at: ago(silentDays), subject: 's', excerpt: 'e' }];
    for (let k = 0; k < 9; k += 1) comms.push({ direction: 'from_ali', received_at: ago(k + 1), subject: 's', excerpt: 'e' });
    return intern({ communications: comms as never });
  };

  it('refuses an escalation when the message list came back at its cap', () => {
    const w = escalationWarrant(saturated(40), NOW);
    expect(w.silenceIsProvable).toBe(false);
    expect(w.unansweredOutbound).toBe(9);
    expect(w.level).toBe('none');
    expect(w.reason).toMatch(/cap/);
  });

  it('still allows it one message below the cap, so a full list is not an outage', () => {
    const w = escalationWarrant(silentFor(ULTIMATUM_SILENT_DAYS, 8), NOW);
    expect(w.silenceIsProvable).toBe(true);
    expect(w.level).toBe('ultimatum');
  });
});
