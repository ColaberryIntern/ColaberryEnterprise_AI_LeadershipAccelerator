/* eslint-disable */
const { auditProjectNeeds, placeholderKeys, needKeyForFact, isCompleteNeed } = require('../auditProposalNeeds');

const completeNeed = (over = {}) => ({ kind: 'fact', key: 'fact:x', ask: 'Provide X', why: 'because', usedIn: [{ docKey: 'd' }], format: 'a value', blocking: 'fatal', ...over });

describe('placeholderKeys', () => {
  it('derives one fact key per distinct marker, honoring an explicit key= prefix', () => {
    expect(placeholderKeys('<p>[PLACEHOLDER: years in business]</p>')).toEqual([needKeyForFact('years in business')]);
    expect(placeholderKeys('[PLACEHOLDER: key=pm_name | Who is the PM?]')).toEqual(['fact:pm_name']);
    expect(placeholderKeys('none here')).toEqual([]);
  });
});

describe('isCompleteNeed', () => {
  it('requires every field present', () => {
    expect(isCompleteNeed(completeNeed())).toBe(true);
    expect(isCompleteNeed(completeNeed({ why: '' }))).toBe(false);
    expect(isCompleteNeed(completeNeed({ usedIn: 'nope' }))).toBe(false);
    expect(isCompleteNeed(null)).toBe(false);
  });
});

describe('auditProjectNeeds', () => {
  it('PASSES when every invariant holds', () => {
    const r = auditProjectNeeds({
      docs: [{
        docKey: 'tech',
        contentHtml: '<p>[PLACEHOLDER: years in business]</p>',
        findings: [
          { message: 'coverage gap', resolver: 'agent', fixHint: 'add a section' },
          { message: 'needs a fact', resolver: 'human', need: completeNeed() },
        ],
      }],
      openNeedKeys: [needKeyForFact('years in business')],
    });
    expect(r.pass).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.checks.find((c) => c.name === 'placeholder_has_open_need').scanned).toBe(1);
  });

  it('FAILS when a placeholder has no open need', () => {
    const r = auditProjectNeeds({ docs: [{ docKey: 'tech', contentHtml: '[PLACEHOLDER: the budget]', findings: [] }], openNeedKeys: [] });
    expect(r.pass).toBe(false);
    expect(r.violations.some((v) => v.check === 'placeholder_has_open_need')).toBe(true);
  });

  it('FAILS when a finding has no resolver', () => {
    const r = auditProjectNeeds({ docs: [{ docKey: 'tech', contentHtml: '', findings: [{ message: 'x' }] }], openNeedKeys: [] });
    expect(r.violations.some((v) => v.check === 'finding_has_resolver')).toBe(true);
  });

  it('FAILS when a human finding has an incomplete need', () => {
    const r = auditProjectNeeds({ docs: [{ docKey: 'tech', contentHtml: '', findings: [{ message: 'x', resolver: 'human', need: { kind: 'fact' } }] }], openNeedKeys: [] });
    expect(r.violations.some((v) => v.check === 'human_finding_has_complete_need')).toBe(true);
  });

  it('is total on empty input (vacuously passes)', () => {
    expect(auditProjectNeeds({ docs: [], openNeedKeys: [] }).pass).toBe(true);
    expect(auditProjectNeeds({}).pass).toBe(true);
  });
});
