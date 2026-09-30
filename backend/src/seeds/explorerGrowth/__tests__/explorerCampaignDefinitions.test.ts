import * as fs from 'fs';
import * as path from 'path';
import {
  EXPLORER_CAMPAIGNS,
  definedCampaignKeys,
  EXPLORER_CAMPAIGN_TYPE,
  FORBIDDEN_NAME_FRAGMENT,
} from '../explorerCampaignDefinitions';

/**
 * EPIC 6 T001.
 *
 * The Governor emits a `campaign_key` on every decision; these definitions create
 * the rows those keys resolve to. If the two sets drift, `selected_campaign_id`
 * goes null and reads as "the Governor declined to pick a campaign" rather than
 * as a mismatch — the same untyped-seam failure this programme has now paid for
 * three times.
 */

const CANDIDATES_DIR = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'services',
  'explorerGrowth',
  'governor',
  'candidates',
);

/**
 * Every `explorer_*` string literal the generators emit.
 *
 * SCANS FOR THE LITERALS, not for `campaign_key:\s*'...'`. Both activation keys
 * live in a ternary on one line of `activationRescue.ts`:
 *
 *   campaign_key: neverEngaged ? 'explorer_activation_never_started' : 'explorer_activation_restart'
 *
 * A property-anchored pattern finds neither, and the coverage assertion below
 * would then pass while blind to two of the eight.
 */
function keysEmittedBySource(): string[] {
  const out = new Set<string>();
  for (const f of fs.readdirSync(CANDIDATES_DIR)) {
    if (!f.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(CANDIDATES_DIR, f), 'utf8');
    for (const m of src.matchAll(/'(explorer_[a-z_]+)'/g)) out.add(m[1]);
  }
  return [...out].sort();
}

describe('the definitions cover exactly what the Governor emits', () => {
  const emitted = keysEmittedBySource();

  it('found the keys in source — a blind extractor would pass everything below', () => {
    // This is the assertion that keeps the rest honest. An extractor returning []
    // makes "no missing keys" and "no orphans" both trivially true.
    expect(emitted).toHaveLength(8);
  });

  it('picks up BOTH arms of the activation ternary', () => {
    expect(emitted).toEqual(
      expect.arrayContaining(['explorer_activation_never_started', 'explorer_activation_restart']),
    );
  });

  it('defines a campaign for every key the Governor emits', () => {
    const missing = emitted.filter((k) => !definedCampaignKeys().includes(k));
    expect(missing).toEqual([]);
  });

  it('defines no campaign nothing emits', () => {
    // A row nothing can select is worse than no row: it looks like coverage.
    // `explorer_dormant_reentry` from the plan document is absent for this reason.
    const orphans = definedCampaignKeys().filter((k) => !emitted.includes(k));
    expect(orphans).toEqual([]);
  });

  it('does not seed explorer_dormant_reentry, which the design doc specifies', () => {
    // Named explicitly so that re-adding it from the stale plan is a visible choice.
    expect(definedCampaignKeys()).not.toContain('explorer_dormant_reentry');
  });
});

describe('the definitions themselves are well formed', () => {
  it('has eight, with unique keys and unique names', () => {
    expect(EXPLORER_CAMPAIGNS).toHaveLength(8);
    expect(new Set(definedCampaignKeys()).size).toBe(8);
    expect(new Set(EXPLORER_CAMPAIGNS.map((c) => c.name)).size).toBe(8);
  });

  it('gives every campaign its own sequence', () => {
    expect(new Set(EXPLORER_CAMPAIGNS.map((c) => c.sequenceName)).size).toBe(8);
  });

  it('carries a real description on each — an operator reads these in Admin', () => {
    for (const c of EXPLORER_CAMPAIGNS) expect(c.description.trim().length).toBeGreaterThan(40);
  });

  it('names no campaign anything containing "Cold Outbound"', () => {
    // schedulerService.ts:3251-3261 flips ANY campaign matching %Cold Outbound%
    // from draft to active on every scheduler start. Explorer campaigns escape it
    // by name alone, so this asserts the coincidence deliberately rather than
    // leaving it to luck.
    for (const c of EXPLORER_CAMPAIGNS) {
      expect(c.name).not.toContain(FORBIDDEN_NAME_FRAGMENT);
      expect(c.sequenceName).not.toContain(FORBIDDEN_NAME_FRAGMENT);
    }
  });

  it('uses warm_nurture, and records why that is a hazard worth knowing', () => {
    // alumniReferralService.ts:226-231 falls back to the newest active
    // warm_nurture campaign and enrolls a referred lead into it. These would be
    // the newest. What stops it is the sequences shipping is_active: false.
    expect(EXPLORER_CAMPAIGN_TYPE).toBe('warm_nurture');
  });
});
