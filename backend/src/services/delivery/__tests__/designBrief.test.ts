/**
 * §20 says: "Do not generate generic dashboard templates with renamed headers."
 *
 * These tests exist because that sentence is usually a hope expressed in a prompt. It does
 * not have to be — a concept either uses the words this customer used, or it does not.
 */

import {
  distinctiveTerms,
  buildDesignBrief,
  genericnessViolation,
  CONCEPT_VARIANTS,
  MIN_DISTINCTIVE_TERMS,
} from '../designBrief';
import { parseUnderstanding } from '../projectUnderstanding';
import { projectBlueprint } from '../buildBlueprint';

const said = (dimension: string, value: string) => ({
  dimension,
  value,
  classification: 'FACT' as const,
  provenance: 'client_confirmed' as const,
});

/** The real 245-second call, in the words the extraction actually produced. */
const understanding = parseUnderstanding({
  title: 'Dispatcher Workflow Automation',
  proposed_surfaces: ['Reporting dashboard'],
  items: [
    said('actors', 'Ralph is the keeper of the spreadsheet and the project manager.'),
    said('actors', 'Johnny needs to stay informed about the job statuses.'),
    said('current_workflow', 'A Power BI report is generated after running a SQL stored procedure.'),
    said('inputs', 'The data for the SQL stored procedure comes from a Google Sheet.'),
    said('outputs', 'When a job is refused, reasons are noted in Slack.'),
    said('desired_outcome', 'An automated process that runs the report and sends an email summary.'),
  ],
});

const blueprint = projectBlueprint(understanding);
const brief = buildDesignBrief(understanding, blueprint);

describe('distinctiveTerms — the vocabulary a template cannot fake', () => {
  it('finds the people and the systems this customer named', () => {
    expect(brief.distinctive_terms).toEqual(
      expect.arrayContaining(['Ralph', 'Johnny', 'Power BI', 'SQL', 'Google Sheet', 'Slack']),
    );
  });

  it('keeps two-word names together rather than as orphans', () => {
    expect(brief.distinctive_terms).toContain('Power BI');
    expect(brief.distinctive_terms).not.toContain('Power');
  });

  it('ignores the first word of a sentence, which is capitalised for grammar', () => {
    // "When a job is refused…" must not contribute "When".
    expect(brief.distinctive_terms).not.toContain('When');
    expect(brief.distinctive_terms).not.toContain('The');
    expect(brief.distinctive_terms).not.toContain('An');
  });

  it('ignores generic product nouns that any template would satisfy', () => {
    const generic = parseUnderstanding({
      title: 'T',
      proposed_surfaces: [],
      items: [said('actors', 'Our Users open the Dashboard to review the System.')],
    });
    expect(distinctiveTerms(generic)).toEqual([]);
  });

  it('does not repeat a term mentioned twice', () => {
    const repeated = parseUnderstanding({
      title: 'T',
      proposed_surfaces: [],
      items: [said('actors', 'Ask Ralph.'), said('current_workflow', 'Then Ralph rebuilds it.')],
    });
    expect(distinctiveTerms(repeated).filter((t) => t === 'Ralph')).toHaveLength(1);
  });

  it('is deterministic', () => {
    expect(distinctiveTerms(understanding)).toEqual(distinctiveTerms(understanding));
  });
});

describe('the brief carries the project, not a template', () => {
  it('offers §20’s three concepts with Command Center recommended', () => {
    expect(brief.concepts.map((c) => c.key)).toEqual(['operational', 'command_center', 'executive']);
    expect(brief.concepts.filter((c) => c.recommended).map((c) => c.key)).toEqual(['command_center']);
    expect(CONCEPT_VARIANTS).toHaveLength(3);
  });

  it('carries the real roles and workflows through', () => {
    expect(brief.roles).toHaveLength(2);
    expect(brief.workflows.join(' ')).toContain('Power BI');
    expect(brief.actions.join(' ')).toContain('email summary');
  });

  it('names what was never discussed, so a concept does not invent it', () => {
    expect(brief.not_discussed).toContain('AI opportunities');
  });
});

describe('genericnessViolation — the prohibition, enforced', () => {
  it('accepts a concept that speaks this customer’s language', () => {
    const html = '<h1>Dispatch Command Center</h1><nav>Jobs</nav><p>Power BI rebuild for Ralph</p>';
    expect(genericnessViolation(html, brief)).toBeNull();
  });

  it('refuses a generic dashboard with renamed headers', () => {
    const html = '<h1>Operations Dashboard</h1><nav>Overview · Users · Reports · Settings</nav>';
    const violation = genericnessViolation(html, brief);

    expect(violation).toContain('generic template with renamed headers');
  });

  it('refuses a concept that name-drops exactly one term', () => {
    expect(genericnessViolation('<h1>Ralph</h1><nav>Overview</nav>', brief)).toContain('needs 2');
  });

  it('matches terms case-insensitively, since markup casing varies', () => {
    expect(genericnessViolation('<p>ralph opens power bi</p>', brief)).toBeNull();
  });

  it('says so when the conversation produced nothing to check against', () => {
    const thin = parseUnderstanding({
      title: 'T',
      proposed_surfaces: [],
      items: [said('actors', 'Someone runs it.')],
    });
    const thinBrief = buildDesignBrief(thin, projectBlueprint(thin));

    // Passing silently here would let a template through on the technicality that there was
    // nothing to compare it to.
    expect(genericnessViolation('<h1>Anything</h1>', thinBrief)).toContain('no distinctive terms');
  });

  it('does not demand more terms than the project actually has', () => {
    const oneTerm = parseUnderstanding({
      title: 'T',
      proposed_surfaces: [],
      items: [said('actors', 'Ask Ralph about it.')],
    });
    const oneBrief = buildDesignBrief(oneTerm, projectBlueprint(oneTerm));

    expect(oneBrief.distinctive_terms).toEqual(['Ralph']);
    expect(genericnessViolation('<p>Ralph</p>', oneBrief)).toBeNull();
    expect(MIN_DISTINCTIVE_TERMS).toBe(2);
  });
});
