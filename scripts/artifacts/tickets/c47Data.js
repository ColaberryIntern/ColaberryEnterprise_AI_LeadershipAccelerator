/**
 * C4.7 - the ROI and business-impact framework. THE single source for the PDFs and the worksheet.
 *
 * ## The finding that shapes the whole artifact
 *
 * We have ZERO sourced benchmarks for customer-side value. Every benchmark C2.4 verified is
 * supply-side: sales quota per FTE, win rate by deal band, sales cycle, all from SPI Research's
 * 2025 Professional Services Maturity Benchmark. Those describe how OUR business sells. None of
 * them says what AI capability is worth to a buyer.
 *
 * So this framework does not estimate the customer's return. It gives them the arithmetic and
 * requires their baseline, which is also exactly what the ticket asks for: "Pre-filling the
 * worksheet with flattering assumptions" is the named failure mode, and "The customer supplies
 * their own baseline" is the named remedy.
 *
 * ## Three assertions, because all three criteria are checkable
 *
 *   - no input may ship with a value           -> assertAllInputsBlank()
 *   - every benchmark must carry a source      -> assertEveryBenchmarkSourced()
 *   - no guaranteed-return language anywhere   -> assertNoGuaranteeLanguage(html)
 */

const AS_OF = '16 October 2026';

const HEADLINE = 'We have no sourced benchmark for what this is worth to a buyer, so this '
  + 'worksheet refuses to tell them. It gives them the arithmetic and asks for their numbers.';

const SO_WHAT = [
  'Every benchmark we have verified is supply-side: what a professional services firm sells per '
  + 'head, what share of bids it wins, how long its sales cycle runs. Those are facts about our '
  + 'business, not about the value of AI capability to a university or an employer.',
  'An ROI model that fills those gaps with plausible numbers produces a figure the buyer did not '
  + 'choose and cannot defend internally, which is worse than no figure at all. The first '
  + 'procurement question is always where the number came from.',
  'So every input on the worksheet is blank and a build assertion fails if any of them ships '
  + 'with a value. What we supply is the two things we can actually verify: what we deliver, and '
  + 'what we charge.',
];

/* ------------------------------------------------------------------ *
 * THE WORKSHEET - customer inputs, deliberately empty
 * ------------------------------------------------------------------ */

const INPUTS = [
  { id: 'I1', label: 'How many people will go through the program', unit: 'people',
    why: 'Drives every per-head figure below.' },
  { id: 'I2', label: 'Fully loaded annual cost of one of those people', unit: 'currency',
    why: 'Salary plus benefits plus overhead, as your finance team books it. We do not supply a '
      + 'salary benchmark; yours is the only one that will survive your own review.' },
  { id: 'I3', label: 'Working days from hire to independently productive, today', unit: 'days',
    why: 'Your current baseline. If you do not measure it, that is itself worth knowing before '
      + 'you buy anything that claims to improve it.' },
  { id: 'I4', label: 'Share of internal AI projects that stall or are reworked, today',
    unit: 'percent',
    why: 'Your rework rate. We measure ours; we cannot measure yours, and the difference between '
      + 'the two is not an estimate we are willing to make for you.' },
  { id: 'I5', label: 'Value to you of one AI project reaching production', unit: 'currency',
    why: 'Cost avoided, revenue enabled, or hours returned. Whichever your finance team already '
      + 'recognises. This is the number most likely to be argued about internally, so it should '
      + 'be yours from the start.' },
  { id: 'I6', label: 'Over what period you want to evaluate this', unit: 'months',
    why: 'Twelve months is the usual frame. Shorter frames flatter any training spend; longer '
      + 'ones flatter any platform spend.' },
];

/* ------------------------------------------------------------------ *
 * WHAT WE SUPPLY - only what we can verify
 * ------------------------------------------------------------------ */

const OURS = [
  { id: 'O1', label: 'Stories verified against a real commit, to date',
    value: '345 across 29 projects', src: 'Production, re-read ' + AS_OF + ', registry CLM-002' },
  { id: 'O2', label: 'Learner projects in flight', value: '48',
    src: 'Production, re-read ' + AS_OF + ', registry CLM-001' },
  { id: 'O3', label: 'Marginal cost to us of verifying one more story', value: 'effectively zero',
    src: 'Verification runs on push and is identical in all three delivery modes, C2.2. This is '
      + 'why the license carries an 84% gross margin and why we can say it without hedging.' },
  { id: 'O4', label: 'What we charge', value: 'See the C2.3 price list',
    src: 'C2.3, approved. Two families: staffed cohorts priced per engagement, self-paced '
      + 'licenses priced per learner per year, with two floors below which a deal is not worth '
      + 'running.' },
];

/* ------------------------------------------------------------------ *
 * THE ARITHMETIC - stated, not computed for them
 * ------------------------------------------------------------------ */

