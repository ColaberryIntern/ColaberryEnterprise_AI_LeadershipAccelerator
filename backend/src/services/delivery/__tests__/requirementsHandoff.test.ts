/**
 * The handover from free to paid, checked against the REAL parser.
 *
 * The document format is not a matter of opinion - `parseRequirementsWithSections` decides
 * what counts, and it skips anything that is not a `-` bullet of more than ten characters
 * under a `#`-style header. Asserting on my own rendering would prove only that I am
 * self-consistent, so these tests feed the output to the actual parser the platform uses.
 *
 * That matters more here than anywhere else in this build: `RequirementsMap` carries no
 * provenance, so once a row exists nothing downstream can tell whether it came from the
 * customer or from a model. The filter has to hold at this boundary or not at all.
 */

import { parseRequirementsWithSections } from '../../requirementsParserService';
import {
  renderRequirementsDocument,
  handOffToRequirements,
  PARSER_MIN_TEXT_LENGTH,
} from '../requirementsHandoff';
import { parseUnderstanding, type ProjectUnderstanding } from '../projectUnderstanding';
import { projectBlueprint } from '../buildBlueprint';

const confirmed = (dimension: string, value: string) => ({
  dimension,
  value,
  classification: 'FACT' as const,
  provenance: 'client_confirmed' as const,
});

const understanding = (extra: any[] = []): ProjectUnderstanding =>
  parseUnderstanding({
    title: 'Dispatcher Workflow Automation',
    proposed_surfaces: [],
    items: [
      confirmed('actors', 'Ralph is the project manager and keeper of the spreadsheet'),
      confirmed('current_workflow', 'A SQL stored procedure runs before the Power BI report is rebuilt'),
      confirmed('desired_outcome', 'The report runs automatically and emails a summary'),
      ...extra,
    ],
  });

describe('the rendered document survives the real parser', () => {
  it('produces requirements the platform’s own parser recognises', () => {
    const { doc_text, included } = renderRequirementsDocument(understanding());
    const parsed = parseRequirementsWithSections(doc_text);
    const all = parsed.sections.flatMap((s: any) => s.requirements);

    expect(included).toBe(3);
    expect(all).toHaveLength(3);
    expect(all.map((r: any) => r.text)).toContain('Ralph is the project manager and keeper of the spreadsheet');
  });

  it('keeps the dimension names as parser sections', () => {
    const parsed = parseRequirementsWithSections(renderRequirementsDocument(understanding()).doc_text);
    expect(parsed.sections.map((s: any) => s.name)).toEqual(
      expect.arrayContaining(['Actors / users', 'Current workflow', 'Desired outcome']),
    );
  });

  it('renders nothing the parser then throws away', () => {
    const { doc_text, included } = renderRequirementsDocument(understanding());
    const parsedCount = parseRequirementsWithSections(doc_text).sections.flatMap((s: any) => s.requirements).length;

    // The count this module reports MUST match what the pipeline will actually create.
    expect(parsedCount).toBe(included);
  });
});

describe('only what the customer stood behind crosses', () => {
  it('excludes an unconfirmed inference and says so', () => {
    const withInference = understanding([
      {
        dimension: 'integrations',
        value: 'They probably use QuickBooks for invoicing',
        classification: 'ASSUMPTION',
        provenance: 'ai_inferred',
      },
    ]);

    const { doc_text, excluded } = renderRequirementsDocument(withInference);

    expect(doc_text).not.toContain('QuickBooks');
    expect(excluded.some((e) => e.reason.includes('not confirmed by the customer'))).toBe(true);
  });

  it('excludes a transcript-sourced item that was never confirmed', () => {
    const heardNotConfirmed = understanding([
      {
        dimension: 'pain_points',
        value: 'Jobs get refused when the information is incomplete',
        classification: 'FACT',
        provenance: 'voice_transcript',
        source_quote: 'when people do not cross their ts',
      },
    ]);

    const { doc_text, excluded } = renderRequirementsDocument(heardNotConfirmed);

    // Heard is not the same as agreed. RequirementsMap has no provenance, so this is the
    // last point at which the difference can be enforced.
    expect(doc_text).not.toContain('Jobs get refused');
    expect(excluded.some((e) => e.reason.includes('voice_transcript'))).toBe(true);
  });

  it('does not open a section whose only items were excluded', () => {
    const onlyUnconfirmed = understanding([
      { dimension: 'data', value: 'Everything lives in one warehouse', classification: 'ASSUMPTION', provenance: 'ai_inferred' },
    ]);

    expect(renderRequirementsDocument(onlyUnconfirmed).doc_text).not.toContain('## Data');
  });
});

