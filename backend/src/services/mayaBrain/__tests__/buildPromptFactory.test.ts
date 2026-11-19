/**
 * OH1i (T3): the build-prompt factory turns a viral "someone built X" into a full build brief,
 * rejects weak ones before they are stored, and only ever stores DRAFTS with a pending
 * test-build. The AI is a stub; nothing calls a model or a database.
 */
import {
  structuralCheck, runBuildPromptFactory, parseDraft, sourceLabel, factorySystemPrompt, readTopBuildSignals,
  type DraftedPrompt, type FactorySignal,
} from '../buildPromptFactory';
import { FREE_WORD_RULE } from '../../content/bannedCopyRule';

const STRONG: DraftedPrompt = {
  title: 'A private video-to-GIF converter in the browser',
  stack: ['ffmpeg.wasm', 'Vite', 'TypeScript'],
  acceptance_test: 'Run `npm run dev`, drop sample.mp4 on the page: the preview should play and the download should be an animated GIF under 10 MB.',
  prompt: [
    'You are a senior front-end engineer. Build a single-page web app with Vite and TypeScript that converts a video into an animated GIF entirely in the browser using ffmpeg.wasm, with no upload to any server.',
    '1. Plan first: list the files, the libraries and the steps, and wait for my OK before writing code.',
    '2. Build: drag-and-drop a video; trim start and end with a slider; choose width and frames per second; show a live preview; download the GIF.',
    '3. Make it solid: handle files over 200 MB with a clear message, show progress while encoding, cancel a running job, and keep the page responsive.',
    '4. Prove it: give me a 5-step manual test and the exact commands (`npm install`, `npm run dev`) to run it locally, and what each step should show.',
    'Explain each decision in one sentence as you go.',
  ].join('\n'),
};

const SIGNAL: FactorySignal & { virality: number } = {
  id: 'b0000000-0000-4000-8000-000000000001', platform: 'hackernews', source_url: 'https://example.dev/gif',
  title: 'Show HN: A video-to-GIF converter that never uploads your file', content_excerpt: 'Runs in the browser.',
  details: { points: 412 }, virality: 0.9,
};

describe('structuralCheck (the test-build gate in front of a person)', () => {
  it('passes a complete, concrete, runnable prompt', () => {
    expect(structuralCheck(STRONG)).toEqual([]);
  });
  it('rejects a weak prompt and says why', () => {
    const weak = { title: 'Make an AI app', stack: ['any'], acceptance_test: 'it works', prompt: 'Build me an AI app that does cool things with a framework of your choice.' };
    const p = structuralCheck(weak);
    expect(p).toEqual(expect.arrayContaining([
      expect.stringMatching(/too short/),
      expect.stringMatching(/role/),
      'missing section "Plan first"',
      'missing section "Prove it"',
      expect.stringMatching(/concrete stack/),
      expect.stringMatching(/not runnable/),
    ]));
  });
  it('rejects sections out of order and a plan that does not wait', () => {
    const swapped = STRONG.prompt
      .replace('1. Plan first: list the files, the libraries and the steps, and wait for my OK before writing code.', '')
      .replace('Explain each', '1. Plan first: list the files and start right away.\nExplain each');
    const p = structuralCheck({ ...STRONG, prompt: swapped });
    expect(p).toContain('section "Build" is out of order');
    expect(p).toContain('plan-first does not wait for approval before building');
  });
  it('rejects a stack the prompt never names', () => {
    expect(structuralCheck({ ...STRONG, stack: ['Svelte'] })).toContain('no concrete stack named in the prompt (e.g. a real library or framework)');
  });
  it('rejects a banned word anywhere', () => {
    const word = FREE_WORD_RULE.word;
    expect(structuralCheck({ ...STRONG, title: `A ${word} GIF converter` }).join(' ')).toMatch(/banned word/);
  });
  it('rejects a prompt too long to paste, and handles nothing at all', () => {
    expect(structuralCheck({ ...STRONG, prompt: STRONG.prompt + 'x'.repeat(7000) }).join(' ')).toMatch(/too long/);
    expect(structuralCheck(null).length).toBeGreaterThan(3);
  });
});