const FORMULAS = [
  { out: 'Cost per verified story', f: 'program price divided by stories verified',
    note: 'The only efficiency figure that is ours to quote, because both halves are things we '
      + 'can measure.' },
  { out: 'Days of productivity returned', f: '(I3 today minus I3 after) times I1',
    note: 'Requires you to re-measure I3 after. We will not estimate the "after" for you; the '
      + 'honest version of this model is measured twice, not projected once.' },
  { out: 'Value of productivity returned', f: 'days returned times (I2 divided by working days '
      + 'in the year)', note: 'Uses your loaded cost, not a benchmark salary.' },
  { out: 'Value of rework avoided', f: '(I4 today minus I4 after) times projects attempted '
      + 'times I5', note: 'Two of the three inputs are yours and the third is yours after you '
      + 'measure it again.' },
  { out: 'Payback period', f: 'program price divided by monthly value returned',
    note: 'Expressed in months. If the inputs are blank this is blank, which is the intended '
      + 'behavior rather than a defect.' },
];

/* ------------------------------------------------------------------ *
 * BENCHMARKS - what we stand behind, and what we refuse to supply
 * ------------------------------------------------------------------ */

const BENCHMARKS = [
  { v: '$1,600,000', what: 'Annual service sales revenue quota per sales FTE',
    src: 'SPI Research, 2025 Professional Services Maturity Benchmark, published February 2025, '
      + '403 professional services organizations, fielded September to December 2024. Read from '
      + 'the primary PDF on 12 October 2026.',
    caution: 'This is OUR economics, not yours. It belongs in our break-even model and has no '
      + 'place in your return calculation. It is listed so you can see what we do and do not '
      + 'have.' },
  { v: '47.3%', what: 'Share of bids won, all firms',
    src: 'Same SPI Research study, Table 130. 48.1% in 2023, 47.3% in 2024.',
    caution: 'Also ours. Stable across five years, which is what you want in a break-even model '
      + 'and irrelevant to your return.' },
  { v: '90.9 days', what: 'Sales cycle, qualified lead to contract signature',
    src: 'Same SPI Research study, read from the primary rather than a summary.',
    caution: 'Ours. Useful to you only as an indication of how long our own process takes.' },
];

/** The values we will not supply, each with the reason. This is the honest center of the piece. */
const REFUSED = [
  { what: 'Typical time-to-productivity improvement from AI training',
    why: 'No primary source we have read measures it, and the figures that circulate come from '
      + 'vendors selling the training. We will not repeat a number whose provenance we cannot '
      + 'show you.' },
  { what: 'Typical reduction in project rework',
    why: 'Same. Our own rework rate is measurable; yours is not ours to estimate, and the '
      + 'difference between the two is the entire claim.' },
  { what: 'A benchmark salary or loaded cost',
    why: 'Yours is the only one your finance team will accept. A national average invites an '
      + 'argument about the average instead of a decision about the program.' },
  { what: 'An expected return percentage',
    why: 'This is the one most often asked for and the one we are least willing to give. Any '
      + 'percentage we supplied would be built on the three rows above, none of which we can '
      + 'source.' },
  { what: 'A payback period we would commit to',
    why: 'The worksheet computes it from your inputs. We do not pre-fill it, and nothing in this '
      + 'framework is a guarantee of any outcome.' },
];

/* ------------------------------------------------------------------ *
 * THE GATES
 * ------------------------------------------------------------------ */

/** No customer input may ship carrying a value. Pre-filling is the named failure mode. */
function assertAllInputsBlank() {
  const bad = INPUTS.filter((i) => Object.prototype.hasOwnProperty.call(i, 'value')
    || Object.prototype.hasOwnProperty.call(i, 'default'));
  if (bad.length) {
    throw new Error('customer inputs shipped with a value: ' + bad.map((b) => b.id).join(', ')
      + '. Pre-filling the worksheet with flattering assumptions is the failure this ticket '
      + 'names; the customer supplies their own baseline.');
  }
  return INPUTS.length;
}

/** Every benchmark carries a named source, and every refusal carries a reason. */
function assertEveryBenchmarkSourced() {
  const bad = BENCHMARKS.filter((b) => !b.src || b.src.length < 20);
  if (bad.length) throw new Error('benchmarks without a source: '
    + bad.map((b) => b.what).join(', '));
  const noReason = REFUSED.filter((r) => !r.why);
  if (noReason.length) throw new Error('refusals without a reason: '
    + noReason.map((r) => r.what).join(', '));
  return { stated: BENCHMARKS.length, refused: REFUSED.length };
}

/**
 * No guaranteed-return language anywhere. Checked against the RENDERED output, because the
 * criterion is about what the customer reads.
 */
function assertNoGuaranteeLanguage(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const BAD = ['guarantee', 'guaranteed', 'guarantees', 'assured return', 'risk-free',
    'will deliver a return', 'ensures a return', 'proven roi', 'typical roi'];
  const hits = [];
  for (const phrase of BAD) {
    const re = new RegExp(phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      const window = text.slice(Math.max(0, m.index - 70), m.index + 50);
      // "nothing in this framework is a guarantee" is a denial, not a promise.
      if (!/\b(no|not|nothing|never|without|refuse|will not|do not)\b/i.test(window)) {
        hits.push(phrase + ' -> ...' + window.trim().slice(-90));
      }
    }
  }
  if (hits.length) {
    throw new Error('guaranteed-return language found: ' + hits.join(' | '));
  }
  return { checked: BAD.length, found: 0 };
}

module.exports = {
  AS_OF, HEADLINE, SO_WHAT, INPUTS, OURS, FORMULAS, BENCHMARKS, REFUSED,
  assertAllInputsBlank, assertEveryBenchmarkSourced, assertNoGuaranteeLanguage,
};
