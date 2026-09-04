/**
 * A good proposal SOUNDS like a conclusion, which is exactly why this layer is where §16's
 * rule breaks if nothing holds it. A suggestion sitting beside the customer's own words in
 * identical formatting has quietly told them they asked for something they never mentioned.
 */

const mockChatJson = jest.fn();
jest.mock('../../runtime/runtimeAi', () => ({ chatJson: (...a: any[]) => mockChatJson(...a) }));

import {
  generateProposals,
  proposalViolation,
  applyProposals,
  buildProposalPrompt,
  TRUST_STATES,
  PROPOSAL_SECTION_KEYS,
} from '../blueprintProposals';
import { projectBlueprint } from '../buildBlueprint';
import { parseUnderstanding } from '../projectUnderstanding';

const understanding = parseUnderstanding({
  title: 'Dispatcher Workflow Automation',
  proposed_surfaces: ['Reporting dashboard'],
  items: [
    {
      dimension: 'actors',
      value: 'Ralph is the project manager',
      classification: 'FACT',
      provenance: 'voice_transcript',
      source_quote: 'Ralph usually is the keeper of the spreadsheet',
    },
    {
      dimension: 'current_workflow',
      value: 'Ralph rebuilds a Power BI report every morning',
      classification: 'FACT',
      provenance: 'voice_transcript',
      source_quote: "It's a Power BI report",
    },
  ],
});

const blueprint = projectBlueprint(understanding);

const good = { section: 'proposed_application', value: 'A scheduled pipeline that emails the report' };
const goodTrust = { section: 'trust_blueprint', value: 'A human approves any refusal', trust_state: 'Required' };

const ok = (parsed: any) => ({ parsed, runtime_ms: 900, cost_usd: 0.002 });

beforeEach(() => {
  jest.clearAllMocks();
  mockChatJson.mockResolvedValue(ok({ entries: [good, goodTrust] }));
});

describe('a proposal may never pose as a fact', () => {
  it('refuses an entry classified anything but RECOMMENDATION', () => {
    expect(proposalViolation({ ...good, classification: 'FACT' })).toContain('cannot be classified FACT');
  });

  it('accepts an entry that says RECOMMENDATION explicitly', () => {
    expect(proposalViolation({ ...good, classification: 'RECOMMENDATION' })).toBeNull();
  });

  it('refuses a quote on a proposal — nobody said it', () => {
    expect(proposalViolation({ ...good, source_quote: 'they said this' })).toContain('nobody said it');
  });

  it('drops the offending entry but keeps the rest', async () => {
    mockChatJson.mockResolvedValue(ok({ entries: [good, { ...good, classification: 'FACT' }] }));

    const result = await generateProposals({ understanding, blueprint });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });
});

describe('§19 — no fake maturity before anything is built', () => {
  it.each(TRUST_STATES)('accepts the state "%s"', (state) => {
    expect(proposalViolation({ ...goodTrust, trust_state: state })).toBeNull();
  });

  it('refuses a maturity level dressed up as a state', () => {
    const violation = proposalViolation({ ...goodTrust, trust_state: 'Level 3' });
    expect(violation).toContain('maturity may not be claimed');
  });

  it('refuses a trust entry with no state at all', () => {
    expect(proposalViolation({ section: 'trust_blueprint', value: 'Something' })).toContain('four states');
  });

  it('refuses a trust_state on a section it does not belong to', () => {
    expect(proposalViolation({ ...good, trust_state: 'Required' })).toContain('belongs only on the trust blueprint');
  });
});

describe('sections', () => {
  it('refuses an entry aimed at a derived section — those come from the customer', () => {
    expect(proposalViolation({ section: 'intended_users', value: 'Someone' })).toContain('not a section that gets proposed');
  });

  it('covers every section the projection marked as needing generation', () => {
    blueprint.sections.filter((s) => s.needs_generation).forEach((s) => {
      expect(PROPOSAL_SECTION_KEYS).toContain(s.key);
    });
  });
});

describe('generateProposals', () => {
  it('returns validated entries', async () => {
    const result = await generateProposals({ understanding, blueprint });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toHaveLength(2);
    expect(result.cost_usd).toBe(0.002);
  });

  it('reports an unparseable response as such', async () => {
    mockChatJson.mockResolvedValue(ok({}));
    expect(await generateProposals({ understanding, blueprint })).toMatchObject({
      ok: false,
      error_class: 'EmptyModelResponse',
    });
  });

  it('fails when every entry is refused rather than returning an empty blueprint half', async () => {
    mockChatJson.mockResolvedValue(ok({ entries: [{ ...good, classification: 'FACT' }] }));

    const result = await generateProposals({ understanding, blueprint });
    expect(result).toMatchObject({ ok: false, error_class: 'ContractViolation' });
    if (result.ok) return;
    expect(result.error).toContain('every proposed entry was refused');
  });
});

