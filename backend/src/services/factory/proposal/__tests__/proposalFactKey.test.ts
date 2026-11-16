import { cleanFactKey } from '../proposalFactKey';

describe('cleanFactKey', () => {
  it('humanizes a typed need key', () => {
    expect(cleanFactKey('fact:project_name_1')).toBe('Project Name 1');
    expect(cleanFactKey('fact:uei')).toBe('Uei');
    expect(cleanFactKey('fact:what_is_the_due_date')).toBe('What Is The Due Date');
  });
  it('falls back to the ask for an empty or bare key', () => {
    expect(cleanFactKey('', 'Who signs the offer?')).toBe('Who signs the offer?');
    expect(cleanFactKey('fact:', 'Company address')).toBe('Company address');
    expect(cleanFactKey('fact', 'Company address')).toBe('Company address');
  });
  it('never returns empty', () => {
    expect(cleanFactKey('')).toBe('Company fact');
  });
});
