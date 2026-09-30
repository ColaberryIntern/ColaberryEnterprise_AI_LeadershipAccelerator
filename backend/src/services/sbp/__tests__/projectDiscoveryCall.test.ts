import {
  CALL_COOLDOWN_MS,
  decideProjectDiscoveryCall,
  remainingAngles,
} from '../projectDiscoveryCall';
import {
  MAX_CALL_ANGLES,
  SPOKEN_ANGLE,
  buildProjectDiscoveryCallPrompt,
  callAngles,
} from '../projectDiscoveryCallPrompt';
import {
  itemsFromTranscript,
  mergeTranscriptItems,
} from '../projectDiscoveryTranscript';
import { ANGLE_TO_DIMENSION } from '../intakeTruth';
import { findIntegrityViolations, validateItem } from '../../delivery/projectUnderstanding';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

/**
 * Phone parity, decided without a phone.
 *
 * NO TEST HERE PLACES A CALL, and none can: the decision half is pure and
 * dialling lives in `synthflowService`. That split is the reason this whole
 * surface is testable at all.
 */

const known = (over: Partial<UnderstandingItem> = {}): UnderstandingItem => ({
  dimension: 'problem',
  value: 'A tool that checks invoices against purchase orders.',
  classification: 'FACT',
  provenance: 'source_message',
  source_quote: 'A tool that checks invoices against purchase orders.',
  ...over,
});

const base = {
  consentToCall: true,
  phone: '+15125550123',
  known: [known()],
  remainingAngles: ['THE GUARDRAIL', 'THE TOOLS'],
  agentId: 'agent_abc123',
  projectName: 'Invoice checker',
};

describe('the five refusals', () => {
  it('refuses without consent, before anything else', () => {
    // Consent is about whether a call is ALLOWED; everything else is about
    // whether it would be useful. A useful call nobody agreed to is still cold.
    expect(decideProjectDiscoveryCall({ ...base, consentToCall: false, phone: null }))
      .toEqual({ place: false, reason: 'no_consent' });
  });

  it('refuses with no number to dial', () => {
    expect(decideProjectDiscoveryCall({ ...base, phone: '   ' }))
      .toEqual({ place: false, reason: 'no_phone' });
  });

  it('refuses to start an interview cold, by decision', () => {
    // Continue-only. Cold, the agent has nothing and must work all ten angles,
    // which is the interrogation the description-first work exists to remove.
    expect(decideProjectDiscoveryCall({ ...base, known: [] }))
      .toEqual({ place: false, reason: 'no_intake_yet' });
  });

  it('refuses when there is nothing left to ask', () => {
    expect(decideProjectDiscoveryCall({ ...base, remainingAngles: [] }))
      .toEqual({ place: false, reason: 'nothing_to_ask' });
  });

  it('refuses when no agent is configured, and NEVER borrows one', () => {
    const decision = decideProjectDiscoveryCall({ ...base, agentId: '' });
    expect(decision).toEqual({ place: false, reason: 'no_agent_configured' });
    // The whole point: an unset slot is a refusal, not a fallback to whichever
    // agent happens to be configured for another brand.
    expect('prompt' in decision).toBe(false);
  });

  it('refuses a second call inside the cooldown', () => {
    // Rate limiting counts requests. This refuses to dial a PERSON twice.
    expect(decideProjectDiscoveryCall({ ...base, msSinceLastCall: CALL_COOLDOWN_MS - 1 }))
      .toEqual({ place: false, reason: 'cooling_down' });
    expect(decideProjectDiscoveryCall({ ...base, msSinceLastCall: CALL_COOLDOWN_MS }).place)
      .toBe(true);
  });

  it('reports an unconfigured agent AFTER the student-facing reasons', () => {
    // If they had also revoked consent, that is what they should hear about,
    // not our configuration.
    expect(decideProjectDiscoveryCall({ ...base, consentToCall: false, agentId: '' }).place)
      .toBe(false);
    expect(decideProjectDiscoveryCall({ ...base, consentToCall: false, agentId: '' }))
      .toEqual({ place: false, reason: 'no_consent' });
  });
});

