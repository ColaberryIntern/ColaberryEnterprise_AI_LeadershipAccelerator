import { needControl, needKindLabel, unblockLabel, needsBadge, submissionFor, partitionNeeds } from './needsHelpers';
import type { GovProjectNeed } from '../../../../services/govProjectPortalApi';

const need = (over: Partial<GovProjectNeed>): GovProjectNeed => ({
  kind: 'fact', key: 'fact:x', ask: 'ask', why: 'why', usedIn: [{ docKey: 'd' }], format: 'a value', blocking: 'fatal', ...over,
});

describe('needControl', () => {
  it('maps each kind to its inline control', () => {
    expect(needControl(need({ kind: 'fact' }))).toBe('text');
    expect(needControl(need({ kind: 'decision', options: ['a', 'b'] }))).toBe('choice');
    expect(needControl(need({ kind: 'decision', options: [] }))).toBe('confirm');
    expect(needControl(need({ kind: 'confirm_rule' }))).toBe('confirm');
    expect(needControl(need({ kind: 'file' }))).toBe('file');
    expect(needControl(need({ kind: 'signature' }))).toBe('file');
    expect(needControl(need({ kind: 'approval' }))).toBe('approve');
    expect(needControl(need({ kind: 'setting', format: 'a URL (https://…)' }))).toBe('url');
    expect(needControl(need({ kind: 'setting', format: 'a plain value' }))).toBe('text');
  });
});

describe('needKindLabel', () => {
  it('labels each kind', () => {
    expect(needKindLabel('signature')).toBe('Signature');
    expect(needKindLabel('fact')).toBe('Fact');
  });
});

describe('unblockLabel', () => {
  it('counts the distinct documents, singular/plural, project-level when none', () => {
    expect(unblockLabel(need({ usedIn: [{ docKey: 'a' }, { docKey: 'a' }, { docKey: 'b' }] }))).toBe('Unblocks 2 documents');
    expect(unblockLabel(need({ usedIn: [{ docKey: 'a' }] }))).toBe('Unblocks 1 document');
    expect(unblockLabel(need({ usedIn: [] }))).toBe('Project-level');
  });
});

describe('needsBadge', () => {
  it('is fatal when any fatal need, else score, else none', () => {
    expect(needsBadge([need({ blocking: 'fatal' }), need({ blocking: 'score' })])).toEqual({ count: 2, tone: 'fatal' });
    expect(needsBadge([need({ blocking: 'score' })])).toEqual({ count: 1, tone: 'score' });
    expect(needsBadge([])).toEqual({ count: 0, tone: 'none' });
  });
});

describe('submissionFor', () => {
  it('shapes the submission by control', () => {
    expect(submissionFor('text', 'Colaberry')).toEqual({ value: 'Colaberry' });
    expect(submissionFor('url', 'https://x')).toEqual({ value: 'https://x' });
    expect(submissionFor('file', 'ref-123')).toEqual({ fileRef: 'ref-123' });
    expect(submissionFor('approve', 'go')).toEqual({ approve: true, note: undefined });
    expect(submissionFor('approve', 'Pricing first')).toEqual({ approve: false, note: 'Pricing first' });
    expect(submissionFor('confirm', '')).toEqual({ approve: true });
  });
});

describe('partitionNeeds', () => {
  it('splits fatal from score, preserving order', () => {
    const r = partitionNeeds([need({ key: 'a', blocking: 'fatal' }), need({ key: 'b', blocking: 'score' }), need({ key: 'c', blocking: 'fatal' })]);
    expect(r.blockingExport.map((n) => n.key)).toEqual(['a', 'c']);
    expect(r.holdingScore.map((n) => n.key)).toEqual(['b']);
  });
});
