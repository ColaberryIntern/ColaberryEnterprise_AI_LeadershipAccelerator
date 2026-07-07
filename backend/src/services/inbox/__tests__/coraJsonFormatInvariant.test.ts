/**
 * Regression guard for OpenAI's json_object "must contain the word 'json'" rule.
 *
 * generateCoraReply() calls OpenAI with response_format:{ type: 'json_object' }.
 * OpenAI rejects that request with a 400 ("'messages' must contain the word
 * 'json'...") unless the literal word "json" appears somewhere in the messages.
 *
 * This has already bitten once: the DB-backed KB cutover swapped Cora's system
 * prompt for one that dropped the word "json", and every generation 400'd
 * (BC todo 10072187835 — confirmed shadow-only in prod; main's hardcoded prompt
 * still contains the word, so prod was never affected). The invariant was never
 * pinned by a test, so any prompt-source change — most importantly promoting the
 * KB cutover onto main — could silently reintroduce the bug.
 *
 * This test exercises the REAL generateCoraReply message assembly (OpenAI and
 * the cohort lookup mocked) and fails if the messages ever lose the word "json"
 * OR if response_format stops being json_object without the guard being revisited.
 */

// Capture the args generateCoraReply passes to chat.completions.create. Named
// with a `mock` prefix so jest.mock's factory is allowed to reference it.
const mockOpenAiState: { createArgs: any } = { createArgs: null };

jest.mock('openai', () => ({
  __esModule: true,
  default: class {
    chat = {
      completions: {
        create: (args: any) => {
          mockOpenAiState.createArgs = args;
          return Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({ subject: 'Re: Test', body: 'Answer.', needs_human: false }),
                },
              },
            ],
          });
        },
      },
    };
  },
}));

// Avoid a real DB round-trip for the next-cohort lookup.
jest.mock('../../cohortService', () => ({
  listOpenCohorts: jest.fn().mockResolvedValue([]),
}));

import { generateCoraReply } from '../coraAgentService';

describe('generateCoraReply — OpenAI json_object invariant', () => {
  beforeEach(() => {
    mockOpenAiState.createArgs = null;
  });

  it('requests json_object AND sends messages containing the literal word "json"', async () => {
    await generateCoraReply('I have a question about pricing.', 'Pricing question', 'Test Sender');

    expect(mockOpenAiState.createArgs).not.toBeNull();
    // The response_format that triggers OpenAI's constraint...
    expect(mockOpenAiState.createArgs.response_format).toEqual({ type: 'json_object' });
    // ...requires the literal word "json" somewhere in the messages.
    const joined = mockOpenAiState.createArgs.messages
      .map((m: { content: unknown }) => String(m.content))
      .join('\n')
      .toLowerCase();
    expect(joined).toContain('json');
  });
});