describe('the prompt', () => {
  it('tells the model what was never discussed, so it does not invent it', () => {
    const prompt = buildProposalPrompt(understanding, blueprint);
    expect(prompt).toContain('NEVER DISCUSSED');
    expect(prompt).toContain('Integrations');
  });

  it('passes the customer’s own statements through as the grounding', () => {
    expect(buildProposalPrompt(understanding, blueprint)).toContain('Ralph rebuilds a Power BI report every morning');
  });

  it('states the maturity prohibition', () => {
    expect(buildProposalPrompt(understanding, blueprint)).toContain('Never assign a maturity level');
  });

  it('is deterministic', () => {
    expect(buildProposalPrompt(understanding, blueprint)).toBe(buildProposalPrompt(understanding, blueprint));
  });
});

describe('applyProposals', () => {
  it('fills the proposed sections and clears their needs_generation flag', () => {
    const filled = applyProposals(blueprint, [good as any, goodTrust as any]);
    const app = filled.sections.find((s) => s.key === 'proposed_application')!;

    expect(app.entries.map((e) => e.value)).toEqual(['A scheduled pipeline that emails the report']);
    expect(app.needs_generation).toBe(false);
  });

  it('marks every filled entry as a RECOMMENDATION regardless of what arrived', () => {
    const filled = applyProposals(blueprint, [good as any]);
    filled.sections
      .find((s) => s.key === 'proposed_application')!
      .entries.forEach((e) => expect(e.classification).toBe('RECOMMENDATION'));
  });

  it('shows the trust state on the line, so the reader sees it is not a promise', () => {
    const filled = applyProposals(blueprint, [goodTrust as any]);
    expect(filled.sections.find((s) => s.key === 'trust_blueprint')!.entries[0].value).toBe(
      '[Required] A human approves any refusal',
    );
  });

  it('leaves derived sections untouched', () => {
    const filled = applyProposals(blueprint, [good as any]);
    expect(filled.sections.find((s) => s.key === 'intended_users')!.entries).toEqual(
      blueprint.sections.find((s) => s.key === 'intended_users')!.entries,
    );
  });

  it('does not mutate the projection it was given', () => {
    const before = JSON.stringify(blueprint);
    applyProposals(blueprint, [good as any]);
    expect(JSON.stringify(blueprint)).toBe(before);
  });

  it('recounts what still needs generating', () => {
    const filled = applyProposals(blueprint, [good as any]);
    expect(filled.readiness.sections_needing_generation).toBe(
      blueprint.readiness.sections_needing_generation - 1,
    );
  });
});

/**
 * The first live run produced no Trust Before Intelligence section at all. The model
 * returned one nested object instead of several flat entries, the validator refused it -
 * correctly - and the section stayed empty with the reason reading only
 * "value: expected string, received object", which never said WHICH section had vanished.
 *
 * §19 is the section tied to the whole differentiator, so it failing silently is the worst
 * available outcome.
 */
describe('the trust blueprint failing must not be silent', () => {
  it('names the section in the refusal reason', () => {
    const violation = proposalViolation({
      section: 'trust_blueprint',
      value: { what_ai_may_do: 'triage', what_requires_human: 'approval' },
      trust_state: 'Required',
    });
    expect(violation).toContain('trust_blueprint');
    expect(violation).toContain('expected string');
  });

  it('still reports a shape failure when the payload has no section at all', () => {
    expect(proposalViolation({ value: 'orphaned' })).toBeTruthy();
  });

  it('carries the section through generateProposals so a caller can see what was lost', async () => {
    mockChatJson.mockResolvedValue(
      ok({ entries: [good, { section: 'trust_blueprint', value: { nested: true }, trust_state: 'Required' }] }),
    );

    const result = await generateProposals({ understanding, blueprint });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected[0].reason).toContain('trust_blueprint');
  });

  it('instructs the model to send several flat trust entries, not one nested object', () => {
    const prompt = buildProposalPrompt(understanding, blueprint);
    expect(prompt).toContain('SEVERAL SEPARATE ENTRIES');
    expect(prompt).toContain('Do not return one nested object');
    expect(prompt).toContain('"trust_state": "Required"');
  });
});
