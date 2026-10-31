import { isSyntheticContactEmail, syntheticEmailSql } from '../syntheticContacts';

/**
 * C96: the SQL form must give the same answer as the TS form, or a roster and a sync disagree about who is a
 * person. There is no Postgres in this suite, so the generated predicate is evaluated by a small interpreter of
 * exactly the constructs it emits (lower/trim/coalesce/split_part and LIKE with backslash escapes). If the builder
 * starts emitting anything else, the interpreter throws and this suite fails, which is the point.
 */
function likeToRegex(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (ch === '%') re += '[\\s\\S]*';
    else if (ch === '_') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

function evaluate(sql: string, email: string | null): boolean {
  const address = `lower(trim(coalesce(e.email, '')))`;
  const local = `split_part(${address}, '@', 1)`;
  const body = sql.replace(/^\(|\)$/g, '');
  const value = (email ?? '').trim().toLowerCase();
  return body.split(' OR ').some((clause) => {
    const m = clause.match(/^(.*) LIKE '((?:[^']|'')*)'$/);
    if (!m) throw new Error(`unexpected clause: ${clause}`);
    const subject = m[1] === address ? value : m[1] === local ? value.split('@')[0] : null;
    if (subject === null) throw new Error(`unexpected subject: ${m[1]}`);
    return likeToRegex(m[2].replace(/''/g, "'")).test(subject);
  });
}

const CASES: Array<string | null> = [
  'e2e-points-1792589402578@colaberry-test.local',
  '  E2E-Points-1@Colaberry-Test.Local ',
  'anybody@colaberry-test.local',
  'e2e-checkout@gmail.com',
  'e2e_checkout@gmail.com',
  'test-fixture-9@example.com',
  // Real people, including ones a sloppy LIKE would catch: `_` is a wildcard, so an unescaped `e2e_%` matches e2eX.
  'e2ex@gmail.com',
  'maria@example.com',
  'testaccount@gmail.com',
  'someone@colaberry-test.local.example.com',
  'colaberry-test.local@gmail.com',
  '',
  null,
];

describe('syntheticEmailSql agrees with isSyntheticContactEmail', () => {
  const sql = syntheticEmailSql('e.email');
  it.each(CASES.map((c) => [c]))('%p', (email) => {
    expect(evaluate(sql, email)).toBe(isSyntheticContactEmail(email));
  });

  it('catches the smoke test and spares a real person (the two that matter most)', () => {
    expect(evaluate(sql, 'e2e-points-1@colaberry-test.local')).toBe(true);
    expect(evaluate(sql, 'maria@example.com')).toBe(false);
  });
});

describe('syntheticEmailSql is safe to interpolate', () => {
  it('a NULL email is "not synthetic", so NOT (...) keeps the row', () => {
    expect(syntheticEmailSql('e.email')).toContain("coalesce(e.email, '')");
  });

  it.each(["e.email); DROP TABLE leads; --", 'e.email OR 1=1', '1', 'a.b.c'])('refuses %p as a column', (bad) => {
    expect(() => syntheticEmailSql(bad)).toThrow(/not a column reference/);
  });

  it('accepts a bare or table-qualified column', () => {
    expect(() => syntheticEmailSql('email')).not.toThrow();
    expect(() => syntheticEmailSql('l.email')).not.toThrow();
  });
});
