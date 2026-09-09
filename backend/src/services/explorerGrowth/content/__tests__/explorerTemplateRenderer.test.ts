import {
  renderExplorerTemplate,
  explorerTemplateTokens,
  UnresolvedTokenError,
} from '../explorerTemplateRenderer';

/**
 * Plan §11.2 / §18, EPIC 5: "throws on unresolved token, never leaks".
 *
 * The property under test is a REFUSAL, so most of this file is about what the
 * renderer declines to do. The existing outbound paths in this repo pass unknown
 * tokens through verbatim, which is how a learner ends up reading
 * "Hi {{first_name}}" — every test here exists to keep that outcome impossible.
 */

const CTX = {
  learner: { first_name: 'Dara', completed_lessons: 12, is_active: true, streak: null },
  cohort: { name: 'November 2026' },
};

describe('the happy path', () => {
  it('substitutes a token from a dotted path', () => {
    expect(renderExplorerTemplate('Hi {{learner.first_name}},', CTX)).toBe('Hi Dara,');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(renderExplorerTemplate('Hi {{  learner.first_name  }}', CTX)).toBe('Hi Dara');
  });

  it('renders numbers and booleans, not just strings', () => {
    expect(renderExplorerTemplate('{{learner.completed_lessons}}/{{learner.is_active}}', CTX)).toBe(
      '12/true',
    );
  });

  it('substitutes every occurrence of a repeated token', () => {
    expect(renderExplorerTemplate('{{cohort.name}} — {{cohort.name}}', CTX)).toBe(
      'November 2026 — November 2026',
    );
  });

  it('handles adjacent tokens with nothing between them', () => {
    expect(renderExplorerTemplate('{{learner.first_name}}{{cohort.name}}', CTX)).toBe(
      'DaraNovember 2026',
    );
  });

  it('is idempotent for fixed inputs', () => {
    const once = renderExplorerTemplate('Hi {{learner.first_name}}', CTX);
    const twice = renderExplorerTemplate('Hi {{learner.first_name}}', CTX);
    expect(once).toBe(twice);
  });
});

describe('it refuses to leak an unresolved token', () => {
  it('throws when the leaf is missing', () => {
    expect(() => renderExplorerTemplate('Hi {{learner.nickname}}', CTX)).toThrow(
      UnresolvedTokenError,
    );
  });

  it('throws when an intermediate branch is missing', () => {
    expect(() => renderExplorerTemplate('{{mentor.first_name}}', CTX)).toThrow(UnresolvedTokenError);
  });

  it('throws rather than rendering the word "null"', () => {
    // The failure this prevents is a real sentence: "your null day streak".
    expect(() => renderExplorerTemplate('{{learner.streak}} day streak', CTX)).toThrow(
      /streak \(null\)/,
    );
  });

  it('throws rather than rendering an object as [object Object]', () => {
    expect(() => renderExplorerTemplate('{{learner}}', CTX)).toThrow(/not_primitive/);
  });

  it('reports EVERY unresolved token, not just the first', () => {
    try {
      renderExplorerTemplate('{{a.b}} {{c.d}} {{e.f}}', CTX);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(UnresolvedTokenError);
      // One round of fixes, not three.
      expect((err as UnresolvedTokenError).tokens.map((t) => t.path)).toEqual(['a.b', 'c.d', 'e.f']);
    }
  });

  it('reports a repeated broken token once', () => {
    try {
      renderExplorerTemplate('{{a.b}} {{a.b}} {{a.b}}', CTX);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as UnresolvedTokenError).tokens).toHaveLength(1);
    }
  });

  it('carries a stable error_class for structured logs', () => {
    try {
      renderExplorerTemplate('{{a.b}}', CTX);
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as UnresolvedTokenError).error_class).toBe('UnresolvedTokenError');
    }
  });
});

describe('it is not an expression evaluator, and cannot become one', () => {
  it('does not resolve inherited properties', () => {
    // `{{constructor.name}}` resolving would render engine internals into copy.
    expect(() => renderExplorerTemplate('{{constructor.name}}', CTX)).toThrow(UnresolvedTokenError);
  });

  it('does not resolve __proto__', () => {
    expect(() => renderExplorerTemplate('{{__proto__.polluted}}', CTX)).toThrow(
      UnresolvedTokenError,
    );
  });

  it('leaves non-token braces alone', () => {
    // Not a token by the charset, so not our business — and NOT an error either,
    // or every template containing a brace would fail to send.
    expect(renderExplorerTemplate('cost is {{ 1 + 1 }} dollars', CTX)).toBe(
      'cost is {{ 1 + 1 }} dollars',
    );
  });
});

describe('a substituted value is never re-scanned', () => {
  it('does not resolve a token that arrives inside learner-controlled data', () => {
    // Single-pass is a security property: otherwise any field a learner controls
    // becomes a read primitive over the entire context.
    const hostile = { learner: { first_name: '{{secret.key}}' }, secret: { key: 'sk-live-123' } };

    const out = renderExplorerTemplate('Hi {{learner.first_name}}', hostile);

    expect(out).toBe('Hi {{secret.key}}');
    expect(out).not.toContain('sk-live-123');
  });
});

describe('boundaries', () => {
  it('returns an empty template unchanged', () => {
    expect(renderExplorerTemplate('', CTX)).toBe('');
  });

  it('returns a template with no tokens unchanged', () => {
    expect(renderExplorerTemplate('Nothing to do here.', CTX)).toBe('Nothing to do here.');
  });

  it('renders an empty string as an empty string, which is resolved, not missing', () => {
    expect(renderExplorerTemplate('[{{a.b}}]', { a: { b: '' } })).toBe('[]');
  });

  it('renders zero and false rather than treating them as absent', () => {
    // The classic falsy bug: a learner with 0 completed lessons is a fact, not
    // a missing value.
    expect(renderExplorerTemplate('{{a.n}}/{{a.f}}', { a: { n: 0, f: false } })).toBe('0/false');
  });
});

describe('explorerTemplateTokens', () => {
  it('lists required tokens deduped, in order of first appearance', () => {
    expect(explorerTemplateTokens('{{b.x}} {{a.y}} {{b.x}}')).toEqual(['b.x', 'a.y']);
  });

  it('returns nothing for a template with no tokens', () => {
    expect(explorerTemplateTokens('plain copy')).toEqual([]);
  });
});
