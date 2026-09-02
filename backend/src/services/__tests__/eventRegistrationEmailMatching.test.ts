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

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'publicEventsService.ts'), 'utf8');
/** Comments stripped — assertions about the QUERY must not match the prose explaining it. */
const CODE = strip(SRC);

/**
 * The SECOND reader of the same corrupt column.
 *
 * `openHouseOnboardingService.isEmailRegisteredForOpenHouse` backs the Today
 * "RSVP for the next event" banner. It was left on an exact match when
 * `publicEventsService` gained the defence, so production disagreed with
 * itself: the Events page marked a viewer registered while the banner kept
 * asking them to RSVP for the same event.
 *
 * Verified against a real registration on production 2026-09-02 —
 * `annotateRegistration` returned the event as registered, while
 * `isEmailRegisteredForOpenHouse` returned false for the same address and
 * event, with the attendee row demonstrably present.
 */
const ONB = strip(fs.readFileSync(path.join(__dirname, '..', 'openHouseOnboardingService.ts'), 'utf8'));

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

describe('the RSVP banner reads the column the same way', () => {
  const lookup = ONB.slice(
    ONB.indexOf('export async function isEmailRegisteredForOpenHouse'),
    ONB.indexOf('export async function syncOpenHouseExplorers'),
  );

  it('found the function to scan', () => {
    expect(lookup.length).toBeGreaterThan(200);
    expect(lookup).toContain('FROM EventBrite_EventAttendees');
  });

  it('matches the clean form', () => {
    expect(lookup).toContain('LOWER(Email) = @email');
  });

  it('ALSO matches the corrupted form — the whole point of this file', () => {
    // Without this, the banner answers "not registered" for 100% of 2026
    // registrations while the Events page says the opposite.
    expect(lookup).toMatch(/OR LOWER\(Email\) = @emailWrapped/);
  });

  it('builds the wrapped form identically to the other reader', () => {
    // Two readers of one corrupt column must agree on the corruption's shape,
    // or they drift apart again exactly as they did before.
    expect(lookup).toContain("`'${e}',`");
    expect(ONB).toContain("input('emailWrapped', sql.VarChar");
  });

  it('still scopes to a single event', () => {
    // The widened email predicate must not accidentally widen the event scope;
    // this is the same function that once answered for a hardcoded event.
    expect(lookup).toContain('EventId = @eventId');
  });

  it('keeps the OR inside parentheses, so the event filter still binds', () => {
    // `A AND B OR C` would match ANY event for the wrapped form — reporting a
    // learner as registered for something they never signed up for.
    expect(lookup).toMatch(/AND \(LOWER\(Email\) = @email OR LOWER\(Email\) = @emailWrapped\)/);
  });

  it('does not strip characters generically', () => {
    expect(lookup).not.toContain('REPLACE(Email');
    expect(lookup).not.toContain('Email LIKE');
  });

  it('still fails soft — a CCPP outage must not block the schedule', () => {
    expect(lookup).toContain('return false');
  });
});
