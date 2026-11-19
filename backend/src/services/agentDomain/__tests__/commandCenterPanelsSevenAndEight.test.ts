/**
 * Panels seven and eight, their criteria, and the count that was never checkable.
 *
 * ## Why the existing six criteria are untouched, measured rather than assumed
 *
 * Production, 19 November 2026:
 *
 *   admissions, marketing, platform, sales   verified, 6 of 6
 *   internship                               submitted, 5 of 6
 *   curriculum, product_experience           in_progress, 0 of 6
 *   executive, learner_success, website      nothing claimed
 *
 * Criteria match by NORMALISED TEXT (`criterionIdentity.ts`). So rewording criterion 1's "all six
 * panels" to say eight would stop matching the sentence five boards were graded against, and the
 * file's own doctrine forbids a `SUPERSEDED_CRITERIA` alias to carry the tick across. That would
 * un-verify four builders' completed work to fix a number in a sentence.
 *
 * ## So the count moved OUT of the sentence
 *
 * `COMMAND_CENTER_PANEL_COUNT` is the number the prompt's heading is generated from and the number
 * these tests compare the panel headings against. The stale "six" inside criterion 1 is now
 * visible rather than load-bearing, and that gap is asserted explicitly below so nobody reads it
 * as an oversight.
 */

import { AGENT_DOMAINS, AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';
import { loadDomainMatrix } from '../capabilityRecord';
import { BUILDER_STAGES } from '../builderPath';
import { buildAgentDomainSnapshot } from '../agentDomainSnapshot';
import {
  COMMAND_CENTER_ACCEPTANCE,
  COMMAND_CENTER_PANEL_COUNT,
  COMMAND_CENTER_PANEL_COUNT_IN_FIRST_CRITERION,
  commandCenterPromptForDomain,
} from '../agentDomainCommandCenterStory';
import { domainCommandCenterDoc, domainCommandCenterSeed } from '../agentDomainCommandCenterDoc';

const DOMAIN = 'platform';
const d = AGENT_DOMAINS.find((x) => x.domain_key === DOMAIN)!;
const prompt = commandCenterPromptForDomain(d, loadDomainMatrix(DOMAIN));
const doc = domainCommandCenterDoc(DOMAIN);

/** The panel headings the generated prompt actually carries: `**N. Title -- "question"**`. */
function panelHeadings(text: string): string[] {
  return [...text.matchAll(/^\*\*(\d+)\. [^*]+\*\*$/gm)].map((m) => m[0]);
}

/** Every key the snapshot publishes, so a criterion can be checked against reality. */
function snapshotKeys(): string[] {
  const snap = buildAgentDomainSnapshot({
    domain_key: DOMAIN,
    agent: null,
    matrix: loadDomainMatrix(DOMAIN),
    governance: [],
  });
  return Object.keys(snap);
}

describe('the two new criteria name snapshot keys that actually exist', () => {
  const NEW = COMMAND_CENTER_ACCEPTANCE.slice(6);

  it('POSITIVE CONTROL: there are exactly two new criteria', () => {
    expect(COMMAND_CENTER_ACCEPTANCE).toHaveLength(8);
    expect(NEW).toHaveLength(2);
  });

  it('every backtick-quoted key in a new criterion is a real snapshot section', () => {
    // Cross-checked against the snapshot's own key list rather than by eye. Writing a criterion
    // for a panel with no data source is the recorded mistake that left the platform Command
    // Center stuck at 5 of 6 with an undemonstrable criterion for a month.
    const keys = new Set(snapshotKeys());
    const named = NEW.flatMap((c) => [...c.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]));
    expect(named.length).toBeGreaterThan(0);
    for (const key of named) {
      expect({ key, exists: keys.has(key) }).toEqual({ key, exists: true });
    }
  });

  it('names candidates and owed_by_product specifically', () => {
    expect(NEW[0]).toContain('`candidates`');
    expect(NEW[1]).toContain('`owed_by_product`');
    expect(snapshotKeys()).toContain('candidates');
    expect(snapshotKeys()).toContain('owed_by_product');
  });

  it('each is checkable by looking at the page, not by marking the story done', () => {
    for (const c of NEW) {
      expect(c).toMatch(/^Given /);
      expect(c).toMatch(/when it renders, then /);
      expect(c.length).toBeGreaterThan(80);
    }
  });

  it('neither says the page may compute what the platform derives', () => {
    // The stage is derived from the candidate row plus its requests' statuses. A page that worked
    // it out itself would disagree the first time somebody approved a request elsewhere.
    expect(NEW[0]).toMatch(/rather than computed by the page/);
  });
});

