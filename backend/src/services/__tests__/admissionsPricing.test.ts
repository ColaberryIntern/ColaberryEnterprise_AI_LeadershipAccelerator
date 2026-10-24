const mockFindAll = jest.fn();
const mockFindOne = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../models/AdmissionsKnowledgeEntry', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockFindAll(...a), findOne: (...a: unknown[]) => mockFindOne(...a), create: (...a: unknown[]) => mockCreate(...a) },
}));

jest.mock('../aiEventService', () => ({ emitRetrieval: () => Promise.resolve() }));

import { MEMBERSHIP, membershipPitchSentence, membershipPitchLine, monthToMonthSentence, pricingPitchRule, quotesRetiredFact } from '../admissionsPricing';
import { SEED_ENTRIES, seedAdmissionsKnowledge, retireStaleFacts } from '../admissionsKnowledgeSeed';
import { findRelevantKnowledge } from '../admissionsKnowledgeService';

/**
 * C22 (Ali, 2026-10-23): $149/month billed annually, $199/month month-to-month and "start for $0"; the retired $4,500 offer and the
 * past March 31, 2026 cohort are never quoted, and rows that still say them are switched off on every boot.
 * Ali, 2026-10-24: lead with the annual membership ALONE; the month-to-month plan only when the person pushes back.
 */
describe('the price Maya quotes', () => {
  it('CONTRACT: equals what checkout charges (subscriptionService PLANS)', () => {
    // Read from the source, not imported: billing pulls in the enrollment and email services, which this test must not boot.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'subscriptionService.ts'), 'utf8') as string;
    const per = (plan: string) => Number((new RegExp(`${plan}: makePlan\\('${plan}', '[^']+', (\\d+)`).exec(src) ?? [])[1]);
    expect(per('annual')).toBe(MEMBERSHIP.annualPerMonth);
    expect(per('monthly')).toBe(MEMBERSHIP.monthly);
    expect(MEMBERSHIP.annualPerYear).toBe(MEMBERSHIP.annualPerMonth * 12);
  });

  it('the pitch is the annual membership ALONE: $149 billed annually and start for $0, never $199', () => {
    for (const s of [membershipPitchSentence(), membershipPitchLine()]) {
      expect(s).toContain('$149');
      expect(s).toMatch(/billed annually/);
      expect(s).toContain('$0');
      expect(s).not.toContain('$199');
      expect(s).not.toMatch(/month-to-month|cancel anytime/i);
      expect(s).not.toMatch(/\bfree\b/i);
      expect(quotesRetiredFact(s)).toBe(false);
    }
    expect(membershipPitchSentence()).toContain('$1,788 a year');
  });

  it('the pushback answer is the month-to-month plan: $199, cancel anytime, and what the annual plan saves', () => {
    const s = monthToMonthSentence();
    expect(s).toContain('$199 per month');
    expect(s).toMatch(/cancel anytime/);
    expect(s).toContain('$600 a year'); // (199 - 149) x 12
    expect(s).not.toMatch(/\bfree\b/i);
  });

  it('the voice rule leads with the annual price and keeps month-to-month for pushback, never both in one breath', () => {
    const r = pricingPitchRule();
    expect(r.indexOf('$149')).toBeLessThan(r.indexOf('$199'));
    expect(r).toMatch(/Do NOT mention the month-to-month plan unless they push back/);
    expect(r).toMatch(/Never give both prices in the same breath/);
  });

  it('recognises the retired facts in the shapes they were written', () => {
    for (const t of ['$4,500 per participant', 'The cost is $4500.', 'forty-five hundred: 4,500 per seat', 'The next cohort starts March 31, 2026.', 'begins March 31.']) {
      expect(quotesRetiredFact(t)).toBe(true);
    }
    for (const t of ['$149 per month', '$45,000 consulting', 'Hiring costs $250,000', 'Founding Cohort July 23, 2026']) {
      expect(quotesRetiredFact(t)).toBe(false);
    }
  });
});

describe('the admissions knowledge seed', () => {
  beforeEach(() => { mockFindAll.mockReset(); mockFindOne.mockReset(); mockCreate.mockReset(); });

  it('no seeded row quotes a retired fact; the pricing row is the annual pitch only; month-to-month is its own pushback row', () => {
    for (const e of SEED_ENTRIES) expect(quotesRetiredFact(`${e.title} ${e.content}`)).toBe(false);
    const pricing = SEED_ENTRIES.find((e) => e.title === 'Program Investment')!;
    expect(pricing.content).toContain(membershipPitchSentence());
    expect(pricing.content).not.toContain('$199');
    expect(pricing.keywords).not.toContain('4500');
    expect(pricing.keywords).not.toContain('199');
    const m2m = SEED_ENTRIES.find((e) => e.title.startsWith('Month-to-Month Option'))!;
    expect(m2m.content).toContain(monthToMonthSentence());
    expect(m2m.content).toMatch(/^Offer this ONLY if the person pushes back/);
    expect(m2m.priority).toBeLessThan(pricing.priority);
  });

  it('Maya\'s retrieval: a price question surfaces the annual pitch first; a month-to-month question surfaces the pushback row', async () => {
    mockFindAll.mockResolvedValue(SEED_ENTRIES.map((e) => ({ ...e })));
    const first = async (q: string) => (await findRelevantKnowledge({ query: q, pageCategory: 'pricing', limit: 4 }))[0]?.title;
    expect(await first('how much does it cost')).toBe('Program Investment');
    expect(await first('what is the price of the membership')).toBe('Program Investment');
    expect(await first('is there a month to month option, a year is too much commitment')).toMatch(/^Month-to-Month Option/);
    expect(await first('can I cancel anytime')).toMatch(/^Month-to-Month Option/);
  });

  it('switches off every active row that quotes a retired fact, whoever wrote it; leaves the rest; deletes nothing', async () => {
    const row = (title: string, content: string) => ({ title, content, update: jest.fn(async () => undefined) });
    const rows = [row('Program Pricing', 'The cost to enroll is $4,500 per participant.'), row('Next Cohort', 'Starts March 31, 2026.'),
      row('Individual Pricing', '$149 per month billed annually or $199 month-to-month.'), row('Cost of AI Talent', 'Over $250K per senior hire.')];
    mockFindAll.mockResolvedValue(rows);
    expect(await retireStaleFacts()).toBe(2);
    expect(rows[0].update).toHaveBeenCalledWith({ active: false });
    expect(rows[1].update).toHaveBeenCalledWith({ active: false });
    expect(rows[2].update).not.toHaveBeenCalled();
    expect(rows[3].update).not.toHaveBeenCalled();
    expect(mockFindAll).toHaveBeenCalledWith({ where: { active: true } });
  });

  it('is idempotent: a second boot finds nothing left to retire', async () => {
    mockFindAll.mockResolvedValue([]);
    expect(await retireStaleFacts()).toBe(0);
  });

  it('a boot rewrites a stale seeded row to the new content and then retires the leftovers', async () => {
    const stale = { content: 'The Enterprise AI Leadership Accelerator is $4,500 per participant.', keywords: ['4500'], update: jest.fn(async () => undefined) };
    mockFindOne.mockImplementation(async ({ where }: { where: { title: string } }) => (where.title === 'Program Investment' ? stale : null));
    mockCreate.mockResolvedValue({});
    mockFindAll.mockResolvedValue([]);
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    await seedAdmissionsKnowledge();
    log.mockRestore();
    expect(stale.update).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('$149') }));
    expect(mockFindAll).toHaveBeenCalledTimes(1);
  });
});
