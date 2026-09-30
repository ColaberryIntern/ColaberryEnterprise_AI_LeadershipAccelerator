/**
 * cardContentService — the STRUCTURAL half of the completeness gate.
 *
 * The stop-reason gate is necessary and not sufficient. Regenerating the three
 * truncated cards on 2026-08-19 showed the model derailing mid-sentence and then
 * SOMETIMES burning the token ceiling (`finish_reason: "length"`) and SOMETIMES
 * closing the JSON tidily and reporting `finish_reason: "stop"` with the prose
 * plainly unfinished — one repair came back clean-stop at 265 tokens still ending
 * at "Go to the ". The three cards that reached students all had PARSEABLE
 * content, so they were the clean-stop variant.
 *
 * The invariant pinned here, and the single most important one in this PR:
 *   a response with finish_reason 'stop' whose content is structurally
 *   unfinished must be REJECTED, and nothing may be persisted.
 */

// ---------------------------------------------------------------------------
// Mocks — generateCardContent's whole dependency graph. The completeness gate
// itself (cardCompletenessGate) is deliberately NOT mocked: it is under test.
// ---------------------------------------------------------------------------
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));

jest.mock('../../../models/CurriculumTypeDefinition', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock('../blueprintContext', () => ({
  getBlueprintContext: jest.fn(),
}));

jest.mock('../sectionCurriculumContext', () => ({
  getSectionCurriculumContext: jest.fn(),
  // A real Set — the service calls .has() on it. 'setup_lab' is deliberately not
  // a member, so the roster branch stays out of these tests.
  SECTION_ROSTER_TYPES: new Set(['prompt_lab', 'announcement']),
}));

jest.mock('../../components/promptTesterService', () => ({
  resolvePrompt: jest.fn((tpl: string) => tpl),
}));

jest.mock('../../components/costEstimationService', () => ({
  DEFAULT_MODEL: 'gpt-4o-mini',
  MODEL_PRICING: { 'gpt-4o-mini': { input_per_1m: 0.15, output_per_1m: 0.6 } },
}));

jest.mock('../../openaiInstrumented', () => ({
  getInstrumentedOpenAI: jest.fn(),
}));

import { generateCardContent } from '../cardContentService';
import TimelineCard from '../../../models/TimelineCard';
import CurriculumTypeDefinition from '../../../models/CurriculumTypeDefinition';
import { getBlueprintContext } from '../blueprintContext';
import { getInstrumentedOpenAI } from '../../openaiInstrumented';

const mockFindByPk = (TimelineCard as unknown as { findByPk: jest.Mock }).findByPk;
const mockFindOne = (CurriculumTypeDefinition as unknown as { findOne: jest.Mock }).findOne;
const mockBlueprint = getBlueprintContext as jest.Mock;
const mockGetClient = getInstrumentedOpenAI as jest.Mock;

let mockCreate: jest.Mock;
let mockUpdate: jest.Mock;

/** A complete, well-formed card payload — what a healthy generation returns. */
const GOOD_CARD = {
  title: 'Setup Lab: Your Claude Code Workspace',
  summary: 'Get the workspace you will use for the rest of the cohort.',
  body_html: '<h4>Install</h4><ol><li>Create the folder you will use all week</li><li>Open a terminal in that folder and run the installer</li></ol>',
  questions: ['What did the installer put on your PATH?'],
  reflection: 'What was the first thing that did not work?',
};

/**
 * The exact failure that reached students: the model stops cleanly, the JSON
 * parses, and the prose dies mid-sentence inside an unclosed list.
 */
const CLEAN_STOP_UNFINISHED_CARD = {
  title: 'Setup Lab: Your Claude Code Workspace',
  summary: 'Get the workspace you will use for the rest of the cohort.',
  body_html: '<h4>Install</h4><ol><li>Create the folder you will use all week</li><li>Go to the ',
  questions: [],
  reflection: '',
};

/** An OpenAI chat-completion envelope with a chosen stop reason. */
function chatResponse(payload: unknown, finishReason: string) {
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    model: 'gpt-4o-mini',
    choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(payload) }, finish_reason: finishReason }],
    usage: { prompt_tokens: 500, completion_tokens: 265, total_tokens: 765 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  mockUpdate = jest.fn().mockResolvedValue(undefined);
  mockFindByPk.mockResolvedValue({
    id: 'card-1', type: 'setup_lab', title: 'Setup Lab', description: 'Install the tools',
    week: 8, program_id: 'prog-1', metadata: {}, update: mockUpdate,
  });
  mockFindOne.mockResolvedValue({ slug: 'setup_lab', student_label: 'Setup Lab', generation_prompt: 'Write the setup lab.' });
  mockBlueprint.mockResolvedValue(null);

  mockCreate = jest.fn();
  mockGetClient.mockReturnValue({ chat: { completions: { create: mockCreate } } });
});