describe('the six existing criteria are byte-identical', () => {
  it('the first six are unchanged, which four verified boards depend on', () => {
    const six = COMMAND_CENTER_ACCEPTANCE.slice(0, 6);
    expect(six[0]).toBe(
      'Given the Command Center, when it is opened, then all six panels render and each one names'
      + ' the endpoint it read.',
    );
    expect(six[5]).toBe(
      'Trust -- no panel shows a number, a grant, a rung or a result this domain has not actually'
      + ' produced.',
    );
    // And the seed is the same list, not a second copy that could drift from it.
    expect(domainCommandCenterSeed(DOMAIN).acceptance.slice(0, 6)).toEqual(six);
  });

  it('the new criteria are APPENDED, never inserted among them', () => {
    // An insertion would shift nothing textually but would change the order a grader walks, and
    // the board stores criteria positionally in some surfaces.
    expect(COMMAND_CENTER_ACCEPTANCE.indexOf(COMMAND_CENTER_ACCEPTANCE[6])).toBe(6);
    expect(COMMAND_CENTER_ACCEPTANCE[6]).toMatch(/candidate panel/);
    expect(COMMAND_CENTER_ACCEPTANCE[7]).toMatch(/owes you/);
  });
});

describe('the panel count is checkable now', () => {
  it('the generated prompt carries exactly COMMAND_CENTER_PANEL_COUNT panel headings', () => {
    expect(panelHeadings(prompt)).toHaveLength(COMMAND_CENTER_PANEL_COUNT);
  });

  it('they are numbered 1..N with no gap and no duplicate', () => {
    const numbers = panelHeadings(prompt).map((h) => Number(h.match(/\d+/)![0]));
    expect(numbers).toEqual(
      Array.from({ length: COMMAND_CENTER_PANEL_COUNT }, (_v, i) => i + 1),
    );
  });

  it('the heading above them states the same number, generated from the constant', () => {
    expect(prompt).toContain(
      `## The ${COMMAND_CENTER_PANEL_COUNT} panels, and the question each one answers`,
    );
  });

  it('holds for every one of the ten domains, not just the one under test', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      const dom = AGENT_DOMAINS.find((x) => x.domain_key === key)!;
      const p = commandCenterPromptForDomain(dom, loadDomainMatrix(key));
      expect({ key, n: panelHeadings(p).length })
        .toEqual({ key, n: COMMAND_CENTER_PANEL_COUNT });
    }
  });

  /**
   * The gap, asserted rather than left to be discovered.
   *
   * Criterion 1 says SIX and the page has EIGHT. That is deliberate and the reason is recorded in
   * the story module: editing the sentence would un-verify four boards. Pinning both numbers here
   * means the discrepancy is a documented decision rather than something a reader finds and
   * assumes is a bug.
   */
  it('criterion 1 still says six, deliberately, and the gap is two', () => {
    expect(COMMAND_CENTER_PANEL_COUNT_IN_FIRST_CRITERION).toBe(6);
    expect(COMMAND_CENTER_ACCEPTANCE[0]).toContain('all six panels');
    expect(COMMAND_CENTER_PANEL_COUNT - COMMAND_CENTER_PANEL_COUNT_IN_FIRST_CRITERION).toBe(2);
  });
});

describe('the eight stages come from BUILDER_STAGES, not a second list', () => {
  it('every stage key in the import appears in the generated prompt', () => {
    for (const s of BUILDER_STAGES) {
      expect(prompt).toContain(`\`${s.stage}\``);
    }
  });

  it('every stage title and artifact path appears too', () => {
    for (const s of BUILDER_STAGES) {
      expect(prompt).toContain(s.title);
      expect(prompt).toContain(s.artifact_path);
    }
  });

  it('the doc names all eight with their meaning and their owner', () => {
    for (const s of BUILDER_STAGES) {
      expect(doc).toContain(s.title);
      expect(doc).toContain(`\`${s.stage}\``);
      expect(doc).toContain(s.meaning);
    }
  });

  it('the doc says in words that one stage owes no task', () => {
    expect(doc).toMatch(/owes you no task/);
  });

  it('the prompt tells a builder they are never asked what they do by hand', () => {
    // Ali's correction, and the reason the first worked example broke: they do not hold the job.
    expect(prompt).toMatch(/never asked what you do by hand/);
    expect(prompt).toMatch(/four candidates arrive from four places/i);
  });

  it('the stage table lists eight rows, counted', () => {
    const rows = [...prompt.matchAll(/^\| \d+ \| `[a-z_]+`/gm)];
    expect(rows).toHaveLength(BUILDER_STAGES.length);
    expect(rows).toHaveLength(8);
  });
});

describe('panel five gained the two requests, without its criterion changing', () => {
  it('the prompt says one candidate can produce two requests', () => {
    expect(prompt).toMatch(/One candidate can produce TWO requests/);
  });

  it('and says there is exactly one approval spine', () => {
    expect(prompt).toMatch(/exactly one approval spine/);
  });

  it('panel five\'s criterion is untouched', () => {
    expect(COMMAND_CENTER_ACCEPTANCE[4]).toBe(
      'Given the governance panel, when a tool request is shown, then nothing on the page states'
      + ' or implies that filing it granted anything.',
    );
  });

  it('panel eight refuses the tool-request confusion in words', () => {
    expect(prompt).toMatch(/does NOT belong on this panel/);
  });
});
