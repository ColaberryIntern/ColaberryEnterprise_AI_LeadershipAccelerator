/**
 * Program rename, 2026-11-17: "AI Systems Architect Accelerator" -> "Forward Deployed AI Engineer
 * Accelerator". Everything that RECOGNISES the name must keep recognising BOTH, because drafts,
 * stored bodies and older forms still carry the old one. These pin that, so a later tidy-up that
 * drops the old alternative fails here instead of silently double-signing an email or
 * mis-classifying a lead.
 */
import { INTEREST_AREA_RULES } from '../services/growthJourney/classification/classificationRules';
import { hasBrandedSignature } from '../services/email/aliEmailStyle';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mandrill = require('../scripts/lib/mandrillPreflight.js');

const TITLES = ['AI Systems Architect', 'Forward Deployed AI Engineer'];

describe('program rename: matchers accept the old and the new name', () => {
  it.each(TITLES)('Ali\'s signature with "%s" is recognised as a branded signature', (title) => {
    const body = `Thanks,\nAli Muwwakkil\nManaging Director / ${title}\n`;
    expect(hasBrandedSignature(body)).toBe(true);
    expect(mandrill.hasBrandedSignature(body)).toBe(true);
  });

  it.each(TITLES)('two signature blocks with "%s" count as two (double-sign guard)', (title) => {
    const block = `<div>Ali Muwwakkil</div><div>Managing Director / ${title}</div>`;
    expect(mandrill.countSignatureBlocks(block + block)).toBe(2);
  });

  it.each(['AI Systems Architect', 'Forward Deployed AI Engineer', '  forward deployed ai engineer '])(
    'interest_area "%s" classifies as paid-training program interest',
    (value) => {
      const rule = INTEREST_AREA_RULES[value.trim().toLowerCase()];
      expect(rule).toEqual(expect.objectContaining({ family: 'learner_paid_training', intent: 'program_interest' }));
    },
  );
});
