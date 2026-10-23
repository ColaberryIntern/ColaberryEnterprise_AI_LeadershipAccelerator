/* eslint-disable */
// Unit tests for the AF10.5 roster.
//
// Two load-bearing cases, both supplied by production rather than imagined.
//
// 1. "Sarbjit Kaur" matches TWO active enrollments, one holding the marketing agent project and
//    one holding nothing. Any lookup keyed on the display name is a coin flip for her, so the key
//    is the sign-in email and a name is only ever used for display.
//
// 2. reese@colaberry.com owns THREE domains, and has no intended builder on any of them. That
//    breaks two assumptions at once: one address can hold several domains, so an email-keyed Map
//    of single entries loses two of them silently; and a project having an enrollment behind it
//    is not the same as an intern being on it. Routing mail on the former would file a staff
//    member's email onto three agent tickets.
//
// The third theme is refusing to be silent. A domain with no ticket, a ticket for a domain that
// does not exist, and a ticket naming a different builder than the enrollment are all returned as
// data, because each previously printed one line into a cron log and carried on.

const {
  toEntry, assigned, backed, byEmail, ownerCollisions, byDomain, matchTickets, builderDrift,
  domainFromTitle, agentFromTitle, builderFromTitle, loadRoster, ROSTER_SQL,
} = require('../agentRoster');

const row = (over: any = {}) => ({
  domain_key: 'marketing',
  project_id: 'proj-1',
  stored_builder: 'Sarbjit Kaur',
  email: 'Sarbjitsaini83@YAHOO.com',
  enrollment_name: 'Sarbjit Kaur',
  enrollment_id: 'enr-1',
  enrollment_status: 'active',
  joined_at: '2026-07-21T16:51:03Z',
  repo_url: 'https://github.com/sainisarbjit83-ai/Colaberry_Marketing_Agent',
  last_sync_at: '2026-10-22T12:17:38Z',
  ...over,
});

describe('the key is the sign-in email, not the display name', () => {
  it('lowercases and trims the email on the way in', () => {
    expect(toEntry(row({ email: '  Sarbjitsaini83@YAHOO.com ' })).email)
      .toBe('sarbjitsaini83@yahoo.com');
  });

  it('keeps two same-named builders apart, which a name-keyed map cannot', () => {
    const roster = [
      toEntry(row({ domain_key: 'marketing', email: 'sarbjitsaini83@yahoo.com' })),
      toEntry(row({ domain_key: 'website', email: 'sarbjitsaini716@gmail.com', project_id: 'p2' })),
    ];
    const m = byEmail(roster);
    expect(m.size).toBe(2);
    expect(m.get('sarbjitsaini83@yahoo.com')[0].domain).toBe('marketing');
    expect(m.get('sarbjitsaini716@gmail.com')[0].domain).toBe('website');
  });

  it('treats inbound mail casing as not ours to control', () => {
    expect(byEmail([toEntry(row())]).get('sarbjitsaini83@yahoo.com')).toBeDefined();
  });
});

describe('one person can own several domains', () => {
  const reese = (domain: string) => toEntry(row({
    domain_key: domain, email: 'reese@colaberry.com', enrollment_name: 'Reese',
    stored_builder: 'Reese', project_id: `p-${domain}`,
  }));
  const roster = [reese('executive'), reese('learner_success'), reese('website'), toEntry(row())];

  it('returns every domain for the address, not just the last one', () => {
    expect(byEmail(roster).get('reese@colaberry.com').map((e: any) => e.domain).sort())
      .toEqual(['executive', 'learner_success', 'website']);
  });

  it('names the owner holding more than one', () => {
    expect(ownerCollisions(roster)).toEqual([
      { email: 'reese@colaberry.com', domains: ['executive', 'learner_success', 'website'] },
    ]);
  });

  it('does not report someone holding exactly one', () => {
    expect(ownerCollisions([toEntry(row())])).toEqual([]);
  });
});

describe('an enrollment behind the project is NOT an intern on the domain', () => {
  const staffOwned = toEntry(row({
    domain_key: 'executive', email: 'reese@colaberry.com', enrollment_name: 'Reese',
    stored_builder: null,
  }));

  it('is backed but not assigned', () => {
    expect(staffOwned.backed).toBe(true);
    expect(staffOwned.assigned).toBe(false);
  });

  it('is excluded from byEmail by default, so mail never routes to it', () => {
    const roster = [staffOwned, toEntry(row())];
    expect(byEmail(roster).has('reese@colaberry.com')).toBe(false);
    expect(assigned(roster).map((r: any) => r.domain)).toEqual(['marketing']);
    expect(backed(roster).length).toBe(2);
  });

  it('can be asked for explicitly, for a caller wanting ownership rather than routing', () => {
    expect(byEmail([staffOwned], { includeUnassigned: true })
      .get('reese@colaberry.com')[0].domain).toBe('executive');
  });
});

describe('a domain with no enrollment at all is returned, not dropped', () => {
  const orphan = toEntry(row({
    domain_key: 'executive', email: null, enrollment_name: null,
    stored_builder: null, enrollment_id: null, enrollment_status: null,
  }));

  it('comes back with a null builder, neither backed nor assigned', () => {
    expect(orphan.backed).toBe(false);
    expect(orphan.assigned).toBe(false);
    expect(orphan.builder).toBeNull();
    expect(orphan.email).toBeNull();
  });

  it('is present in byDomain but absent from assigned and byEmail', () => {
    const roster = [toEntry(row()), orphan];
    expect(byDomain(roster).has('executive')).toBe(true);
    expect(assigned(roster).map((r: any) => r.domain)).toEqual(['marketing']);
    expect(byEmail(roster).size).toBe(1);
  });
});

