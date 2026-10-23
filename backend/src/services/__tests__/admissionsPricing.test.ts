const mockFindAll = jest.fn();
const mockFindOne = jest.fn();
const mockCreate = jest.fn();
jest.mock('../../models/AdmissionsKnowledgeEntry', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockFindAll(...a), findOne: (...a: unknown[]) => mockFindOne(...a), create: (...a: unknown[]) => mockCreate(...a) },
}));

import { MEMBERSHIP, membershipPriceSentence, membershipPriceLine, quotesRetiredFact } from '../admissionsPricing';
import { SEED_ENTRIES, seedAdmissionsKnowledge, retireStaleFacts } from '../admissionsKnowledgeSeed';

/**
 * C22 (Ali, 2026-10-23): Maya quotes $149/month billed annually, $199/month month-to-month and "start for $0"; the retired $4,500
 * offer and the past March 31, 2026 cohort are never quoted, and rows that still say them are switched off on every boot.
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

  it('says $149 annually, $199 month-to-month and start for $0; never "free", never a retired fact', () => {
    for (const s of [membershipPriceSentence(), membershipPriceLine()]) {
      expect(s).toContain('$149');
      expect(s).toContain('$199');
      expect(s).toContain('$0');
      expect(s).not.toMatch(/\bfree\b/i);
      expect(quotesRetiredFact(s)).toBe(false);
    }
    expect(membershipPriceSentence()).toContain('$1,788 a year');
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

  it('no seeded row quotes a retired fact, and the pricing row is the membership sentence', () => {
    for (const e of SEED_ENTRIES) expect(quotesRetiredFact(`${e.title} ${e.content}`)).toBe(false);
    const pricing = SEED_ENTRIES.find((e) => e.title === 'Program Investment')!;
    expect(pricing.content).toContain(membershipPriceSentence());
    expect(pricing.keywords).not.toContain('4500');
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
