jest.mock('../collectProjectNeeds', () => ({ collectProjectNeeds: jest.fn() }));
jest.mock('../resolveProjectNeed', () => ({ resolveProjectNeed: jest.fn() }));

import {
  renderCollectionFormHtml,
  buildSharathCollectionForm,
  ingestCollectionAnswers,
} from '../collectionForm';
import { collectProjectNeeds } from '../collectProjectNeeds';
import { resolveProjectNeed } from '../resolveProjectNeed';
import type { HumanNeed } from '../proposalReviewTypes';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

const need = (over: Partial<HumanNeed> = {}): HumanNeed => ({
  kind: 'fact', key: 'k1', ask: 'What is the project budget?', why: 'It sizes the proposal.',
  usedIn: [{ docKey: 'cover' }], format: 'A dollar amount', blocking: 'score', ...over,
});

describe('renderCollectionFormHtml (M4-T1)', () => {
  it('renders every need as a question with its ask, why, and an answer placeholder, under a DRAFT banner', () => {
    const html = renderCollectionFormHtml([
      need({ key: 'a', ask: 'Budget?', why: 'sizes it' }),
      need({ key: 'b', ask: 'Deadline?', why: 'schedules it', suggestions: ['2027-01-15'] }),
    ], { projectName: 'TxDOT Claims' });
    expect(html).toContain('DRAFT - held for Ali');
    expect(html).toContain('Budget?');
    expect(html).toContain('Deadline?');
    expect(html).toContain('Why we need it: sizes it');
    expect(html).toContain('Example: 2027-01-15');
    expect(html).toContain('Your answer:');
    expect(html).toContain('TxDOT Claims');
  });

  it('escapes HTML in need text so injected markup cannot break the document', () => {
    const html = renderCollectionFormHtml([need({ ask: '<script>alert(1)</script>' })]);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders a grouped record need as its component fields, not one blank', () => {
    const html = renderCollectionFormHtml([
      need({ kind: 'record', key: 'ref1', ask: 'A past-performance reference', recordType: 'reference', recordFields: ['client', 'scope', 'period'] }),
    ]);
    expect(html).toContain('client:');
    expect(html).toContain('scope:');
    expect(html).toContain('period:');
  });

  it('yields a "nothing outstanding" note for an empty needs list, not an empty request', () => {
    const html = renderCollectionFormHtml([], { projectName: 'Empty Pursuit' });
    expect(html).toContain('nothing outstanding');
    expect(html).not.toContain('Your answer:');
  });

  it('is deterministic', () => {
    const a = renderCollectionFormHtml([need()]);
    const b = renderCollectionFormHtml([need()]);
    expect(a).toBe(b);
  });
});

describe('buildSharathCollectionForm (M4-T1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds the form from the live open needs and reports the count', async () => {
    mock(collectProjectNeeds).mockResolvedValue([need({ ask: 'Budget?' })]);
    const r = await buildSharathCollectionForm('dp-1', { projectName: 'P' });
    expect(r.needCount).toBe(1);
    expect(r.html).toContain('Budget?');
    expect(mock(collectProjectNeeds)).toHaveBeenCalledWith('dp-1');
  });
});

describe('ingestCollectionAnswers (M4-T1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('routes each answer through resolveProjectNeed and summarizes resolved vs failed', async () => {
    mock(resolveProjectNeed)
      .mockResolvedValueOnce({ status: 200, body: {} })
      .mockResolvedValueOnce({ status: 400, body: { error: 'bad' } });
    const r = await ingestCollectionAnswers('dp-1', [
      { key: 'a', submission: { value: '1M' } },
      { key: 'b', submission: { value: '' } },
    ], { } as any);
    expect(r.total).toBe(2);
    expect(r.resolved).toBe(1);
    expect(r.failed).toBe(1);
    expect(mock(resolveProjectNeed)).toHaveBeenCalledWith('dp-1', 'a', { value: '1M' }, expect.anything());
  });

  it('a throwing resolve is counted as failed, never aborting the rest', async () => {
    mock(resolveProjectNeed)
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ status: 200, body: {} });
    const r = await ingestCollectionAnswers('dp-1', [
      { key: 'a', submission: { value: 'x' } },
      { key: 'b', submission: { value: 'y' } },
    ], {} as any);
    expect(r.resolved).toBe(1);
    expect(r.failed).toBe(1);
    expect(r.results).toEqual([{ key: 'a', status: 500 }, { key: 'b', status: 200 }]);
  });

  it('handles an empty answer list', async () => {
    const r = await ingestCollectionAnswers('dp-1', [], {} as any);
    expect(r).toEqual({ total: 0, resolved: 0, failed: 0, results: [] });
  });
});
