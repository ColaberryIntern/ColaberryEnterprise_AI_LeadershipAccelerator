// Tests for the note a READY student actually receives.
//
// This is the only file in the feature whose output a customer reads, so the
// assertions are about the words, not the plumbing: the style rules the program
// enforces on every outbound send, and the two fields that come from free-text
// intake and are therefore reliably junk in production.

const { validateBeforeSend } = require('../mandrillPreflight');
const {
  renderStudentBuildReadyEmail, firstName, projectPhrase, SUBJECT, PROJECTS_URL,
} = require('../renderStudentBuildReadyEmail');

const ROW = Object.freeze({
  email: 'student@example.com',
  fullName: 'Hellen Muhonja',
  projectName: 'AI Membership (Open House)',
  taskCount: 19,
  datedTaskCount: 19,
});

const r = (over = {}) => renderStudentBuildReadyEmail({ ...ROW, ...over });

describe('outbound style rules', () => {
  test('passes the Mandrill preflight', () => {
    const m = r();
    expect(() => validateBeforeSend(m.html, m.text)).not.toThrow();
  });

  test('contains no em-dash or en-dash in either body', () => {
    const m = r();
    expect(m.text).not.toMatch(/[–—]/);
    expect(m.html).not.toMatch(/[–—]/);
  });

  test('carries the branded signature in both bodies, exactly once', () => {
    const m = r();
    expect(m.text).toContain('200 Chisholm Place, Suite 200');
    expect(m.html).toContain('200 Chisholm Place, Suite 200');
    expect((m.text.match(/Ali Muwwakkil/g) || []).length).toBe(1);
    expect((m.html.match(/Ali Muwwakkil/g) || []).length).toBe(1);
  });

  test('does not sign off with a bare "Ali" on top of the signature', () => {
    expect(r().text).not.toMatch(/\b(best|thanks|cheers|regards),?\s*\n+\s*Ali\b/i);
  });

  test('stays short: the body is a handful of lines, not a newsletter', () => {
    const prose = r().text.split('Ali Muwwakkil')[0];
    expect(prose.length).toBeLessThan(800);
  });
});

describe('the one instruction', () => {
  test('names STORY-000 and the Command Center', () => {
    const m = r();
    expect(m.text).toContain('STORY-000');
    expect(m.text).toContain('Build your Command Center');
    expect(m.html).toContain('STORY-000');
  });

  test('links to Projects in both bodies', () => {
    const m = r();
    expect(m.text).toContain(PROJECTS_URL);
    expect(m.html).toContain(`href="${PROJECTS_URL}"`);
    expect(PROJECTS_URL).toBe('https://enterprise.colaberry.ai/portal/projects');
  });

  test('the subject says what happened, not what we want', () => {
    expect(r().subject).toBe(SUBJECT);
    expect(SUBJECT).toBe('Your build project is set up');
  });
});

describe('project names, which are free text and often junk', () => {
  test('a real name is used', () => {
    expect(r().text).toContain('Your project, AI Membership (Open House), is set up');
  });

  test.each([
    ['N/A', 'the literal production value'],
    ['n/a', 'lowercase'],
    ['', 'empty'],
    ['   ', 'whitespace'],
    [null, 'null'],
    [undefined, 'missing'],
    ['-', 'a dash'],
    ['TBD', 'a placeholder'],
    ['untitled', 'a default'],
  ])('%s (%s) falls back to a neutral opener', (projectName) => {
    const m = r({ projectName });
    expect(m.text).toContain('Your build project is set up in the portal.');
    expect(m.text).not.toMatch(/Your project, .*, is set up/);
    expect(projectPhrase(projectName)).toBeNull();
  });

  test('an HTML-bearing project name cannot inject markup', () => {
    const m = r({ projectName: '<script>alert(1)</script>' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
});

describe('names, which are also free text', () => {
  test('the first name is used', () => {
    expect(r().text.startsWith('Hellen,')).toBe(true);
  });

  test.each([
    ['Emmanuel Sane', 'Emmanuel'],
    ['Firas', 'Firas'],
    ["O'Brien Smith", "O'Brien"],
    ['  Ali   Muwwakkil ', 'Ali'],
  ])('%s greets as %s', (fullName, expected) => {
    expect(firstName(fullName, 'x@y.com')).toBe(expected);
  });

  test.each([
    ['', 'student'],
    [null, 'student'],
    ['12345', 'student'],
    ['(unknown)', 'student'],
  ])('an unusable name (%s) falls back to the address local part', (fullName) => {
    expect(firstName(fullName, 'student@example.com')).toBe('student');
  });

  test('with neither a name nor an address it still greets somebody', () => {
    expect(firstName(null, null)).toBe('there');
    expect(r({ fullName: null, email: null }).text.startsWith('there,')).toBe(true);
  });
});

describe('the task count is a real number a student will check', () => {
  test('plural for many', () => {
    expect(r({ taskCount: 19 }).text).toContain('19 tasks on it');
  });

  test('singular for one, because "1 tasks" is the thing they would notice', () => {
    expect(r({ taskCount: 1 }).text).toContain('1 task on it');
    expect(r({ taskCount: 1 }).text).not.toContain('1 tasks');
  });

  test('a missing count renders as 0 rather than undefined', () => {
    expect(r({ taskCount: undefined }).text).toContain('0 tasks on it');
    expect(r({ taskCount: undefined }).text).not.toContain('undefined');
  });
});

test('an entirely empty row still renders a sendable message', () => {
  const m = renderStudentBuildReadyEmail({});
  expect(() => validateBeforeSend(m.html, m.text)).not.toThrow();
  expect(m.text).toContain('STORY-000');
  expect(m.text).not.toContain('undefined');
  expect(m.html).not.toContain('undefined');
});
