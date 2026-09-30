/**
 * A blueprint is a persuasive document, and everything in it acquires the same authority
 * from the formatting alone. That is exactly where an assumption gets laundered into a
 * fact without anyone noticing - one layer above the extraction, and in front of the
 * customer who is deciding whether to pay.
 *
 * These tests hold the three states apart: what they said, what we propose, what is open.
 */

import {
  projectBlueprint,
  BLUEPRINT_SECTIONS,
  MIN_FACTS,
  type BuildBlueprint,
} from '../buildBlueprint';
import { parseUnderstanding } from '../projectUnderstanding';

const fact = (dimension: string, value: string) => ({
  dimension,
  value,
  classification: 'FACT' as const,
  provenance: 'voice_transcript' as const,
  source_quote: `they said: ${value}`,
});

/** Modelled on the real 245-second call: Ralph, Johnny, Power BI, the Google Sheet. */
const realistic = parseUnderstanding({
  title: 'Dispatcher Workflow Automation',
  proposed_surfaces: ['Reporting dashboard'],
  items: [
    fact('actors', 'Ralph is the project manager and keeper of the spreadsheet'),
    fact('actors', 'Johnny must stay aware before a job is approved or refused'),
    fact('current_workflow', 'The team meets daily to discuss operations'),
    fact('current_workflow', 'Ralph rebuilds a Power BI report every morning'),
    fact('inputs', 'The data comes from a Google Sheet'),
    fact('outputs', 'Refusal reasons are noted in Slack'),
    fact('pain_points', 'Jobs are refused when information is incomplete'),
    fact('desired_outcome', 'An automated process that emails a report'),
    {
      dimension: 'human_only_decisions',
      value: 'Who signs off on spend above a threshold',
      classification: 'DECISION' as const,
      provenance: 'ai_inferred' as const,
    },
    {
      dimension: 'integrations',
      value: 'Which accounting system holds the invoices?',
      classification: 'QUESTION' as const,
      provenance: 'ai_inferred' as const,
    },
  ],
});

const section = (bp: BuildBlueprint, key: string) => bp.sections.find((s) => s.key === key)!;

describe('the blueprint keeps the plan’s shape', () => {
  it('has all eighteen sections in the plan’s order', () => {
    const bp = projectBlueprint(realistic);
    expect(bp.sections).toHaveLength(18);
    expect(bp.sections.map((s) => s.title)).toEqual(BLUEPRINT_SECTIONS.map((s) => s.title));
  });

  it('carries the title and surfaces through from the understanding', () => {
    const bp = projectBlueprint(realistic);
    expect(bp.title).toBe('Dispatcher Workflow Automation');
    expect(bp.proposed_surfaces).toEqual(['Reporting dashboard']);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(projectBlueprint(realistic))).toBe(JSON.stringify(projectBlueprint(realistic)));
  });
});

describe('derived sections come from their words', () => {
  const bp = projectBlueprint(realistic);

  it('fills intended users from the actors they named', () => {
    expect(section(bp, 'intended_users').entries.map((e) => e.value)).toEqual([
      'Ralph is the project manager and keeper of the spreadsheet',
      'Johnny must stay aware before a job is approved or refused',
    ]);
  });

  it('gathers the workflow map from several dimensions at once', () => {
    const values = section(bp, 'workflow_map').entries.map((e) => e.value);
    expect(values).toContain('Ralph rebuilds a Power BI report every morning');
    expect(values).toContain('The data comes from a Google Sheet');
    expect(values).toContain('Refusal reasons are noted in Slack');
  });

  it('keeps the quote attached, so every derived line stays traceable', () => {
    section(bp, 'intended_users').entries.forEach((e) => expect(e.source_quote).toBeTruthy());
  });

  it('shows only facts under "What we heard" — never our inferences', () => {
    const heard = section(bp, 'what_we_heard');
    expect(heard.entries).toHaveLength(8);
    heard.entries.forEach((e) => expect(e.classification).toBe('FACT'));
    expect(heard.entries.map((e) => e.value)).not.toContain('Who signs off on spend above a threshold');
  });
});

describe('what is ours stays marked as ours', () => {
  const bp = projectBlueprint(realistic);

  it('leaves the proposal sections empty and flagged, not filled with plausible filler', () => {
    ['proposed_application', 'proposed_agents', 'architecture_direction', 'ux_direction'].forEach((key) => {
      const s = section(bp, key);
      expect(s.kind).toBe('proposed');
      expect(s.entries).toEqual([]);
      expect(s.needs_generation).toBe(true);
    });
  });

  it('counts what still has to be written', () => {
    expect(bp.readiness.sections_needing_generation).toBeGreaterThan(0);
  });
});