afterEach(() => jest.restoreAllMocks());

describe('generateCardContent — structural completeness gate', () => {
  it('THE INVARIANT: a finish_reason "stop" response with structurally unfinished content is REJECTED and persists NOTHING', async () => {
    mockCreate.mockResolvedValue(chatResponse(CLEAN_STOP_UNFINISHED_CARD, 'stop'));

    await expect(generateCardContent('card-1')).rejects.toMatchObject({
      error_class: 'IncompleteGeneration',
      status: 502,
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('names WHICH structural rules failed, so the log can be triaged', async () => {
    mockCreate.mockResolvedValue(chatResponse(CLEAN_STOP_UNFINISHED_CARD, 'stop'));

    const err = await generateCardContent('card-1').catch((e) => e);
    expect(err.failures).toEqual(expect.arrayContaining(['unclosed_tag:ol', 'ends_mid_markup', 'dangling_prose:the']));
  });

  it('FAILURE PATH: an empty content object (the swallowed JSON.parse) is rejected, not saved with a fresh timestamp', async () => {
    // Unparseable JSON: the service's catch turns this into {}. Before the gate,
    // that empty object was persisted with a fresh content_at, pinning a BLANK
    // card in the timeline for the full 30-day TTL.
    mockCreate.mockResolvedValue({
      choices: [{ index: 0, message: { role: 'assistant', content: '{"title":"Half a card","body_html":"<p>cut off' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10 },
    });

    await expect(generateCardContent('card-1')).rejects.toMatchObject({ error_class: 'IncompleteGeneration' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('FAILURE PATH: the whitespace derail is rejected even on a clean stop', async () => {
    const derailed = { ...GOOD_CARD, body_html: `<p>Only 24.7% of domains scored${' '.repeat(3000)}</p>` };
    mockCreate.mockResolvedValue(chatResponse(derailed, 'stop'));

    const err = await generateCardContent('card-1').catch((e) => e);
    expect(err.failures).toContain('whitespace_derail');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('HAPPY PATH: a complete card on a clean stop is persisted exactly once', async () => {
    mockCreate.mockResolvedValue(chatResponse(GOOD_CARD, 'stop'));

    const out = await generateCardContent('card-1');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(out.content.title).toBe(GOOD_CARD.title);
    const saved = mockUpdate.mock.calls[0][0].metadata;
    expect(saved.content.body_html).toContain('</ol>');
    expect(typeof saved.content_at).toBe('string');
  });

  it('the gate does not spend a retry: exactly one model call, complete or not', async () => {
    mockCreate.mockResolvedValue(chatResponse(CLEAN_STOP_UNFINISHED_CARD, 'stop'));
    await generateCardContent('card-1').catch(() => undefined);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('BOUNDARY: an extra closing tag is a warning only — the card still saves', async () => {
    const untidy = { ...GOOD_CARD, body_html: `${GOOD_CARD.body_html}</div>` };
    mockCreate.mockResolvedValue(chatResponse(untidy, 'stop'));

    await expect(generateCardContent('card-1')).resolves.toBeDefined();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('per-type: a prompt_lab card with no <pre> prompt block is rejected', async () => {
    mockFindByPk.mockResolvedValue({
      id: 'card-2', type: 'prompt_lab', title: 'Prompt Lab', description: '',
      week: 4, program_id: 'prog-1', metadata: {}, update: mockUpdate,
    });
    mockFindOne.mockResolvedValue({ slug: 'prompt_lab', student_label: 'Prompt Lab', generation_prompt: 'Write the prompt lab.' });
    const noPre = { ...GOOD_CARD, body_html: '<h4>Constraint stacking</h4><p>Add one constraint at a time and compare what changes in the output.</p>' };
    mockCreate.mockResolvedValue(chatResponse(noPre, 'stop'));

    const err = await generateCardContent('card-2').catch((e) => e);
    expect(err.failures).toContain('missing_marker:pre');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
