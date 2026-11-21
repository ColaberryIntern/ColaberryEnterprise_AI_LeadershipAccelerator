import { MAX_FILE_BYTES, compareTime, fileProblem, fileSize, laterBounds, minutesLabel } from '../intakeModel';

describe('compareTime', () => {
  it('a discovery call is 20-30 minutes per person; the AI interview is 10 with one', () => {
    expect(compareTime(4)).toEqual({ people: 4, humanLow: 80, humanHigh: 120, ai: 10, times: 12 });
    expect(compareTime(2).times).toBe(6);
  });
  it('clamps the people count to 2-12', () => {
    expect(compareTime(1).people).toBe(2);
    expect(compareTime(40).people).toBe(12);
    expect(compareTime(Number.NaN).people).toBe(4);
  });
  it('labels minutes, then hours past two hours', () => {
    expect(minutesLabel(80, 120)).toBe('80 to 120 minutes');
    expect(minutesLabel(120, 180)).toBe('120 to 180 minutes');
    expect(minutesLabel(180, 270)).toBe('3 to 4.5 hours');
  });
});

describe('fileProblem', () => {
  it('accepts the four types up to 25 MB, five files', () => {
    expect(fileProblem({ name: 'Plan.PDF', size: 10 }, 0)).toBeNull();
    expect(fileProblem({ name: 'deck.pptx', size: MAX_FILE_BYTES }, 4)).toBeNull();
  });
  it('refuses other types, empty, too large, and a sixth file', () => {
    expect(fileProblem({ name: 'tool.exe', size: 10 }, 0)).toMatch(/PDF, Word, PowerPoint or text/);
    expect(fileProblem({ name: 'a.txt', size: 0 }, 0)).toMatch(/empty/);
    expect(fileProblem({ name: 'a.pdf', size: MAX_FILE_BYTES + 1 }, 0)).toMatch(/25 MB/);
    expect(fileProblem({ name: 'a.pdf', size: 1 }, 5)).toMatch(/up to 5/);
  });
  it('sizes read plainly', () => {
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});

describe('laterBounds', () => {
  it('30 minutes to 14 days out, suggesting tomorrow at 10', () => {
    const b = laterBounds(new Date(2026, 10, 21, 9, 0));
    expect(b.min).toBe('2026-11-21T09:30');
    expect(b.max).toBe('2026-12-05T09:00');
    expect(b.suggested).toBe('2026-11-22T10:00');
  });
});
