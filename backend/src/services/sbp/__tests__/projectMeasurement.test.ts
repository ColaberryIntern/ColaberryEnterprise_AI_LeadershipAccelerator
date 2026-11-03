/**
 * The rule that decides whether a project has an outcome measured in real use.
 *
 * This is the rule the whole publish gate turns on. Before these tests existed,
 * `computeMaturity` could not reach `operational_result` at all, so NO case study
 * linked to a student project could ever be published - every live record on the
 * platform is an unlinked repo collection, and the one project-sourced record ever
 * created is still a draft. That is what this file is guarding.
 *
 * Pure throughout: no database, no mocks, no clock.
 */
import {
  outcomeEvidenceItems,
  outcomeGapReason,
  definitionIsApproved,
  outcomeIsConfirmed,
  type MeasurementDefinition,
  type MeasurementOutcome,
} from '../projectMeasurement';
import { computeMaturity } from '../caseStudyFoundation';

const BUILDER = 'swati@colaberry.com';
const REVIEWER = 'ali@colaberry.com';

const def = (over: Partial<MeasurementDefinition> = {}): MeasurementDefinition => ({
  id: 'def-1',
  measurementKey: 'st2-review-minutes',
  name: 'ST2 reviewer minutes',
  question: 'How long does one ST2 review take a reviewer?',
  method: 'Active time between reviewer actions in the app audit trail.',
  unit: 'minutes',
  direction: 'lower_is_better',
  baselineDisplay: 'about 30 minutes by hand',
  status: 'approved',
  createdBy: BUILDER,
  approvedBy: REVIEWER,
  approvedAt: '2026-11-03T10:00:00.000Z',
  ...over,
});

const out = (over: Partial<MeasurementOutcome> = {}): MeasurementOutcome => ({
  id: 'out-1',
  definitionId: 'def-1',
  valueDisplay: 'about 12 minutes',
  numericValue: 12,
  unit: 'minutes',
  baselineDisplay: 'about 30 minutes by hand',
  sample: '4 ST2 reviews finished 19 Oct to 2 Nov 2026',
  observedFrom: '2026-10-19',
  observedTo: '2026-11-02',
  evidence: 'app audit trail',
  evidenceUrl: null,
  status: 'confirmed',
  recordedBy: BUILDER,
  confirmedBy: REVIEWER,
  confirmedAt: '2026-11-03T12:00:00.000Z',
  ...over,
});

describe('definitionIsApproved', () => {
  it('accepts an approved definition signed by somebody other than its author', () => {
    expect(definitionIsApproved(def())).toBe(true);
  });

  it('refuses a proposal, however complete it looks', () => {
    expect(definitionIsApproved(def({ status: 'proposed' }))).toBe(false);
  });

  it('refuses a retired definition', () => {
    expect(definitionIsApproved(def({ status: 'retired' }))).toBe(false);
  });

  it('REFUSES SELF-APPROVAL: the author cannot sign their own question', () => {
    expect(definitionIsApproved(def({ approvedBy: BUILDER }))).toBe(false);
  });

  it('refuses self-approval regardless of case or padding in the address', () => {
    expect(definitionIsApproved(def({ approvedBy: '  SWATI@Colaberry.com ' }))).toBe(false);
  });

  it('refuses an approved status with no signature behind it', () => {
    expect(definitionIsApproved(def({ approvedBy: null }))).toBe(false);
    expect(definitionIsApproved(def({ approvedAt: null }))).toBe(false);
  });
});

describe('outcomeIsConfirmed', () => {
  it('accepts a confirmed reading signed by somebody other than its recorder', () => {
    expect(outcomeIsConfirmed(out())).toBe(true);
  });

  it('refuses a reading nobody has confirmed yet', () => {
    expect(outcomeIsConfirmed(out({ status: 'recorded', confirmedBy: null, confirmedAt: null }))).toBe(false);
  });

  it('refuses a withdrawn reading', () => {
    expect(outcomeIsConfirmed(out({ status: 'withdrawn' }))).toBe(false);
  });

  it('REFUSES SELF-CONFIRMATION: the person who read the number cannot establish it', () => {
    expect(outcomeIsConfirmed(out({ confirmedBy: BUILDER }))).toBe(false);
  });
});

