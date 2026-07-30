/**
 * coraPersonaRouter tests (BC #10109319420).
 *
 * Pins the persona split: Cora (support) is the default/catch-all, Cory
 * (admissions) only wins when KB categories clearly point to
 * Program Basics / Pricing & Enrollment. No DB I/O for the pure functions;
 * selectPersonaForEmail mocks kbService.listEntries.
 */
jest.mock('../../kbService', () => ({
  listEntries: jest.fn(),
  getActiveCohort: jest.fn(),
  resolveMergeTags: jest.fn((template: string) => template),
}));

import {
  categoryToPersona,
  selectPersonaFromCategories,
  selectPersonaForEmail,
  buildPersonaSystemPromptFromDB,
  PERSONA_PROFILES,
} from '../coraPersonaRouter';
import { listEntries, getActiveCohort } from '../../kbService';

const mockListEntries = listEntries as jest.Mock;
const mockGetActiveCohort = getActiveCohort as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('categoryToPersona', () => {
  it('routes admissions categories to Cory', () => {
    expect(categoryToPersona('Program Basics')).toBe('cory');
    expect(categoryToPersona('Pricing & Enrollment')).toBe('cory');
  });

  it('routes every other known category to Cora (support default)', () => {
    expect(categoryToPersona('Schedule & Sessions')).toBe('cora');
    expect(categoryToPersona('Certification & Outcomes')).toBe('cora');
    expect(categoryToPersona('Platform & Support')).toBe('cora');
    expect(categoryToPersona('Billing & Account')).toBe('cora');
    expect(categoryToPersona('Tools & Setup')).toBe('cora');
    expect(categoryToPersona('Administrative')).toBe('cora');
  });

  it('defaults an unrecognized/future category to Cora, not Cory', () => {
    expect(categoryToPersona('Some New Category Nobody Mapped Yet')).toBe('cora');
  });
});

describe('selectPersonaFromCategories', () => {
  it('boundary: no matched categories -> Cora (safe default)', () => {
    expect(selectPersonaFromCategories([])).toBe('cora');
  });

  it('majority vote: more admissions-category matches -> Cory', () => {
    expect(selectPersonaFromCategories(['Program Basics', 'Pricing & Enrollment', 'Billing & Account'])).toBe('cory');
  });

  it('majority vote: more support-category matches -> Cora', () => {
    expect(selectPersonaFromCategories(['Billing & Account', 'Platform & Support', 'Program Basics'])).toBe('cora');
  });

  it('tie goes to Cora (support is the catch-all)', () => {
    expect(selectPersonaFromCategories(['Program Basics', 'Billing & Account'])).toBe('cora');
  });
});

describe('selectPersonaForEmail', () => {
  it('happy path: email text matching an admissions keyword routes to Cory', async () => {
    mockListEntries.mockResolvedValue([
      { main_category: 'Pricing & Enrollment', keywords: 'price, cost, how much', question_pattern: 'x' },
      { main_category: 'Platform & Support', keywords: 'login, password reset', question_pattern: 'y' },
    ]);

    const persona = await selectPersonaForEmail('course-1', 'Hi, how much does the program cost?');

    expect(persona).toBe('cory');
  });

  it('happy path: email text matching a support keyword routes to Cora', async () => {
    mockListEntries.mockResolvedValue([
      { main_category: 'Pricing & Enrollment', keywords: 'price, cost, how much', question_pattern: 'x' },
      { main_category: 'Platform & Support', keywords: 'login, password reset', question_pattern: 'y' },
    ]);

    const persona = await selectPersonaForEmail('course-1', "I can't log in, password reset isn't working");

    expect(persona).toBe('cora');
  });

  it('no keyword match at all -> defaults to Cora', async () => {
    mockListEntries.mockResolvedValue([
      { main_category: 'Pricing & Enrollment', keywords: 'price, cost, how much', question_pattern: 'x' },
    ]);

    const persona = await selectPersonaForEmail('course-1', 'Completely unrelated message about the weather');

    expect(persona).toBe('cora');
  });

  it('ignores very short keyword fragments (length <= 2) to avoid over-broad matching', async () => {
    mockListEntries.mockResolvedValue([
      { main_category: 'Program Basics', keywords: 'ai, is', question_pattern: 'x' },
    ]);

    // Contains "is" and could contain "ai" as a substring of another word, but
    // short fragments must not cause a false-positive match.
    const persona = await selectPersonaForEmail('course-1', 'This is a message about billing status.');

    expect(persona).toBe('cora');
  });
});

describe('buildPersonaSystemPromptFromDB', () => {
  it("scopes Cory's prompt to admissions-category entries only", async () => {
    mockGetActiveCohort.mockResolvedValue(null);
    mockListEntries.mockResolvedValue([
      { main_category: 'Pricing & Enrollment', question_pattern: 'How much?', answer_template: 'It costs $199/mo.' },
      { main_category: 'Billing & Account', question_pattern: 'Refund?', answer_template: 'Contact billing.' },
    ]);

    const prompt = await buildPersonaSystemPromptFromDB('course-1', 'cory');

    expect(prompt).toContain('How much?');
    expect(prompt).not.toContain('Refund?');
    expect(prompt).toContain(`Sign every reply as "${PERSONA_PROFILES.cory.signOff}"`);
  });

  it("scopes Cora's prompt to non-admissions-category entries only", async () => {
    mockGetActiveCohort.mockResolvedValue(null);
    mockListEntries.mockResolvedValue([
      { main_category: 'Pricing & Enrollment', question_pattern: 'How much?', answer_template: 'It costs $199/mo.' },
      { main_category: 'Billing & Account', question_pattern: 'Refund?', answer_template: 'Contact billing.' },
    ]);

    const prompt = await buildPersonaSystemPromptFromDB('course-1', 'cora');

    expect(prompt).toContain('Refund?');
    expect(prompt).not.toContain('How much?');
    expect(prompt).toContain(`Sign every reply as "${PERSONA_PROFILES.cora.signOff}"`);
  });

  it('degrades gracefully to a placeholder when no entries match the persona', async () => {
    mockGetActiveCohort.mockResolvedValue(null);
    mockListEntries.mockResolvedValue([]);

    const prompt = await buildPersonaSystemPromptFromDB('course-1', 'cory');

    expect(prompt).toContain('(no knowledge base entries configured for this persona yet)');
  });
});
