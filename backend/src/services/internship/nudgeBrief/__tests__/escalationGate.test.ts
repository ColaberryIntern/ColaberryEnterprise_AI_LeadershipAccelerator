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