describe('ticket titles', () => {
  const title = 'Maru - the product experience agent (Mihret Netsereab)';

  it('reads a multi-word domain back as its key', () => {
    expect(domainFromTitle(title)).toBe('product_experience');
    expect(domainFromTitle('Ellis - the platform agent (Quincy Nkwain Ninying)')).toBe('platform');
  });

  it('reads the agent name and the builder', () => {
    expect(agentFromTitle(title)).toBe('Maru');
    expect(builderFromTitle(title)).toBe('Mihret Netsereab');
  });

  it('returns null rather than guessing on a title that does not fit', () => {
    expect(domainFromTitle('Some other todo')).toBeNull();
    expect(builderFromTitle('Ellis - the platform agent')).toBeNull();
    expect(domainFromTitle(null)).toBeNull();
  });
});

describe('matching tickets says what did NOT match', () => {
  const roster = [
    toEntry(row({ domain_key: 'marketing', email: 'a@x.com', enrollment_name: 'Sarbjit Kaur' })),
    toEntry(row({ domain_key: 'platform', email: 'b@x.com', enrollment_name: 'Quincy Nkwain Ninying' })),
    toEntry(row({
      domain_key: 'executive', email: 'reese@colaberry.com', enrollment_name: 'Reese',
      stored_builder: null,
    })),
  ];
  const todo = (id: number, title: string, due: string | null = null) => ({ id, title, due_on: due });
  const marketing = todo(1, 'Ava - the marketing agent (Sarbjit Kaur)');
  const platform = todo(2, 'Ellis - the platform agent (Quincy Nkwain Ninying)');

  it('matches by domain and carries the due date through', () => {
    const { byDomain: m } = matchTickets([
      todo(1, 'Ava - the marketing agent (Sarbjit Kaur)', '2026-11-21'),
    ], roster);
    expect(m.get('marketing')).toMatchObject({ id: 1, agent: 'Ava', dueOn: '2026-11-21' });
  });

  it('reports an ASSIGNED domain with no ticket, which used to be one skipped log line', () => {
    const { problems } = matchTickets([marketing], roster);
    expect(problems).toContainEqual({
      kind: 'assigned_domain_without_ticket', domain: 'platform', email: 'b@x.com',
    });
  });

  it('does NOT demand a ticket for a domain nobody is assigned to', () => {
    // Otherwise executive, learner success and website print a problem on every single run, and
    // a report that is always wrong about three things is one people stop reading.
    expect(matchTickets([marketing, platform], roster).problems).toEqual([]);
  });

  it('reports a ticket for a domain the roster has never heard of', () => {
    const { problems } = matchTickets([
      todo(9, 'Zed - the logistics agent (Someone)'), marketing, platform,
    ], roster);
    expect(problems).toContainEqual({
      kind: 'ticket_for_unknown_domain',
      ticketId: 9,
      title: 'Zed - the logistics agent (Someone)',
      domain: 'logistics',
    });
  });

  it('catches a reassignment finished in one place and not the other', () => {
    const { problems } = matchTickets([
      todo(1, 'Ava - the marketing agent (Someone Else)'), platform,
    ], roster);
    expect(problems).toContainEqual({
      kind: 'ticket_builder_disagrees',
      ticketId: 1,
      domain: 'marketing',
      ticketSays: 'Someone Else',
      enrollmentSays: 'Sarbjit Kaur',
      email: 'a@x.com',
    });
  });

  it('ignores a case difference in the builder name rather than crying wolf', () => {
    const { problems } = matchTickets([
      todo(1, 'Ava - the marketing agent (sarbjit kaur)'), platform,
    ], roster);
    expect(problems).toEqual([]);
  });
});

describe('builder drift between the stored name and the enrollment', () => {
  it('reports the drift instead of preferring one of them', () => {
    const roster = [toEntry(row({ stored_builder: 'S. Kaur', enrollment_name: 'Sarbjit Kaur' }))];
    expect(builderDrift(roster)).toEqual([{
      domain: 'marketing',
      stored: 'S. Kaur',
      enrollment: 'Sarbjit Kaur',
      email: 'sarbjitsaini83@yahoo.com',
    }]);
  });

  it('says nothing when they agree, ignoring case and padding', () => {
    expect(builderDrift([toEntry(row({ stored_builder: ' sarbjit kaur ' }))])).toEqual([]);
  });

  it('says nothing for a domain nobody is assigned to', () => {
    expect(builderDrift([toEntry(row({ email: null, enrollment_name: null }))])).toEqual([]);
    expect(builderDrift([toEntry(row({ stored_builder: null }))])).toEqual([]);
  });
});

describe('loadRoster', () => {
  it('shapes whatever the query returns and survives an empty result', async () => {
    expect(await loadRoster(async () => [])).toEqual([]);
    expect(await loadRoster(async () => null)).toEqual([]);
    const out = await loadRoster(async () => [row()]);
    expect(out[0]).toMatchObject({
      domain: 'marketing', email: 'sarbjitsaini83@yahoo.com', assigned: true, backed: true,
    });
  });

  it('does not filter on intended_builder, which is what used to hide whole domains', () => {
    expect(ROSTER_SQL).not.toMatch(/intended_builder\s+IS\s+NOT\s+NULL/i);
  });

  it('LEFT JOINs the enrollment, so a domain whose enrollment vanished stays visible', () => {
    expect(ROSTER_SQL).toMatch(/LEFT JOIN enrollments/i);
  });
});