describe('outcomeEvidenceItems', () => {
  it('returns the reading when definition and reading are both properly signed', () => {
    const items = outcomeEvidenceItems([def()], [out()]);

    expect(items).toHaveLength(1);
    expect(items[0].definitionKey).toBe('st2-review-minutes');
    expect(items[0].valueDisplay).toBe('about 12 minutes');
    expect(items[0].question).toBe('How long does one ST2 review take a reviewer?');
  });

  it('carries NO identities: who recorded and who confirmed never leave the store', () => {
    const [item] = outcomeEvidenceItems([def()], [out()]);
    const serialised = JSON.stringify(item);

    expect(serialised).not.toContain(BUILDER);
    expect(serialised).not.toContain(REVIEWER);
  });

  it('drops a confirmed reading whose definition is only proposed', () => {
    expect(outcomeEvidenceItems([def({ status: 'proposed' })], [out()])).toEqual([]);
  });

  it('drops a reading against a definition this project does not have', () => {
    // A reading nobody can trace back to an agreed question is exactly what this
    // design refuses, so an unknown definitionId is dropped rather than trusted.
    expect(outcomeEvidenceItems([def()], [out({ definitionId: 'def-elsewhere' })])).toEqual([]);
  });

  it('drops a self-confirmed reading even when the definition is sound', () => {
    expect(outcomeEvidenceItems([def()], [out({ confirmedBy: BUILDER })])).toEqual([]);
  });

  it('drops every reading when the definition was self-approved', () => {
    expect(outcomeEvidenceItems([def({ approvedBy: BUILDER })], [out()])).toEqual([]);
  });

  it('COUNTS AN OUTCOME THAT WENT THE WRONG WAY: this is not a marketing ladder', () => {
    // A measurement that got worse is still a measurement taken in use. A rung that
    // only climbed on good news would be worth nothing.
    const worse = out({ valueDisplay: 'about 44 minutes', numericValue: 44 });
    expect(outcomeEvidenceItems([def({ direction: 'lower_is_better' })], [worse])).toHaveLength(1);
  });

  it('prefers the reading’s own unit and baseline over the definition’s', () => {
    const items = outcomeEvidenceItems(
      [def({ unit: 'minutes', baselineDisplay: 'definition baseline' })],
      [out({ unit: 'seconds', baselineDisplay: 'reading baseline' })],
    );
    expect(items[0].unit).toBe('seconds');
    expect(items[0].baselineDisplay).toBe('reading baseline');
  });

  it('falls back to the definition’s unit when the reading does not carry one', () => {
    const items = outcomeEvidenceItems([def({ unit: 'minutes' })], [out({ unit: null })]);
    expect(items[0].unit).toBe('minutes');
  });

  it('orders by when each reading was confirmed, oldest first', () => {
    const items = outcomeEvidenceItems(
      [def(), def({ id: 'def-2', measurementKey: 'second' })],
      [
        out({ id: 'b', confirmedAt: '2026-11-03T12:00:00.000Z' }),
        out({ id: 'a', definitionId: 'def-2', confirmedAt: '2026-10-01T09:00:00.000Z' }),
      ],
    );
    expect(items.map((i) => i.definitionKey)).toEqual(['second', 'st2-review-minutes']);
  });

  it('boundary: no definitions and no readings is empty, not a throw', () => {
    expect(outcomeEvidenceItems([], [])).toEqual([]);
  });
});

describe('outcomeGapReason', () => {
  it('says nothing is defined when nothing is', () => {
    expect(outcomeGapReason([], [])).toMatch(/No measurement has been defined/);
  });

  it('distinguishes a proposal from an absence', () => {
    expect(outcomeGapReason([def({ status: 'proposed' })], [])).toMatch(/proposed but not approved/);
  });

  it('says a definition is approved but unread when there is no reading', () => {
    expect(outcomeGapReason([def()], [])).toMatch(/no reading has been recorded/);
  });

  it('names the person-shaped next step when a reading awaits a second signature', () => {
    const waiting = out({ status: 'recorded', confirmedBy: null, confirmedAt: null });
    expect(outcomeGapReason([def()], [waiting])).toMatch(/waiting to be confirmed by somebody other/);
  });
});

describe('computeMaturity — the rung that could not be reached', () => {
  const base = { verifiedStories: 29, mergedEnrichments: 29, demonstrations: 98 };

  it('REGRESSION: with no outcomes it behaves exactly as it did before', () => {
    // Every existing caller omits `outcomes`. If this ever changed, every project
    // on the platform would move rung without anybody asking for it.
    expect(computeMaturity(base).maturity).toBe('capability_demonstration');
    expect(computeMaturity({ ...base, outcomes: 0 }).maturity).toBe('capability_demonstration');
    expect(computeMaturity({ verifiedStories: 0, mergedEnrichments: 0, demonstrations: 0 }).maturity)
      .toBe('story_hypothesis');
    expect(computeMaturity({ verifiedStories: 3, mergedEnrichments: 3, demonstrations: 0 }).maturity)
      .toBe('build_record');
  });

  it('reaches operational_result on a confirmed outcome — the point of the whole change', () => {
    const r = computeMaturity({ ...base, outcomes: 1 });

    expect(r.maturity).toBe('operational_result');
    expect(r.reason).toMatch(/1 confirmed outcome measured in use/);
    expect(r.nextRungNeeds).toBeNull();
  });

  it('does not require a demonstration alongside the outcome', () => {
    // Measured in use is stronger evidence than watched working. A project holding
    // the stronger evidence should not be reported at a lower rung for missing the
    // weaker one.
    const r = computeMaturity({ verifiedStories: 1, mergedEnrichments: 1, demonstrations: 0, outcomes: 2 });
    expect(r.maturity).toBe('operational_result');
    expect(r.reason).toMatch(/2 confirmed outcomes/);
  });

  it('still refuses to climb when nothing was built at all', () => {
    // An outcome with no build behind it is a number without a thing that produced
    // it. The bottom rung's test runs first and stays first.
    const r = computeMaturity({ verifiedStories: 0, mergedEnrichments: 0, demonstrations: 0, outcomes: 5 });
    expect(r.maturity).toBe('story_hypothesis');
  });
});
