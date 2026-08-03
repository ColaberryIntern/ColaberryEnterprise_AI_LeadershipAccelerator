/**
 * buildMayaProgramFacts (mayaToolsService.ts) — Maya's voice-call program/pricing
 * facts, sourced live from the same DB-backed KB Cora uses (cora_kb_entries).
 * Replaces the old hardcoded $4,500 "Enterprise AI Leadership Accelerator" block.
 * No DB I/O for this pure/formatting logic — mocks kbService.
 */
jest.mock('../kbService', () => ({
  getCourseBySlug: jest.fn(),
  getActiveCohort: jest.fn(),
  listEntries: jest.fn(),
  resolveMergeTags: jest.fn((template: string) => template),
}));

import { buildMayaProgramFacts } from '../mayaToolsService';
import { getCourseBySlug, getActiveCohort, listEntries } from '../kbService';

const mockGetCourseBySlug = getCourseBySlug as jest.Mock;
const mockGetActiveCohort = getActiveCohort as jest.Mock;
const mockListEntries = listEntries as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildMayaProgramFacts', () => {
  it('happy path: formats live program name + Pricing & Enrollment Q&A, no hardcoded $4,500/Enterprise text', async () => {
    mockGetCourseBySlug.mockResolvedValue({ id: 'course-1', name: 'AI Systems Architect Accelerator' });
    mockGetActiveCohort.mockResolvedValue({
      cohort: { id: 'cohort-1', price_annual: 149, price_monthly: 199 },
      course: { id: 'course-1', name: 'AI Systems Architect Accelerator' },
    });
    mockListEntries.mockResolvedValue([
      { question_pattern: 'How much does the program cost?', answer_template: '$149/mo annual or $199/mo monthly.' },
      { question_pattern: 'How does the $50 seat deposit work?', answer_template: 'Credited to your first payment.' },
    ]);

    const facts = await buildMayaProgramFacts();

    expect(facts).toContain('AI Systems Architect Accelerator');
    expect(facts).toContain('How much does the program cost?');
    expect(facts).toContain('How does the $50 seat deposit work?');
    expect(facts).not.toContain('4,500');
    expect(facts).not.toContain('Enterprise AI Leadership Accelerator');
  });

  it('boundary: no active cohort — tells Maya not to guess a price/date instead of falling back to stale facts', async () => {
    mockGetCourseBySlug.mockResolvedValue({ id: 'course-1', name: 'AI Systems Architect Accelerator' });
    mockGetActiveCohort.mockResolvedValue(null);

    const facts = await buildMayaProgramFacts();

    expect(facts).toContain('No active cohort');
    expect(facts).not.toMatch(/\$\d/);
    expect(mockListEntries).not.toHaveBeenCalled();
  });

  it('failure: course not found in KB — returns empty string so the caller\'s own fallback instruction kicks in', async () => {
    mockGetCourseBySlug.mockResolvedValue(null);

    const facts = await buildMayaProgramFacts();

    expect(facts).toBe('');
  });

  it('failure: kbService throws — swallows and returns empty string rather than crashing the call flow', async () => {
    mockGetCourseBySlug.mockRejectedValue(new Error('DB unavailable'));

    const facts = await buildMayaProgramFacts();

    expect(facts).toBe('');
  });
});
