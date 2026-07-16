/** Pure core of the class-comments service: body validation + author display name. */
import { normalizeCommentBody, displayName } from '../cardCommentService';

jest.mock('../../../models/CardComment', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/Enrollment', () => ({ __esModule: true, default: {} }));
jest.mock('../../../config/database', () => ({ sequelize: {} }));

describe('normalizeCommentBody', () => {
  it('trims and keeps a normal comment', () => {
    expect(normalizeCommentBody('  Loved this lesson!  ')).toBe('Loved this lesson!');
  });
  it('rejects empty / non-string bodies with a 400', () => {
    for (const bad of ['', '   ', null, undefined, 42]) {
      expect(() => normalizeCommentBody(bad as any)).toThrow(/empty/i);
    }
  });
  it('rejects oversized bodies with a 400', () => {
    expect(() => normalizeCommentBody('x'.repeat(2001))).toThrow(/too long/i);
    expect(normalizeCommentBody('x'.repeat(2000))).toHaveLength(2000);
  });
});

describe('displayName', () => {
  it('formats "First L." from a full name', () => {
    expect(displayName('Aisha Rahman')).toBe('Aisha R.');
    expect(displayName('Mary Jo van der Berg')).toBe('Mary B.');
  });
  it('single names pass through; empty falls back to Student', () => {
    expect(displayName('Cher')).toBe('Cher');
    expect(displayName('')).toBe('Student');
    expect(displayName(null)).toBe('Student');
    expect(displayName('   ')).toBe('Student');
  });
});
