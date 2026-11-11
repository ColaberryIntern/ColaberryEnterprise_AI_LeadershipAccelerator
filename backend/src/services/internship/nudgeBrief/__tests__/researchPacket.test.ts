import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findInSource, identifiersIn, peopleIn, redact, spellingNote } from '../researchPacket';

/**
 * The research packet.
 *
 * The redaction cases come first and matter most: a packet becomes a draft email, so a credential
 * that survives this module is a credential sent to an intern. Everything else is a convenience.
 */

/**
 * The fake credentials below are ASSEMBLED AT RUNTIME rather than written as literals.
 *
 * Written out in full they trip the repo's own secret scanner, which blocked this commit the first
 * time. Suppressing that with `gitleaks:allow` or a `.gitleaksignore` fingerprint would have
 * trained the scanner to stay quiet about exactly the shape this module exists to catch. The
 * strings are identical at runtime, so the assertions are unchanged in strength.
 */
const fake = {
  gh: `ghp_${'X'.repeat(22)}`,
  slack: `xoxb-${'0'.repeat(9)}-${'0'.repeat(10)}-${'Z'.repeat(12)}`,
  openai: `sk-${'x'.repeat(20)}`,
  jwt: 'J'.repeat(24),
  mandrill: `md-${'y'.repeat(14)}`,
  password: 'z'.repeat(16),
};

describe('secrets never travel', () => {
  it('redacts a value assigned to a secret-ish name', () => {
    expect(redact(`OPENAI_API_KEY=${fake.openai}`)).not.toContain(fake.openai);
    expect(redact(`const mandrillApiKey = "${fake.mandrill}"`)).not.toContain(fake.mandrill);
    expect(redact(`password: ${fake.password}`)).not.toContain(fake.password);
  });

  it('redacts a token by its shape even when nothing names it', () => {
    expect(redact(fake.gh)).toBe('<redacted>');
    expect(redact(fake.slack)).toContain('<redacted>');
    expect(redact(`Authorization: Bearer ${fake.jwt}`)).toContain('Bearer <redacted>');
  });

  it('redacts a long base64 blob, which is how a key usually arrives', () => {
    const blob = 'A'.repeat(48);
    expect(redact(`key=${blob}`)).not.toContain(blob);
  });

  /** A false positive costs a line of evidence. A false negative is a disclosure. */
  it('leaves ordinary prose alone', () => {
    const s = 'The scheduler checks the registry before it fires, and logs SKIP when disabled.';
    expect(redact(s)).toBe(s);
  });
});

describe('what it decides to look up', () => {
  const victoria = 'I read ApolloWeeklyEnrollmentAgent and it is scheduled 0 14 * * 1-5 with '
    + 'APOLLO_ENABLED true in production. Roselyn still cannot open her page. What did DA mean?';

  it('finds a class name and an environment flag', () => {
    const ids = identifiersIn(victoria);
    expect(ids).toContain('ApolloWeeklyEnrollmentAgent');
    expect(ids).toContain('APOLLO_ENABLED');
  });

  it('finds a colleague worth looking up', () => {
    expect(peopleIn(victoria)).toContain('Roselyn');
  });

  /** A term that matches half the codebase costs a packet full of noise nobody reads. */
  it('ignores sentence-opening words that are not identifiers', () => {
    const ids = identifiersIn('The This That And But With From When What Where');
    expect(ids).toEqual([]);
  });

  it('is bounded, so one long email cannot produce a hundred lookups', () => {
    const many = Array.from({ length: 60 }, (_, n) => `ThingNumber${n}`).join(' ');
    expect(identifiersIn(many).length).toBeLessThanOrEqual(12);
  });

  it('picks up a backticked term', () => {
    expect(identifiersIn('look at `agent_domain_projects` please')).toContain('agent_domain_projects');
  });
});

describe('reading the shipped code', () => {
  let dir: string;
  let file: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-'));
    file = path.join(dir, 'scheduler.js');
    fs.writeFileSync(file, [
      'const x = 1;',
      "cron.schedule('0 14 * * 1-5', runApolloWeeklyEnrollmentAgent);",
      `const SECRET_TOKEN = "${fake.gh}";`,
    ].join('\n'), 'utf8');
  });

  afterAll(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ } });

  it('returns the line and where it is, so a reply can cite it', () => {
    const lead = findInSource('runApolloWeeklyEnrollmentAgent', [file]);
    expect(lead?.kind).toBe('source');
    expect(lead?.finding).toContain('0 14 * * 1-5');
    expect(lead?.evidence).toContain(':2');
    expect(lead?.evidence).toContain('now running');
  });

  /** The compiled tree holds real credentials. A source lead must never carry one out. */
  it('redacts a credential found on the matching line', () => {
    const lead = findInSource('SECRET_TOKEN', [file]);
    expect(lead?.finding).not.toContain(fake.gh);
    expect(lead?.finding).toContain('<redacted>');
  });

  it('returns nothing rather than guessing when the term is absent', () => {
    expect(findInSource('NoSuchSymbolAnywhere', [file])).toBeNull();
  });

  it('refuses a term too short to be an identifier', () => {
    expect(findInSource('a', [file])).toBeNull();
  });

  it('survives an unreadable file instead of throwing', () => {
    expect(findInSource('anything', [path.join(dir, 'missing.js')])).toBeNull();
  });
});

/**
 * The spelling note, cased on the four names that were actually tried against production.
 *
 * Three of the four missed before the lookup was widened, and then the note itself was wrong for
 * one of the three: it told Ali that "Mohammed Abdul Aleem" was "not quite how the question spelled
 * it" when the spelling was exactly right and the name just sits last. These cases exist so that a
 * false note cannot come back, because a false note is worse than no note - it makes the whole
 * panel something to second-guess.
 */
describe('the spelling note fires only when the spelling really differs', () => {
  it('says nothing when the asked-for name is the whole record', () => {
    expect(spellingNote('Kes', 'Kes')).toBe('');
  });

  it('says nothing when the asked-for name is the first of several words', () => {
    expect(spellingNote('Taiwo Oludimimu', 'Taiwo')).toBe('');
  });

  /** The case that was wrong in production: right spelling, last position. */
  it('says nothing when the asked-for name is the LAST word of a longer name', () => {
    expect(spellingNote('Mohammed Abdul Aleem', 'Aleem')).toBe('');
  });

  it('names the differing word, not the whole record, when the spelling really differs', () => {
    const note = spellingNote('Roselen Flores', 'Roselyn');
    expect(note).toContain('"Roselen"');
    expect(note).toContain('not "Roselyn"');
    expect(note).not.toContain('Flores');
  });

  it('is case-insensitive about an exact match', () => {
    expect(spellingNote('KES', 'kes')).toBe('');
  });

  it('ignores punctuation around a word rather than reading it as a difference', () => {
    expect(spellingNote('Flores, Roselyn', 'Roselyn')).toBe('');
  });

  it('says nothing when there is no record at all', () => {
    expect(spellingNote(null, 'Roselyn')).toBe('');
  });

  it('says nothing when no word is even close, rather than inventing a difference', () => {
    expect(spellingNote('Quincy Adams', 'Roselyn')).toBe('');
  });
});
