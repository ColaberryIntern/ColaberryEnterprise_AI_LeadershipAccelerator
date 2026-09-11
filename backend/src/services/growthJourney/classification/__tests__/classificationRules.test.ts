import * as fs from 'fs';
import * as path from 'path';
import { OFFER_FAMILIES } from '../../../../models/OfferFamily';
import {
  BEHAVIOUR_RULES,
  CAMPAIGN_INTEREST_RULES,
  CONFIDENCE,
  ENTRY_POINT_RULES,
  INTEREST_AREA_RULES,
  KEYWORD_INTENT_RULES,
  REVIEW_ENTRY_POINTS,
} from '../classificationRules';
import { matchKeywordRule } from '../deterministic';

/**
 * The rule tables are checked against the sources their keys came from. A rule
 * keyed on a value that exists nowhere is dead weight no other test would
 * notice; a family that is not in the catalogue would fail eligibility every
 * time and look like a policy denial.
 */

const SRC = path.join(__dirname, '..', '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('every family a rule names is in the offer catalogue', () => {
  const families = OFFER_FAMILIES as readonly string[];
  const tables: Array<[string, Record<string, { family: string | null }>]> = [
    ['INTEREST_AREA_RULES', INTEREST_AREA_RULES],
    ['ENTRY_POINT_RULES', ENTRY_POINT_RULES],
    ['CAMPAIGN_INTEREST_RULES', CAMPAIGN_INTEREST_RULES],
    ['BEHAVIOUR_RULES', BEHAVIOUR_RULES],
  ];
  for (const [name, table] of tables) {
    it(name, () => {
      for (const [key, rule] of Object.entries(table)) {
        if (rule.family !== null) expect({ key, family: rule.family, ok: families.includes(rule.family) }).toMatchObject({ ok: true });
      }
    });
  }
  it('KEYWORD_INTENT_RULES', () => {
    for (const rule of KEYWORD_INTENT_RULES) {
      if (rule.family !== null) expect(families).toContain(rule.family);
    }
  });
});

describe('ENTRY_POINT_RULES keys are entry points the seed declares', () => {
  const seed = read('seeds/seedLeadSources.ts');
  const seededSlugs = [...seed.matchAll(/^\s*slug: '([a-z_]+)',/gm)].map((m) => m[1]);

  it('the seed parse is not vacuous', () => {
    expect(seededSlugs).toContain('workflow_intake');
    expect(seededSlugs.length).toBeGreaterThan(10);
  });

  it('every rule key is a seeded entry-point slug', () => {
    for (const key of Object.keys(ENTRY_POINT_RULES)) expect(seededSlugs).toContain(key);
  });

  it('every seeded entry point has a rule (so a new form is a deliberate decision)', () => {
    // Source slugs are also matched by the regex; exclude them by name.
    const SOURCES = new Set(['trustbeforeintelligence', 'colaberry', 'advisor', 'worldoftaxonomy', 'cpn', 'ai-flotation', 'refactored']);
    for (const slug of seededSlugs) {
      if (SOURCES.has(slug)) continue;
      expect(Object.keys(ENTRY_POINT_RULES)).toContain(slug);
    }
  });

  it('review-only entry points are a subset of the rule keys', () => {
    for (const k of REVIEW_ENTRY_POINTS) expect(ENTRY_POINT_RULES[k]).toBeDefined();
  });
});

describe('BEHAVIOUR_RULES keys are page categories the map defines', () => {
  const map = read('services/pageCategoryMaps.ts');
  const categories = new Set([...map.matchAll(/': '([a-z_]+)'/g)].map((m) => m[1]));
  it('the map parse is not vacuous', () => {
    expect(categories.has('pricing')).toBe(true);
    expect(categories.size).toBeGreaterThan(5);
  });
  it('every key exists', () => {
    for (const key of Object.keys(BEHAVIOUR_RULES)) expect(categories.has(key)).toBe(true);
  });
});

describe('the keyword table', () => {
  it('is ordered so team training beats a bare automation mention', () => {
    expect(matchKeywordRule('train our team to automate their reporting')?.family).toBe('business_training');
  });

  it('reads the spec’s scenario phrases the way the scenarios expect', () => {
    expect(matchKeywordRule('training for 50 employees')?.family).toBe('business_training');
    expect(matchKeywordRule('business training')?.family).toBe('business_training');
    expect(matchKeywordRule('automate client onboarding')?.family).toBe('workflow_automation');
    expect(matchKeywordRule('build an application for dispatch')?.family).toBe('application_build');
    expect(matchKeywordRule('we would like a proof of concept')?.family).toBe('ai_project');
    expect(matchKeywordRule('need a strategy roadmap')?.family).toBe('ai_consulting');
  });

  it('a bare wish to learn names an intent but no family (the brand decides free vs paid)', () => {
    const r = matchKeywordRule('I want to learn AI');
    expect(r?.intent).toBe('training_request');
    expect(r?.family).toBeNull();
  });

  it('does not fire on unrelated text, and "classify" is not "class"', () => {
    expect(matchKeywordRule('hello, curious about what you do')).toBeNull();
    expect(matchKeywordRule('can you classify these documents')).toBeNull();
    expect(matchKeywordRule('')).toBeNull();
    expect(matchKeywordRule(null)).toBeNull();
  });

  it('carries no opt-out pattern — that detector lives in the Explorer reply classifier', () => {
    const src = read('services/growthJourney/classification/classificationRules.ts');
    expect(src).not.toMatch(/stop\b.*re:/i);
    expect(src).not.toMatch(/remove me/i);
    expect(KEYWORD_INTENT_RULES.map((r) => r.name)).not.toContain('opt_out');
  });
});

describe('confidence thresholds are ordered the way the ladder assumes', () => {
  it('explicit > contract > keyword > single-family source > behaviour ≥ review line > source-only', () => {
    expect(CONFIDENCE.explicit).toBeGreaterThan(CONFIDENCE.contract);
    expect(CONFIDENCE.contract).toBeGreaterThan(CONFIDENCE.keyword);
    expect(CONFIDENCE.keyword).toBeGreaterThan(CONFIDENCE.source_single_family);
    expect(CONFIDENCE.source_single_family).toBeGreaterThan(CONFIDENCE.behaviour);
    expect(CONFIDENCE.behaviour).toBeGreaterThanOrEqual(CONFIDENCE.review_below);
    expect(CONFIDENCE.review_below).toBeGreaterThan(CONFIDENCE.source_only);
  });
});
