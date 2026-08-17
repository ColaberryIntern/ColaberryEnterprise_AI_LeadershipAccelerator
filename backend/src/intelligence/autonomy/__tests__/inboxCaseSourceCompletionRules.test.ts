import fs from 'fs';
import path from 'path';
import { classifyBasecampTodoCompletion } from '../inboxCaseSourceCompletionRules';

describe('classifyBasecampTodoCompletion', () => {
  it("maps a 'completed' live Basecamp to-do to disposition RESOLVED", () => {
    const result = classifyBasecampTodoCompletion('completed');
    expect(result.outcome).toBe('completed_at_source');
    expect(result.disposition).toBe('RESOLVED');
    expect(result.reason).toMatch(/completed/i);
  });

  it("maps a 'trashed' live Basecamp to-do to disposition NO_ACTION", () => {
    const result = classifyBasecampTodoCompletion('trashed');
    expect(result.outcome).toBe('trashed_at_source');
    expect(result.disposition).toBe('NO_ACTION');
  });

  it("an 'active' live Basecamp to-do produces no signal — disposition null, item left untouched", () => {
    const result = classifyBasecampTodoCompletion('active');
    expect(result.outcome).toBe('still_active');
    expect(result.disposition).toBeNull();
  });

  it('an unrecognized status string produces no signal rather than a guess', () => {
    const result = classifyBasecampTodoCompletion('some_future_status_this_module_has_never_seen');
    expect(result.outcome).toBe('no_live_signal');
    expect(result.disposition).toBeNull();
  });

  it('null (no live mirror row found) produces no signal, never throws', () => {
    expect(() => classifyBasecampTodoCompletion(null)).not.toThrow();
    const result = classifyBasecampTodoCompletion(null);
    expect(result.outcome).toBe('no_live_signal');
    expect(result.disposition).toBeNull();
  });

  it('undefined produces no signal, never throws (same as null)', () => {
    const result = classifyBasecampTodoCompletion(undefined);
    expect(result.outcome).toBe('no_live_signal');
    expect(result.disposition).toBeNull();
  });

  it('is a total function: every branch returns a reason string, never empty', () => {
    for (const input of ['completed', 'trashed', 'active', 'weird', null, undefined] as const) {
      const result = classifyBasecampTodoCompletion(input);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('NO time-based fallback closure — regression guard', () => {
  it("this file's own source contains none of the tokens a time-based close gate would use", () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', 'inboxCaseSourceCompletionRules.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/getTime\(\)/);
    expect(source).not.toMatch(/daysSince/i);
    expect(source).not.toMatch(/ageInDays/i);
    expect(source).not.toMatch(/created_at\s*[<>]/);
    expect(source).not.toMatch(/createdAt\s*[<>]/);
    expect(source).not.toMatch(/setTimeout/);
  });
});