describe('parseDraft and sourceLabel', () => {
  it('reads fenced JSON and refuses junk', () => {
    expect(parseDraft('```json\n' + JSON.stringify(STRONG) + '\n```')?.title).toBe(STRONG.title);
    expect(parseDraft('Sure! Here is a prompt.')).toBeNull();
  });
  it('credits the source with its platform count', () => {
    expect(sourceLabel(SIGNAL)).toBe('Show HN: A video-to-GIF converter that never uploads your file (Hacker News, 412 points)');
    expect(sourceLabel({ ...SIGNAL, platform: 'github', title: 'dev/agent-kit', details: { stars: 900 } })).toBe('dev/agent-kit (GitHub, 900 stars)');
  });
  it('the instruction asks for all four sections and states the copy rule', () => {
    const s = factorySystemPrompt();
    for (const l of ['1. Plan first:', '2. Build:', '3. Make it solid:', '4. Prove it:']) expect(s).toContain(l);
    expect(s).toContain('COPY COMPLIANCE');
  });
});

describe('runBuildPromptFactory', () => {
  it('stores a passing prompt as a DRAFT with a pending test-build, credited and scored', async () => {
    const saveDraft = jest.fn(async (input: any) => ({ id: 'new-item', ...input }));
    const complete = jest.fn(async () => JSON.stringify(STRONG));
    const out = await runBuildPromptFactory({ deps: { readSignals: async () => [SIGNAL], complete, saveDraft } });
    expect(out).toEqual([expect.objectContaining({ result: 'drafted', item_id: 'new-item', title: STRONG.title })]);
    const input = saveDraft.mock.calls[0][0];
    expect(input).toMatchObject({ kind: 'build_prompt', body: STRONG.prompt, signal_id: SIGNAL.id, virality: 0.9, source_url: SIGNAL.source_url });
    expect(input.test_build_notes).toMatch(/Agent test-build NOT run yet/);
    expect(input).not.toHaveProperty('status'); // createDraft hard-codes draft + pending
    expect((complete.mock.calls[0] as any[])[1]).toContain(SIGNAL.title);
  });
  it('drops a weak prompt and never stores it', async () => {
    const saveDraft = jest.fn();
    const out = await runBuildPromptFactory({ deps: {
      readSignals: async () => [SIGNAL], saveDraft,
      complete: async () => JSON.stringify({ title: 'Cool app', prompt: 'Build a cool AI app.', stack: [], acceptance_test: '' }),
    } });
    expect(out[0].result).toBe('rejected');
    expect(out[0].problems.length).toBeGreaterThan(2);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it('dry run checks but stores nothing; a model failure is one error, not a crash', async () => {
    const saveDraft = jest.fn();
    const dry = await runBuildPromptFactory({ dryRun: true, deps: { readSignals: async () => [SIGNAL], saveDraft, complete: async () => JSON.stringify(STRONG) } });
    expect(dry[0].result).toBe('would_draft');
    const broken = await runBuildPromptFactory({ deps: {
      readSignals: async () => [SIGNAL, { ...SIGNAL, id: 'second' }], saveDraft,
      complete: jest.fn().mockRejectedValueOnce(new Error('rate limited')).mockResolvedValueOnce('not json'),
    } });
    expect(broken.map((o) => o.result)).toEqual(['error', 'rejected']);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it('a duplicate (already on the shelf) is reported, not double-stored', async () => {
    const out = await runBuildPromptFactory({ deps: { readSignals: async () => [SIGNAL], complete: async () => JSON.stringify(STRONG), saveDraft: async () => null } });
    expect(out[0].result).toBe('duplicate');
  });
});

describe('readTopBuildSignals', () => {
  it('keeps only "someone built X" signals with a real count, most viral first', async () => {
    const rows = [
      { id: '1', platform: 'devto', source_url: 'u1', title: 'Why agents matter', content_excerpt: '', details: { positive_reactions_count: 90 } },
      { id: '2', platform: 'hackernews', source_url: 'u2', title: 'Show HN: An MCP server for my calendar', content_excerpt: '', details: { points: 40 } },
      { id: '3', platform: 'github', source_url: 'u3', title: 'dev/agent-kit', content_excerpt: '', details: { stars: 800 } },
      { id: '4', platform: 'producthunt', source_url: 'u4', title: 'Launch', content_excerpt: '', details: { votes_count: 0 } },
    ];
    const top = await readTopBuildSignals({ query: (async () => rows) as any, limit: 5 });
    expect(top.map((s) => s.id)).toEqual(['3', '2']);
  });
});