describe('the prompt the agent is given', () => {
  it('opens with what the student already said, and forbids re-asking it', () => {
    const decision = decideProjectDiscoveryCall(base);
    if (!decision.place) throw new Error('expected a call');

    expect(decision.prompt).toContain('ALREADY TOLD US');
    expect(decision.prompt).toContain('checks invoices against purchase orders');
    expect(decision.prompt).toMatch(/Never ask about anything in this list/i);
  });

  it('asks only the remaining angles, in order', () => {
    const decision = decideProjectDiscoveryCall(base);
    if (!decision.place) throw new Error('expected a call');
    expect(decision.angles).toEqual(['THE GUARDRAIL', 'THE TOOLS']);
    expect(decision.prompt).toContain(SPOKEN_ANGLE['THE GUARDRAIL']);
  });

  it('never says the angle\'s own name out loud', () => {
    const prompt = buildProjectDiscoveryCallPrompt({
      known: [known()], remainingAngles: ['THE GUARDRAIL'], projectName: null,
    });
    // The angle names are our vocabulary, not the student's.
    expect(prompt).not.toContain('THE GUARDRAIL.');
  });

  it('caps the call, because an interview that never ends is a bad one', () => {
    expect(callAngles(Object.keys(ANGLE_TO_DIMENSION))).toHaveLength(MAX_CALL_ANGLES);
  });

  it('refuses to ask for anything that must not be recorded', () => {
    const prompt = buildProjectDiscoveryCallPrompt({
      known: [known()], remainingAngles: ['THE TOOLS'], projectName: null,
    });
    expect(prompt).toMatch(/NEVER ask for a password, an API key/);
    expect(prompt).toMatch(/recorded and transcribed/);
  });

  it('drops an angle it has no spoken wording for, rather than reading a label aloud', () => {
    expect(callAngles(['THE VIBES', 'THE TOOLS'])).toEqual(['THE TOOLS']);
  });
});

describe('remaining angles come from truth, not a cursor', () => {
  it('drops an angle once its dimension is known', () => {
    const remaining = remainingAngles([known({ dimension: 'approval_points' })]);
    expect(remaining).not.toContain('THE GUARDRAIL');
    expect(remaining).toContain('THE TOOLS');
  });

  it('gives the same answer to every channel, which is what makes resume work', () => {
    // Chat, phone and the web review all ask this of the same data, so a
    // student who answered in one sees it reflected in the others.
    const after = [known({ dimension: 'approval_points' }), known({ dimension: 'systems' })];
    expect(remainingAngles(after)).toEqual(remainingAngles([...after].reverse()));
  });

  it('is empty once every dimension is covered', () => {
    const everything = Object.values(ANGLE_TO_DIMENSION).map((d) => known({ dimension: d }));
    expect(remainingAngles(everything)).toEqual([]);
  });
});

describe('a finished call becomes reviewable truth, never confirmed truth', () => {
  const answers = [
    { angle: 'THE GUARDRAIL', said: 'Priya signs off anything over five thousand.' },
    { angle: 'THE TOOLS', said: 'Gmail and a spreadsheet on the shared drive.' },
  ];

  it('extracts voice_transcript items with the words that were said', () => {
    const { items } = itemsFromTranscript({ answers });
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.provenance).toBe('voice_transcript');
      expect(item.source_quote).toBeTruthy();
    }
  });

  it('NEVER marks a transcript item as confirmed', () => {
    // Speech recognition mishears names, and the most expensive place to
    // mishear one is the guardrail question, where it becomes the person who
    // approves things. A person reads it back; the call does not.
    const { items } = itemsFromTranscript({ answers });
    for (const item of items) {
      expect(item.provenance).not.toBe('client_confirmed');
      expect(item.provenance).not.toBe('pm_confirmed');
    }
  });

  it('produces items the shared contract accepts', () => {
    const { items } = itemsFromTranscript({ answers });
    for (const item of items) expect(validateItem(item)).toEqual({ ok: true, item });
    expect(findIntegrityViolations({ title: 't', proposed_surfaces: [], items })).toEqual([]);
  });

  it('is deterministic, which is what makes webhook replay safe', () => {
    // A re-delivered completion recomputes identical items, so the store then
    // reports `unchanged` rather than writing a second understanding.
    expect(itemsFromTranscript({ answers })).toEqual(itemsFromTranscript({ answers }));
  });

  it('writes nothing for a question the caller went quiet on', () => {
    expect(itemsFromTranscript({ answers: [{ angle: 'THE TOOLS', said: '  ' }] }).items).toEqual([]);
  });

  it('reports an unrecognised angle instead of filing it', () => {
    expect(itemsFromTranscript({ answers: [{ angle: 'THE VIBES', said: 'something' }] }))
      .toEqual({ items: [], unmapped: 1 });
  });
});

describe('merging a call into what was already known', () => {
  it('leaves a human-confirmed dimension alone', () => {
    const confirmed = known({ dimension: 'approval_points', provenance: 'client_confirmed', value: 'Priyanka signs off.' });
    const { items } = itemsFromTranscript({ answers: [{ angle: 'THE GUARDRAIL', said: 'Priya signs off.' }] });

    const merged = mergeTranscriptItems([confirmed], items);
    expect(merged).toEqual([confirmed]);
  });

  it('adds a dimension nobody has confirmed', () => {
    const { items } = itemsFromTranscript({ answers: [{ angle: 'THE TOOLS', said: 'Gmail.' }] });
    expect(mergeTranscriptItems([known()], items)).toHaveLength(2);
  });

  it('does not duplicate the same statement on a replay', () => {
    const { items } = itemsFromTranscript({ answers: [{ angle: 'THE TOOLS', said: 'Gmail.' }] });
    const once = mergeTranscriptItems([known()], items);
    expect(mergeTranscriptItems(once, items)).toEqual(once);
  });
});
