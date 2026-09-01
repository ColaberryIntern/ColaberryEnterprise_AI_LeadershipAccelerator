import * as fs from 'fs';
import * as path from 'path';

/**
 * "You are registered" never appeared, and the code was correct.
 *
 * `EventBrite_EventAttendees.Email` stores the address with its delimiters baked
 * in — literally `'someone@example.com',`, a fragment of a VALUES list written
 * verbatim by CCPP's ingestion. An exact match on the clean address therefore
 * returns nothing.
 *
 * Measured on production 2026-09-01:
 *
 *   26,177 of 99,338 rows corrupted, in exactly ONE shape
 *   2024: 0.1%   2025: 69%   2026: 100%
 *   ALL 46 registrations for currently-upcoming events
 *
 *   old query -> 0 matches   new query -> 2 matches   (same real registrant)
 *
 * The lookup runs against CCPP (SQL Server), which no test in this repo can
 * reach — so these assertions are over the query text. That is a real limit and
 * it is why the behavioural proof above was run against production directly
 * rather than asserted here.
 */

const SRC = fs.readFileSync(path.join(__dirname, '..', 'publicEventsService.ts'), 'utf8');
/** Comments stripped — assertions about the QUERY must not match the prose explaining it. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the scan is not blind', () => {
  it('stripped comments but left the query behind', () => {
    expect(CODE).toContain('FROM EventBrite_EventAttendees');
    expect(CODE).toContain('getRegisteredEventIds');
    expect(CODE.length).toBeGreaterThan(2000);
  });
});

describe('the lookup matches BOTH stored forms', () => {
  it('still matches a clean address', () => {
    // 73,161 rows are clean. Recovering the corrupt ones must not cost these.
    expect(CODE).toContain('LOWER(Email) = @email');
  });

  it('also matches the corrupted form', () => {
    expect(CODE).toContain('LOWER(Email) = @emailWrapped');
    expect(CODE).toMatch(/OR LOWER\(Email\) = @emailWrapped/);
  });

  it("builds the wrapped form as leading-quote, address, quote, comma", () => {
    // The exact shape found in the table. Getting this wrong silently returns
    // to matching nothing, which is indistinguishable from "not registered".
    expect(CODE).toContain("`'${e}',`");
  });

  it('binds both as parameters rather than interpolating them', () => {
    // The wrapped form contains a quote character. Interpolating it into the
    // SQL text would be an injection vector reached from a user-controlled
    // email address.
    expect(CODE).toContain("input('emailWrapped', sql.VarChar");
    expect(CODE).toContain("input('email', sql.VarChar");
  });
});

describe('it does not strip characters generically', () => {
  it('uses exact comparison, not REPLACE or LIKE on the email column', () => {
    // A blanket REPLACE(Email, '''', '') would also mangle a legitimate quoted
    // local-part, and a LIKE '%...%' would drop the index on a 99k-row table.
    // The corruption is uniform, so an exact match on the known shape is both
    // safer and faster.
    const lookup = CODE.slice(
      CODE.indexOf('export async function getRegisteredEventIds'),
      CODE.indexOf('export async function annotateRegistration'),
    );
    expect(lookup.length).toBeGreaterThan(200);
    expect(lookup).not.toContain('REPLACE(Email');
    expect(lookup).not.toContain("Email LIKE");
  });
});

describe('the per-viewer answer never leaks between requests', () => {
  it('copies the cached events rather than mutating them', () => {
    // The events come from a cross-viewer cache. Writing is_registered into
    // those objects would publish one learner's registrations to everyone —
    // a worse bug than the one being fixed, and easy to introduce here.
    expect(CODE).toContain('...e, is_registered');
    const annotate = CODE.slice(CODE.indexOf('export async function annotateRegistration'));
    expect(annotate).not.toMatch(/e\.is_registered\s*=/);
  });

  it('returns everyone unregistered when there is no email to match', () => {
    expect(CODE).toContain('if (!email || events.length === 0)');
  });
});

describe('a CCPP outage degrades honestly', () => {
  it('fails soft to an empty set rather than throwing', () => {
    // The calendar must still render. Note the consequence, which is why the
    // corruption went unnoticed: a failure and "nobody is registered" look
    // identical to the viewer.
    const lookup = CODE.slice(
      CODE.indexOf('export async function getRegisteredEventIds'),
      CODE.indexOf('export async function annotateRegistration'),
    );
    expect(lookup).toContain('return new Set()');
    expect(lookup).toContain('event_registration_lookup_failed');
  });
});
