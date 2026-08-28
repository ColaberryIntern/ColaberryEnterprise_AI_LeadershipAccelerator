import * as fs from 'fs';
import * as path from 'path';
import {
  PURPOSE_SPECS,
  PRIMARY_STATE_TO_STAGE,
  stageTagsFor,
  unsupportedPurposes,
  type SupportedPurpose,
} from '../assetPurposeMap';
import { EXPLORER_ASSET_PURPOSES } from '../../../../types/explorerGrowth';
import type { ExplorerPrimaryState } from '../../../../types/explorerGrowth';

/**
 * EPIC 5 T002. Two maps, and the assertions that would have caught the bug each
 * one exists to prevent.
 */

describe('Map A covers every purpose', () => {
  it.each([...EXPLORER_ASSET_PURPOSES])('has a spec for %s', (purpose) => {
    // Walks the CONST ARRAY, not Object.keys(PURPOSE_SPECS) — checking a map
    // against itself passes with eight wrong entries.
    expect(PURPOSE_SPECS[purpose]).toBeDefined();
  });

  it('checked all eight, not a subset', () => {
    expect(EXPLORER_ASSET_PURPOSES).toHaveLength(8);
  });
});

describe('a supported spec can actually be answered', () => {
  const supported = EXPLORER_ASSET_PURPOSES.filter((p) => PURPOSE_SPECS[p].supported);

  it('found supported purposes to check', () => {
    expect(supported.length).toBeGreaterThan(0);
  });

  it.each(supported)('%s names at least one kind, and a real one', (purpose) => {
    // A spec naming a kind the type does not have is the original bug wearing a
    // different hat: it would resolve to nothing and read as a content gap.
    const kindsSrc = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'types', 'explorerGrowth.ts'),
      'utf8',
    );
    const decl = kindsSrc.match(/export type ExplorerAssetType =([\s\S]*?);/);
    const realKinds = Array.from(decl![1].matchAll(/'([^']+)'/g)).map((m) => m[1]);

    const spec = PURPOSE_SPECS[purpose] as SupportedPurpose;
    expect(spec.kinds.length).toBeGreaterThan(0);
    for (const k of spec.kinds) expect(realKinds).toContain(k);
  });

  it.each(supported)('%s carries a positive limit', (purpose) => {
    // A limit of 0 would resolve nothing while looking configured.
    expect((PURPOSE_SPECS[purpose] as SupportedPurpose).limit).toBeGreaterThan(0);
  });
});

describe('an unsupported spec says WHY', () => {
  const unsupported = EXPLORER_ASSET_PURPOSES.filter((p) => !PURPOSE_SPECS[p].supported);

  it('found the four declared gaps', () => {
    expect(unsupported).toEqual(
      expect.arrayContaining([
        'community_digest',
        'friction_recovery',
        'enrollment_offer',
        'referral_invite',
      ]),
    );
  });

  it.each(unsupported)('%s carries a non-empty reason', (purpose) => {
    // The gap report has to say why, not just how many. An empty reason turns
    // a reported gap back into a silent one.
    const spec = PURPOSE_SPECS[purpose];
    expect(spec.supported).toBe(false);
    expect((spec as { reason: string }).reason.trim().length).toBeGreaterThan(10);
  });

  it('surfaces them all through unsupportedPurposes()', () => {
    expect(unsupportedPurposes().map((u) => u.purpose).sort()).toEqual([...unsupported].sort());
  });

  it("names the community gap as a PRIVACY boundary, not a shortage", () => {
    const reason = unsupportedPurposes().find((u) => u.purpose === 'community_digest')!.reason;
    expect(reason).toMatch(/cohort/i);
  });
});

/**
 * MAP B — the test named after the bug it prevents.
 *
 * `ExplorerPrimaryState` and `ExplorerStageTag` are disjoint vocabularies. The
 * first draft of the resolver compared them directly and would have matched
 * nothing for all 153 learners, reported as a content gap rather than a bug.
 */
describe('Map B bridges states to stage tags — the disjoint-vocabulary guard', () => {
  const STATES_FROM_SOURCE = (): string[] => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'types', 'explorerGrowth.ts'),
      'utf8',
    );
    const decl = src.match(/export type ExplorerPrimaryState =([\s\S]*?);/);
    if (!decl) throw new Error('ExplorerPrimaryState not found — this test is checking nothing');
    return Array.from(decl[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);
  };

  it('maps every state in the real union, none invented', () => {
    const states = STATES_FROM_SOURCE();
    expect(states.length).toBe(8);
    expect(Object.keys(PRIMARY_STATE_TO_STAGE).sort()).toEqual([...states].sort());
  });

  /**
   * THE assertion. Every tag this map emits must be a tag the sync actually
   * writes — otherwise the two ends agree in type and disagree in fact, which is
   * precisely how this bug survives type checking.
   */
  it('emits only stage tags the timeline sync actually writes', () => {
    const syncSrc = fs.readFileSync(path.join(__dirname, '..', 'syncTimelineCards.ts'), 'utf8');
    const emitted = new Set(Object.values(PRIMARY_STATE_TO_STAGE));
    for (const tag of emitted) {
      expect(syncSrc).toContain(`'${tag}'`);
    }
  });

  it('separates the two vocabularies rather than aliasing them', () => {
    // If a state were ever equal to a stage tag, a direct comparison would start
    // "working" for that one value and hide the breakage for the other seven.
    const states = Object.keys(PRIMARY_STATE_TO_STAGE);
    const tags = Object.values(PRIMARY_STATE_TO_STAGE);
    expect(states.filter((s) => (tags as string[]).includes(s))).toEqual([]);
  });
});

describe('stageTagsFor picks the right stage source', () => {
  it('honours a purpose that PINS its stage, whatever the learner state', () => {
    // activation_first_step means the FIRST step even for someone further along.
    const spec = PURPOSE_SPECS.activation_first_step as SupportedPurpose;
    expect(stageTagsFor(spec, 'ENGAGED_LEARNER')).toEqual(['activation']);
  });

  it('follows the learner when the purpose pins nothing', () => {
    const spec = PURPOSE_SPECS.lesson_recommendation as SupportedPurpose;
    expect(stageTagsFor(spec, 'ACTIVATING')).toEqual(['activation']);
    expect(stageTagsFor(spec, 'ENGAGED_LEARNER')).toEqual(['learning']);
    expect(stageTagsFor(spec, 'ENROLLMENT_READY')).toEqual(['evergreen']);
  });

  it('returns null — do not filter — rather than an empty list', () => {
    // null means "no stage constraint". An empty array would read as "match
    // nothing", which is the absence-as-decision mistake in a third costume.
    const spec = PURPOSE_SPECS.lesson_recommendation as SupportedPurpose;
    expect(stageTagsFor(spec, undefined)).toBeNull();
  });

  it('never returns an empty array from any state', () => {
    const states = Object.keys(PRIMARY_STATE_TO_STAGE) as ExplorerPrimaryState[];
    const spec = PURPOSE_SPECS.weekly_digest as SupportedPurpose;
    for (const s of states) {
      const tags = stageTagsFor(spec, s);
      expect(tags).not.toBeNull();
      expect(tags!.length).toBeGreaterThan(0);
    }
  });
});
