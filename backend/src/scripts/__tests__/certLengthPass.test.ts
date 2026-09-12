jest.mock('../../services/certPrep/certDistractorLengthener', () => ({ lengthenDistractor: jest.fn() }));
jest.mock('../../services/certPrep/certQuestionTriage', () => ({ triageQuestion: jest.fn() }));

import { lengthenDistractor } from '../../services/certPrep/certDistractorLengthener';
import { triageQuestion } from '../../services/certPrep/certQuestionTriage';
import { lengthPlan } from '../../services/certPrep/certOptionLength';
import { ImproverItem } from '../../services/certPrep/certQuestionImprover';
import { passItem } from '../lib/certLengthPass';

/**
 * The pass is the one place the two balancing scripts agree on what a
 * balanced item is. These hold its branching: nothing to do, label only,
 * lengthened-and-triaged, refused, discarded.
 */
const mLengthen = lengthenDistractor as unknown as jest.Mock;
const mTriage = triageQuestion as unknown as jest.Mock;

const base = (over: Partial<ImproverItem> = {}): ImproverItem => ({
  question_key: 'CCARF-D1-40',
  domain_id: 'D1',
  objective_id: 'D1.1',
  stem: 'Monitoring shows something. What is the most likely cause?',
  options: [
    { key: 'A', text: 'short' },
    { key: 'B', text: 'a much longer wrong answer than the key' },
    { key: 'C', text: 'short' },
    { key: 'D', text: 'short' },
  ],
  correct_keys: ['A'],
  rationale: 'because',
  distractor_rationales: { B: 'no', C: 'no', D: 'no' },
  ...over,
});

/** An item whose key is longest and whose hash does not keep it. */
function needsWork(): ImproverItem {
  for (let n = 0; ; n += 1) {
    const it = base({
      question_key: `CCARF-D1-${40 + n}`,
      options: [
        { key: 'A', text: 'the correct option, the longest of the four by a margin' },
        { key: 'B', text: 'wrong one' },
        { key: 'C', text: 'wrong two' },
        { key: 'D', text: 'wrong three' },
      ],
    });
    if (lengthPlan(it).target) return it;
  }
}

beforeEach(() => { mLengthen.mockReset(); mTriage.mockReset(); });

describe('passItem', () => {
  it('is unchanged when the key is not the longest, and spends nothing', async () => {
    const out = await passItem(base());
    expect(out.status).toBe('unchanged');
    expect(mLengthen).not.toHaveBeenCalled();
    expect(mTriage).not.toHaveBeenCalled();
  });

  it('only relabels when a label is the sole problem', async () => {
    const it = base({ options: base().options.map((o) => (o.key === 'C' ? { ...o, text: 'C. short' } : o)) });
    const out = await passItem(it);
    expect(out.status).toBe('relabelled');
    if (out.status === 'relabelled') {
      expect(out.stripped).toEqual(['C']);
      expect(out.item.options[2].text).toBe('short');
    }
    expect(mLengthen).not.toHaveBeenCalled();
  });

  it('lengthens, then triages the LENGTHENED text', async () => {
    const it = needsWork();
    const plan = lengthPlan(it);
    const longer = { ...it, options: it.options.map((o) => (o.key === plan.target ? { ...o, text: 'x'.repeat(plan.minChars) } : o)) };
    mLengthen.mockResolvedValue({ status: 'lengthened', item: longer, before: 9, after: plan.minChars });
    mTriage.mockResolvedValue({ verdict: 'no_concerns', severity: null, concerns: [] });
    const out = await passItem(it);
    expect(out.status).toBe('lengthened');
    expect(mTriage.mock.calls[0][0].options.find((o: any) => o.key === plan.target).text).toBe('x'.repeat(plan.minChars));
  });

  it("reports a refusal with the lengthener's reason", async () => {
    mLengthen.mockResolvedValue({ status: 'out_of_bounds', got: 200, min: 60, max: 100 });
    const out = await passItem(needsWork());
    expect(out.status).toBe('refused');
    if (out.status === 'refused') expect(out.why).toMatch(/out_of_bounds: got 200/);
    expect(mTriage).not.toHaveBeenCalled();
  });

  it('discards on a high-severity triage concern, and on a triage error', async () => {
    const it = needsWork();
    mLengthen.mockResolvedValue({ status: 'lengthened', item: it, before: 1, after: 2 });
    mTriage.mockResolvedValueOnce({ verdict: 'needs_human', severity: 'high', concerns: [{ kind: 'defensible_distractor', option: 'B', detail: 'B is as good' }] });
    expect((await passItem(it)).status).toBe('discarded');
    mTriage.mockResolvedValueOnce({ verdict: 'error', severity: null, concerns: [], errorClass: 'TimeoutError' });
    const out = await passItem(it);
    expect(out.status).toBe('discarded');
    if (out.status === 'discarded') expect(out.why).toMatch(/TimeoutError/);
  });

  it('keeps a medium concern — that is a note for the queue, not a discard', async () => {
    const it = needsWork();
    mLengthen.mockResolvedValue({ status: 'lengthened', item: it, before: 1, after: 2 });
    mTriage.mockResolvedValue({ verdict: 'needs_human', severity: 'medium', concerns: [{ kind: 'other', option: null, detail: 'hmm' }] });
    expect((await passItem(it)).status).toBe('lengthened');
  });
});