describe('the ten-character trap', () => {
  it('reports a confirmed item the parser would silently discard', () => {
    const terse = understanding([confirmed('constraints', 'Azure only')]);

    const { excluded, doc_text } = renderRequirementsDocument(terse);

    expect('Azure only'.length).toBeLessThan(PARSER_MIN_TEXT_LENGTH);
    expect(excluded.some((e) => e.reason.includes('too short'))).toBe(true);
    expect(doc_text).not.toContain('Azure only');
  });

  it('agrees with the parser about what is too short', () => {
    const terse = understanding([confirmed('constraints', 'Azure only')]);
    const { doc_text, included } = renderRequirementsDocument(terse);
    const parsedCount = parseRequirementsWithSections(doc_text).sections.flatMap((s: any) => s.requirements).length;

    expect(parsedCount).toBe(included);
  });
});

describe('proposals cross only when the customer accepted them', () => {
  const u = understanding();
  const blueprint = projectBlueprint(u);
  const withProposal = {
    ...blueprint,
    sections: blueprint.sections.map((s) =>
      s.key === 'proposed_application'
        ? { ...s, entries: [{ value: 'A scheduled pipeline that rebuilds and emails the report', classification: 'RECOMMENDATION' as const }], needs_generation: false }
        : s,
    ),
  };

  it('leaves proposals out by default, and records why', () => {
    const { doc_text, excluded } = renderRequirementsDocument(u, { blueprint: withProposal });

    expect(doc_text).not.toContain('scheduled pipeline');
    expect(excluded.some((e) => e.reason === 'proposal not accepted by the customer')).toBe(true);
  });

  it('includes them once accepted, labelled as proposals', () => {
    const { doc_text, included } = renderRequirementsDocument(u, {
      blueprint: withProposal,
      includeAcceptedProposals: true,
    });

    expect(doc_text).toContain('(proposed)');
    expect(doc_text).toContain('scheduled pipeline');
    expect(included).toBe(4);
  });

  it('still parses cleanly with proposals included', () => {
    const { doc_text, included } = renderRequirementsDocument(u, {
      blueprint: withProposal,
      includeAcceptedProposals: true,
    });
    const parsedCount = parseRequirementsWithSections(doc_text).sections.flatMap((s: any) => s.requirements).length;

    expect(parsedCount).toBe(included);
  });
});

describe('handOffToRequirements', () => {
  it('hands the document to the pipeline and reports what was created', async () => {
    const materialize = jest.fn().mockResolvedValue(3);

    const result = await handOffToRequirements({
      projectId: 'proj-1',
      understanding: understanding(),
      materialize,
    });

    expect(result).toMatchObject({ ok: true, requirements_created: 3, included: 3 });
    expect(materialize).toHaveBeenCalledWith('proj-1', expect.stringContaining('Ralph is the project manager'));
  });

  it('refuses to activate a project with nothing in it', async () => {
    const nothingConfirmed = parseUnderstanding({
      title: 'T',
      proposed_surfaces: [],
      items: [
        { dimension: 'actors', value: 'Someone runs the report each day', classification: 'ASSUMPTION', provenance: 'ai_inferred' },
      ],
    });
    const materialize = jest.fn();

    const result = await handOffToRequirements({ projectId: 'proj-1', understanding: nothingConfirmed, materialize });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('empty project');
    expect(materialize).not.toHaveBeenCalled();
  });

  it('reports a pipeline failure instead of throwing at the caller', async () => {
    const materialize = jest.fn().mockRejectedValue(new Error('db down'));

    const result = await handOffToRequirements({ projectId: 'proj-1', understanding: understanding(), materialize });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.error).toContain('db down');
  });

  it('carries the exclusions through, so nothing vanishes at the boundary', async () => {
    const materialize = jest.fn().mockResolvedValue(3);
    const withDropped = understanding([confirmed('constraints', 'Azure only')]);

    const result = await handOffToRequirements({ projectId: 'proj-1', understanding: withDropped, materialize });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.excluded.some((e) => e.value === 'Azure only')).toBe(true);
  });
});
