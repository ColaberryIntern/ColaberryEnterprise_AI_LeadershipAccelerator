/**
 * AF11.7 — the people roster a tool request's named reader is checked against.
 *
 * The property worth testing here is not "it runs a SELECT". It is that **an unreadable roster is
 * reported as absent rather than as empty**, because those two produce opposite behaviour one layer
 * up: `toolRequestContract.gateToolRequest` turns `roster_absent` into a refusal with a sentence,
 * and would turn a silently-empty list into `acts_on_output_not_a_person` — telling a builder their
 * colleague does not exist when the truth is that we could not look.
 *
 * `datasetCatalog`'s header records the sharper version of why this matters: if an unreadable
 * roster waved a request through, the FIRST request filed during a database hiccup would be the one
 * that got an unchecked answer. A check that is decorative exactly when it matters.
 */

import { QueryTypes, type Sequelize } from 'sequelize';
import { actorEmails, loadActorRoster } from '../actorRoster';
import { AGENT_DOMAIN_ORG_ID } from '../agentDomainRegistry';

const query = jest.fn();
const fake = () => ({ query: (...a: unknown[]) => query(...a) } as unknown as Sequelize);

let warn: jest.SpyInstance;
beforeEach(() => {
  query.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('THE CONTROL — without this every case below passes for the wrong reason', () => {
  it('returns the roster it was given, and does not report it absent', async () => {
    query.mockResolvedValue([
      { email: 'sohail@colaberry.com' },
      { email: 'taiwo@colaberry.com' },
    ]);
    const roster = await loadActorRoster(fake());
    expect(roster.roster_absent).toBe(false);
    expect(actorEmails(roster)).toEqual(['sohail@colaberry.com', 'taiwo@colaberry.com']);
  });
});

describe('an unreadable roster is ABSENT, never empty', () => {
  it('reports absent and logs the error class when the query THROWS', async () => {
    // Never rejects: filing must not fail because a people table is briefly unavailable. It must
    // be REFUSED by name, one layer up, with a sentence the person filing can act on.
    query.mockRejectedValue(new TypeError('connection terminated'));
    const roster = await loadActorRoster(fake());
    expect(roster.roster_absent).toBe(true);
    expect(actorEmails(roster)).toEqual([]);
    const logged = JSON.parse(warn.mock.calls[0][0] as string);
    expect(logged.event).toBe('actor_roster_unreadable');
    expect(logged.error_class).toBe('TypeError');
    expect(logged.outcome).toBe('failure');
  });

  it('reports absent when the query SUCCEEDS and returns nothing', async () => {
    // The same fact for a gate's purposes — there is nobody to check a name against — so the two
    // are collapsed here rather than left for every caller to remember.
    query.mockResolvedValue([]);
    const roster = await loadActorRoster(fake());
    expect(roster.roster_absent).toBe(true);
    expect(JSON.parse(warn.mock.calls[0][0] as string).event).toBe('actor_roster_empty');
  });

  it('reports absent when every row carries a blank, which is not the same as rows existing', async () => {
    // A row with a null email is a row we cannot reach anybody at. Counting it would make the
    // roster look populated and then refuse every real name typed against it.
    query.mockResolvedValue([{ email: null }, { email: '   ' }, { email: '' }]);
    const roster = await loadActorRoster(fake());
    expect(roster.roster_absent).toBe(true);
    expect(actorEmails(roster)).toEqual([]);
  });

  it('keeps the DISTINCTION in the log while collapsing it in the return value', async () => {
    // Empty and unreadable are one decision and two diagnoses. Whoever reads the logs needs to
    // know which, and whoever reads the return value must not have to care.
    query.mockResolvedValue([]);
    await loadActorRoster(fake());
    const first = JSON.parse(warn.mock.calls[0][0] as string).event;
    warn.mockClear();
    query.mockRejectedValue(new Error('nope'));
    await loadActorRoster(fake());
    const second = JSON.parse(warn.mock.calls[0][0] as string).event;
    expect(first).not.toBe(second);
  });
});

describe('both tables, because the builders and the people they build for are different groups', () => {
  it('reads admin_users AND org_members, scoped to the agent-domain org', async () => {
    // `resolveRecordedHumans` records why both: *"An intern is an `org_members` row in the
    // agent-domain org; Ali is an `admin_users` row."* It bites harder here, because the people a
    // tool's output is FOR are mostly not the people filing the request — Sohail, Taiwo, Swati and
    // Roselyn are the accountable humans, and the builders are Sarbjit, Mihret, Quincy and the
    // rest. A roster of builders only would refuse every honest answer.
    query.mockResolvedValue([{ email: 'a@b.com' }]);
    await loadActorRoster(fake());
    const [sql, opts] = query.mock.calls[0] as [string, { bind: unknown[]; type: unknown }];
    expect(sql).toMatch(/admin_users/);
    expect(sql).toMatch(/org_members/);
    expect(sql).toMatch(/om\.org_id = \$1/);
    expect(opts.bind).toEqual([AGENT_DOMAIN_ORG_ID]);
    expect(opts.type).toBe(QueryTypes.SELECT);
  });

  it('keeps the enrollments join, without which the roster silently loses interns', async () => {
    // An `org_members` row can carry the enrollment's email rather than its own. Dropping the join
    // would shorten the roster by exactly the people whose record is shaped that way, and nothing
    // would report it — the roster would just be quietly wrong.
    query.mockResolvedValue([{ email: 'a@b.com' }]);
    await loadActorRoster(fake());
    const sql = (query.mock.calls[0] as [string])[0];
    expect(sql).toMatch(/LEFT JOIN enrollments e ON e\.id = om\.enrollment_id/);
    expect(sql).toMatch(/COALESCE\(om\.email, e\.email\)/);
  });

  it('asks for NOTHING but the email', async () => {
    // Not a name, not a title, not a role. A second spelling of a person's identity is a second
    // thing to keep in agreement, and every other table in this subtree keys on the email.
    query.mockResolvedValue([{ email: 'a@b.com' }]);
    await loadActorRoster(fake());
    const sql = (query.mock.calls[0] as [string])[0];
    expect(sql).not.toMatch(/\bname\b/i);
    expect(sql).not.toMatch(/\brole\b/i);
  });
});

describe('one person is one roster entry', () => {
  it('de-duplicates on the LOWERCASED form, which `UNION` cannot do', async () => {
    // `UNION` removes exact duplicates. It cannot see that two spellings are one person, and a
    // roster carrying both would let two requests name the same reader in two ways.
    query.mockResolvedValue([
      { email: 'Sohail@Colaberry.com' },
      { email: 'sohail@colaberry.com' },
      { email: 'SOHAIL@COLABERRY.COM' },
      { email: 'taiwo@colaberry.com' },
    ]);
    const roster = await loadActorRoster(fake());
    expect(actorEmails(roster)).toEqual(['Sohail@Colaberry.com', 'taiwo@colaberry.com']);
  });

  it('keeps the FIRST spelling seen, so the stored answer is a spelling some record has', async () => {
    // The contract writes the roster's spelling onto the request rather than the typed one. That
    // only means anything if the roster's spelling came off a row.
    query.mockResolvedValue([{ email: '  Taiwo@Colaberry.com  ' }, { email: 'taiwo@colaberry.com' }]);
    expect(actorEmails(await loadActorRoster(fake()))).toEqual(['Taiwo@Colaberry.com']);
  });

  it('drops blanks without dropping the rows around them', async () => {
    query.mockResolvedValue([
      { email: 'a@b.com' }, { email: null }, { email: '  ' }, { email: 'c@d.com' },
    ]);
    const roster = await loadActorRoster(fake());
    expect(actorEmails(roster)).toEqual(['a@b.com', 'c@d.com']);
    expect(roster.roster_absent).toBe(false);
  });

  it('hands back a COPY, so a caller cannot mutate the roster it was given', async () => {
    query.mockResolvedValue([{ email: 'a@b.com' }]);
    const roster = await loadActorRoster(fake());
    const emails = actorEmails(roster);
    emails.push('injected@nowhere.com');
    expect(actorEmails(roster)).toEqual(['a@b.com']);
  });
});
