// config/database is mocked so importing the script never opens a DB connection.
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));

import { parseArgs, validateUpdate } from '../updateCourseLink';

describe('parseArgs', () => {
  it('parses --week, --url, --status, --title', () => {
    const u = parseArgs(['--week', '7', '--url', 'https://anthropic.skilljar.com/introduction-to-subagents', '--status', 'confirmed', '--title', 'Introduction to Subagents']);
    expect(u.module_number).toBe(7);
    expect(u.course_url).toBe('https://anthropic.skilljar.com/introduction-to-subagents');
    expect(u.link_status).toBe('confirmed');
    expect(u.course_title).toBe('Introduction to Subagents');
  });

  it('leaves optional fields undefined when not passed', () => {
    const u = parseArgs(['--week', '6', '--status', 'confirmed']);
    expect(u.module_number).toBe(6);
    expect(u.course_url).toBeUndefined();
    expect(u.course_title).toBeUndefined();
  });

  it('yields NaN week when --week is absent (caught by validation)', () => {
    const u = parseArgs(['--status', 'confirmed']);
    expect(Number.isNaN(u.module_number)).toBe(true);
  });
});

describe('validateUpdate', () => {
  it('accepts a valid status-only update', () => {
    expect(() => validateUpdate({ module_number: 7, link_status: 'confirmed' })).not.toThrow();
  });

  it('accepts a valid url + status update', () => {
    expect(() => validateUpdate({ module_number: 1, course_url: 'https://anthropic.skilljar.com/claude-code-101', link_status: 'confirmed' })).not.toThrow();
  });

  it('rejects a week outside 1-12 (boundary)', () => {
    expect(() => validateUpdate({ module_number: 0, link_status: 'confirmed' })).toThrow(/1-12/);
    expect(() => validateUpdate({ module_number: 13, link_status: 'confirmed' })).toThrow(/1-12/);
    expect(() => validateUpdate({ module_number: NaN, link_status: 'confirmed' })).toThrow(/1-12/);
  });

  it('rejects when no field to update is provided (failure path)', () => {
    expect(() => validateUpdate({ module_number: 7 })).toThrow(/at least one/);
  });

  it('rejects a non-https URL (failure path)', () => {
    expect(() => validateUpdate({ module_number: 7, course_url: 'http://insecure.example' })).toThrow(/https/);
  });

  it('rejects an unknown status (failure path)', () => {
    expect(() => validateUpdate({ module_number: 7, link_status: 'live' as never })).toThrow(/status/);
  });
});
