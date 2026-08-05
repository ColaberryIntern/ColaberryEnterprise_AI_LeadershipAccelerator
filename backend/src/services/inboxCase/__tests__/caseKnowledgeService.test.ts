import { randomUUID } from 'crypto';
import { makeFakeModel } from './testHelpers/fakeModel';

const fakeCoraKbEntry = makeFakeModel();
const fakeCoraKbCourse = makeFakeModel();

jest.mock('../../../models/CoraKbEntry', () => ({ __esModule: true, default: fakeCoraKbEntry }));
jest.mock('../../../models/CoraKbCourse', () => ({ __esModule: true, default: fakeCoraKbCourse }));

const mockGetActiveCohort = jest.fn(async () => null);
const mockResolveMergeTags = jest.fn((template: string) => template);
jest.mock('../../kbService', () => ({
  getActiveCohort: (...args: any[]) => mockGetActiveCohort(...args),
  resolveMergeTags: (...args: any[]) => mockResolveMergeTags(...args),
}));

const mockFindRelevantKnowledge = jest.fn(async () => [] as any[]);
jest.mock('../../admissionsKnowledgeService', () => ({
  findRelevantKnowledge: (...args: any[]) => mockFindRelevantKnowledge(...args),
}));

import {
  findRelevantCoraKbAnswers,
  findRelevantAdmissionsAnswers,
  buildKnowledgeReferenceBlock,
  learnFromAnsweredQuestion,
  INBOX_LEARNED_CATEGORY,
} from '../caseKnowledgeService';

beforeEach(() => {
  fakeCoraKbEntry.rows.clear();
  fakeCoraKbCourse.rows.clear();
  mockGetActiveCohort.mockClear();
  mockResolveMergeTags.mockClear();
  mockFindRelevantKnowledge.mockClear();
});

async function seedCoraEntry(overrides: Partial<any> = {}) {
  return fakeCoraKbEntry.create({
    course_id: null,
    main_category: 'pricing',
    question_pattern: 'What is the payment schedule for the AI course?',
    answer_template: 'Payments are due monthly on the 1st.',
    keywords: 'payment schedule pricing',
    automation_potential: 'High',
    escalation_logic: null,
    is_active: true,
    ...overrides,
  });
}

describe('findRelevantCoraKbAnswers', () => {
  it('matches on question_pattern/keyword overlap and marks a High-automation, no-escalation entry as auto-answerable', async () => {
    await seedCoraEntry();
    const matches = await findRelevantCoraKbAnswers('interested in the new AI course payment schedule questions');
    expect(matches).toHaveLength(1);
    expect(matches[0].can_auto_answer).toBe(true);
    expect(matches[0].source).toBe('cora_kb');
  });

  it('marks a Low-automation-potential entry as NOT auto-answerable even if the text matches', async () => {
    await seedCoraEntry({ automation_potential: 'Low' });
    const matches = await findRelevantCoraKbAnswers('payment schedule question');
    expect(matches[0].can_auto_answer).toBe(false);
  });

  it('marks an entry with escalation_logic as NOT auto-answerable', async () => {
    await seedCoraEntry({ escalation_logic: 'Route to finance if amount exceeds $5000' });
    const matches = await findRelevantCoraKbAnswers('payment schedule question');
    expect(matches[0].can_auto_answer).toBe(false);
  });

  it('includes inactive entries tagged as Inbox-Intel-learned, but not other inactive entries', async () => {
    await seedCoraEntry({ is_active: false, main_category: INBOX_LEARNED_CATEGORY, question_pattern: 'learned payment question' });
    await seedCoraEntry({ is_active: false, main_category: 'pricing', question_pattern: 'unrelated inactive payment entry' });
    const matches = await findRelevantCoraKbAnswers('payment question');
    expect(matches.some((m) => m.question === 'learned payment question')).toBe(true);
    expect(matches.some((m) => m.question === 'unrelated inactive payment entry')).toBe(false);
  });

  it('returns empty for a query with no meaningful tokens', async () => {
    await seedCoraEntry();
    expect(await findRelevantCoraKbAnswers('a an the')).toEqual([]);
  });

  it('returns empty when nothing matches', async () => {
    await seedCoraEntry();
    expect(await findRelevantCoraKbAnswers('completely unrelated topic about weather')).toEqual([]);
  });
});