describe('open items stay open', () => {
  const bp = projectBlueprint(realistic);

  it('routes a DECISION to important decisions, not to what we heard', () => {
    expect(section(bp, 'important_decisions').entries.map((e) => e.value)).toEqual([
      'Who signs off on spend above a threshold',
    ]);
  });

  it('routes a QUESTION into risks and unknowns', () => {
    expect(section(bp, 'risks_unknowns').entries.map((e) => e.value)).toContain(
      'Which accounting system holds the invoices?',
    );
  });

  it('does not list the same item twice when it is both unknown and a question', () => {
    const withDuplicate = parseUnderstanding({
      title: 'T',
      proposed_surfaces: [],
      items: [
        {
          dimension: 'unknowns',
          value: 'Which accounting system holds the invoices?',
          classification: 'QUESTION',
          provenance: 'ai_inferred',
        },
      ],
    });
    expect(section(projectBlueprint(withDuplicate), 'risks_unknowns').entries).toHaveLength(1);
  });
});

describe('readiness — refusing to show a blueprint that is mostly headings', () => {
  it('marks a real conversation presentable', () => {
    expect(projectBlueprint(realistic).readiness.presentable).toBe(true);
  });

  it('refuses a conversation too thin to describe their business, and says why', () => {
    const thin = parseUnderstanding({
      title: 'Something',
      proposed_surfaces: [],
      items: [fact('actors', 'One person was mentioned')],
    });

    const readiness = projectBlueprint(thin).readiness;
    expect(readiness.presentable).toBe(false);
    expect(readiness.not_presentable_because).toContain('too thin');
    expect(readiness.not_presentable_because).toContain(`only 1 confirmed fact`);
  });

  it('always explains a refusal rather than leaving the caller to guess', () => {
    const empty = parseUnderstanding({ title: 'Nothing', proposed_surfaces: [], items: [] });
    const readiness = projectBlueprint(empty).readiness;
    expect(readiness.presentable).toBe(false);
    expect(readiness.not_presentable_because).toBeTruthy();
  });

  it('names the derived sections the conversation never covered', () => {
    const readiness = projectBlueprint(realistic).readiness;
    expect(readiness.not_discussed).toContain('Data considerations');
    expect(readiness.not_discussed).not.toContain('Intended users');
  });

  it('does not mark a proposal section as "not discussed" — nobody was asked', () => {
    const bp = projectBlueprint(realistic);
    expect(section(bp, 'proposed_application').not_discussed).toBe(false);
    expect(bp.readiness.not_discussed).not.toContain('Proposed application');
  });

  it('holds the fact threshold where the constant says it is', () => {
    const items = Array.from({ length: MIN_FACTS }, (_, i) => fact('actors', `Person ${i}`));
    const justEnoughFacts = parseUnderstanding({ title: 'T', proposed_surfaces: [], items });
    // Enough facts, but they all land in one section — still refused, for the other reason.
    const readiness = projectBlueprint(justEnoughFacts).readiness;
    expect(readiness.not_presentable_because).toContain('derived sections have content');
  });
});

/**
 * Found by projecting a REAL call: an inference about who approves spending sat under
 * "Human responsibilities" classified ASSUMPTION, while the Assumptions section read
 * "not discussed". A blueprint whose Assumptions heading is empty tells the reader there
 * were none - the section that exists to make assumptions visible was hiding them.
 */
describe('the Assumptions section collects everything we assumed', () => {
  const withAssumptionElsewhere = parseUnderstanding({
    title: 'T',
    proposed_surfaces: [],
    items: [
      fact('actors', 'Ralph is the project manager'),
      {
        dimension: 'human_only_decisions',
        value: 'A VP or owner will decide on changes',
        classification: 'ASSUMPTION',
        provenance: 'ai_inferred',
      },
    ],
  });

  it('lists an ASSUMPTION filed under another dimension', () => {
    const bp = projectBlueprint(withAssumptionElsewhere);
    expect(section(bp, 'assumptions').entries.map((e) => e.value)).toEqual(['A VP or owner will decide on changes']);
    expect(section(bp, 'assumptions').not_discussed).toBe(false);
  });

  it('leaves the item where it was filed as well — the section is a view, not a move', () => {
    const bp = projectBlueprint(withAssumptionElsewhere);
    expect(section(bp, 'human_responsibilities').entries.map((e) => e.value)).toContain(
      'A VP or owner will decide on changes',
    );
  });

  it('does not duplicate an assumption that is already in the assumptions dimension', () => {
    const both = parseUnderstanding({
      title: 'T',
      proposed_surfaces: [],
      items: [
        { dimension: 'assumptions', value: 'They use one accounting system', classification: 'ASSUMPTION', provenance: 'ai_inferred' },
      ],
    });
    expect(section(projectBlueprint(both), 'assumptions').entries).toHaveLength(1);
  });

  it('still reports not_discussed when nothing was assumed at all', () => {
    const noAssumptions = parseUnderstanding({
      title: 'T',
      proposed_surfaces: [],
      items: [fact('actors', 'Ralph is the project manager')],
    });
    expect(section(projectBlueprint(noAssumptions), 'assumptions').not_discussed).toBe(true);
  });
});
