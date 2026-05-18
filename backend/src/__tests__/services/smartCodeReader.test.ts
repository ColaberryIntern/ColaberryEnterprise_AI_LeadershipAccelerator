// Mock githubService.readFileFromRepo before importing smartCodeReader,
// so the import-time dependency graph picks up the mock.
jest.mock('../../services/githubService', () => ({
  readFileFromRepo: jest.fn(),
}));

// Mock VerificationLog model so hasDeepVerifyBudget can run without a DB.
jest.mock('../../models/VerificationLog', () => ({
  __esModule: true,
  default: { count: jest.fn() },
}));

import { readFileFromRepo } from '../../services/githubService';
import VerificationLog from '../../models/VerificationLog';
import {
  readCandidateFiles,
  formatExcerptsForPrompt,
  hasDeepVerifyBudget,
} from '../../services/verification/smartCodeReader';

const readMock = readFileFromRepo as jest.MockedFunction<typeof readFileFromRepo>;
const countMock = (VerificationLog as any).count as jest.MockedFunction<any>;

describe('smartCodeReader.readCandidateFiles', () => {
  beforeEach(() => {
    readMock.mockReset();
  });

  test('returns empty when given empty paths', async () => {
    const out = await readCandidateFiles('enr-1', []);
    expect(out).toEqual([]);
    expect(readMock).not.toHaveBeenCalled();
  });

  test('respects maxFiles cap', async () => {
    readMock.mockResolvedValue('line\n'.repeat(5));
    await readCandidateFiles('enr-1', ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'], { maxFiles: 2 });
    expect(readMock).toHaveBeenCalledTimes(2);
  });

  test('truncates files exceeding maxLinesPerFile', async () => {
    const longFile = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`).join('\n');
    readMock.mockResolvedValue(longFile);

    const out = await readCandidateFiles('enr-1', ['a.ts'], { maxLinesPerFile: 50 });
    expect(out).toHaveLength(1);
    expect(out[0].truncated).toBe(true);
    expect(out[0].total_lines).toBe(500);
    expect(out[0].content.split('\n').length).toBeLessThanOrEqual(50);
  });

  test('stops reading once maxTotalChars is hit', async () => {
    const file = 'x'.repeat(2000);
    readMock.mockResolvedValue(file);

    const out = await readCandidateFiles('enr-1', ['a.ts', 'b.ts', 'c.ts'], {
      maxFiles: 3,
      maxLinesPerFile: 200,
      maxTotalChars: 3000,
    });
    const totalChars = out.reduce((sum, e) => sum + e.char_count, 0);
    expect(totalChars).toBeLessThanOrEqual(3000);
  });

  test('skips files where GitHub fetch returned null', async () => {
    readMock.mockResolvedValueOnce('existing file content');
    readMock.mockResolvedValueOnce(null); // missing
    readMock.mockResolvedValueOnce('another existing file');

    const out = await readCandidateFiles('enr-1', ['a.ts', 'b.ts', 'c.ts']);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.path)).toEqual(['a.ts', 'c.ts']);
  });
});

describe('smartCodeReader.formatExcerptsForPrompt', () => {
  test('empty array returns empty string', () => {
    expect(formatExcerptsForPrompt([])).toBe('');
  });

  test('formats with truncation indicator when truncated', () => {
    const out = formatExcerptsForPrompt([
      { path: 'src/x.ts', content: 'foo\nbar', total_lines: 100, truncated: true, char_count: 7 },
    ]);
    expect(out).toContain('### src/x.ts (first 2 of 100 lines)');
    expect(out).toContain('foo\nbar');
  });

  test('formats without truncation indicator when full file fits', () => {
    const out = formatExcerptsForPrompt([
      { path: 'src/x.ts', content: 'one\ntwo', total_lines: 2, truncated: false, char_count: 7 },
    ]);
    expect(out).toContain('### src/x.ts (2 lines)');
  });
});

describe('smartCodeReader.hasDeepVerifyBudget', () => {
  beforeEach(() => {
    countMock.mockReset();
  });

  test('allows when used count is below budget', async () => {
    countMock.mockResolvedValue(10);
    const out = await hasDeepVerifyBudget('proj-1', 50);
    expect(out).toEqual({ allowed: true, used: 10, budget: 50 });
  });

  test('blocks when used count reaches budget', async () => {
    countMock.mockResolvedValue(50);
    const out = await hasDeepVerifyBudget('proj-1', 50);
    expect(out.allowed).toBe(false);
  });

  test('uses default budget when none provided', async () => {
    countMock.mockResolvedValue(149);
    const out = await hasDeepVerifyBudget('proj-1');
    expect(out.budget).toBe(150);
    expect(out.allowed).toBe(true);
  });
});