describe('findRelevantAdmissionsAnswers', () => {
  it('wraps admissionsKnowledgeService results as always auto-answerable', async () => {
    mockFindRelevantKnowledge.mockResolvedValueOnce([
      { id: randomUUID(), title: 'Program Pricing', content: '$X per month.' } as any,
    ]);
    const matches = await findRelevantAdmissionsAnswers('pricing');
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe('admissions_kb');
    expect(matches[0].can_auto_answer).toBe(true);
  });
});

describe('buildKnowledgeReferenceBlock', () => {
  it('returns an empty block when nothing matches', async () => {
    const block = await buildKnowledgeReferenceBlock('nothing matches this at all');
    expect(block.text).toBe('');
    expect(block.matches).toEqual([]);
  });

  it('formats matches with auto-answerable/human-review flags inside KNOWLEDGE_BASE markers', async () => {
    await seedCoraEntry();
    const block = await buildKnowledgeReferenceBlock('payment schedule');
    expect(block.text).toContain('<<<KNOWLEDGE_BASE');
    expect(block.text).toContain('<<<END_KNOWLEDGE_BASE>>>');
    expect(block.text).toContain('auto-answerable');
    expect(block.matches.length).toBeGreaterThan(0);
  });
});

describe('learnFromAnsweredQuestion', () => {
  it('creates a new, INACTIVE CoraKbEntry from an answered question', async () => {
    const result = await learnFromAnsweredQuestion({
      caseId: randomUUID(),
      question: 'What is the refund policy for cancelled enrollments?',
      answer: 'Full refund within 14 days, per TWC CSC-017.',
      whyRequired: 'Blocks the reply to the prospect.',
      answeredBy: 'ali@colaberry.com',
    });

    expect(result.created).toBe(true);
    const row = fakeCoraKbEntry.rows.get(result.entryId!);
    expect(row.is_active).toBe(false);
    expect(row.main_category).toBe(INBOX_LEARNED_CATEGORY);
    expect(row.question_pattern).toBe('What is the refund policy for cancelled enrollments?');
  });

  it('never sets is_active true, even implicitly', async () => {
    const result = await learnFromAnsweredQuestion({
      caseId: randomUUID(),
      question: 'Some other never-before-seen question?',
      answer: 'Some answer.',
      whyRequired: '',
      answeredBy: 'ali@colaberry.com',
    });
    const row = fakeCoraKbEntry.rows.get(result.entryId!);
    expect(row.is_active).toBe(false);
  });

  it('does not create a duplicate when a near-identical question is already active', async () => {
    await seedCoraEntry({ question_pattern: 'What is the payment schedule for the AI course?', keywords: 'payment schedule ai course pricing' });

    const result = await learnFromAnsweredQuestion({
      caseId: randomUUID(),
      question: 'What is the payment schedule for the AI course?',
      answer: 'Monthly on the 1st.',
      whyRequired: '',
      answeredBy: 'ali@colaberry.com',
    });

    expect(result.created).toBe(false);
    expect(result.reason).toMatch(/already exists/);
  });

  it('does not create a duplicate against an already-learned (inactive) entry', async () => {
    await seedCoraEntry({
      is_active: false,
      main_category: INBOX_LEARNED_CATEGORY,
      question_pattern: 'What is the payment schedule for the AI course?',
      keywords: 'payment schedule ai course pricing',
    });

    const result = await learnFromAnsweredQuestion({
      caseId: randomUUID(),
      question: 'What is the payment schedule for the AI course?',
      answer: 'Monthly on the 1st.',
      whyRequired: '',
      answeredBy: 'ali@colaberry.com',
    });

    expect(result.created).toBe(false);
  });

  it('rejects an empty question or answer without writing anything', async () => {
    const result = await learnFromAnsweredQuestion({
      caseId: randomUUID(),
      question: '   ',
      answer: 'irrelevant',
      whyRequired: '',
      answeredBy: 'ali@colaberry.com',
    });
    expect(result.created).toBe(false);
    expect(fakeCoraKbEntry.rows.size).toBe(0);
  });

  it('creates distinct entries for genuinely different questions', async () => {
    await learnFromAnsweredQuestion({ caseId: randomUUID(), question: 'What is the refund policy?', answer: 'A', whyRequired: '', answeredBy: 'ali@colaberry.com' });
    const second = await learnFromAnsweredQuestion({ caseId: randomUUID(), question: 'Who owns the AI Flotation relationship?', answer: 'B', whyRequired: '', answeredBy: 'ali@colaberry.com' });
    expect(second.created).toBe(true);
    expect(fakeCoraKbEntry.rows.size).toBe(2);
  });
});
