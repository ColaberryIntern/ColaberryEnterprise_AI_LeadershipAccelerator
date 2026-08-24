/**
 * Apollo contact import.
 *
 * The headline guarantee is financial: two scheduled agents were switched off
 * on 2026-07-10 for draining Apollo credits on discovery endpoints, and this
 * import is exposed to sales reps. These tests pin that the client cannot reach
 * a billable path, that a dry run writes nothing, and that re-running never
 * duplicates a lead.
 */

const mockFindOne = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../models/Lead', () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

import { apolloAccountFetch, allowedApolloPaths, ApolloImportError } from '../../services/leads/apolloAccountClient';
import {
  mapContactToLead,
  importApolloContacts,
  MAX_CONTACTS_PER_RUN,
} from '../../services/leads/apolloContactImportService';

const IMPORTED_ON = '2026-08-13';

/** Stub global fetch with a canned contacts-search page. */
function stubContactsPage(contacts: unknown[], pagination: Record<string, number> = {}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      contacts,
      pagination: { page: 1, per_page: contacts.length, total_entries: contacts.length, total_pages: 1, ...pagination },
    }),
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

/**
 * The body of the contacts-search request.
 *
 * Deliberately located by URL rather than by index: the importer now fetches
 * /v1/labels first to resolve list names, so the contacts call is no longer
 * call 0. Asserting on a fixed index is what broke when that fetch was added.
 */
function contactsSearchBody(fetchMock: jest.Mock): any {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => String(url).includes('/v1/contacts/search') && init?.body
  );
  if (!call) throw new Error('no contacts-search request was made');
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  mockFindOne.mockReset();
  mockCreate.mockReset();
  process.env.APOLLO_API_KEY = 'test-key-not-a-real-credential';
});

describe('the credit guarantee', () => {
  it('allows only account-scoped reads', () => {
    expect([...allowedApolloPaths()].sort()).toEqual(['/v1/contacts/search', '/v1/labels']);
  });

  it('refuses every billable discovery endpoint, without making a request', async () => {
    const fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    const billable = [
      '/v1/mixed_people/search',
      '/v1/people/match',
      '/v1/people/search',
      '/api/v1/mixed_people/search',
      '/v1/people/bulk_match',
    ];

    for (const path of billable) {
      await expect(apolloAccountFetch(path, {})).rejects.toThrow(ApolloImportError);
    }
    // The point is not just the throw — no HTTP call may leave the process.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('tags the refusal with a stable error class', async () => {
    (global as any).fetch = jest.fn();
    await expect(apolloAccountFetch('/v1/people/match', {})).rejects.toMatchObject({
      errorClass: 'ForbiddenEndpoint',
    });
  });

  it('does not retry an auth failure', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    (global as any).fetch = fetchMock;

    await expect(apolloAccountFetch('/v1/contacts/search', {})).rejects.toMatchObject({
      errorClass: 'AuthError',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('mapContactToLead', () => {
  const base = {
    id: 'apollo-123',
    first_name: 'Dana',
    last_name: 'Reed',
    email: 'Dana.Reed@Example.com',
    title: 'VP Engineering',
    organization_name: 'Northwind',
    industry: 'information technology',
    linkedin_url: 'https://linkedin.com/in/danareed',
    estimated_num_employees: 480,
    contact_label_names: ['Nate - Ai4 Targets', 'ETS25'],
  };

  it('maps the fields a rep works from', () => {
    const lead = mapContactToLead(base, IMPORTED_ON)!;
    expect(lead).toMatchObject({
      name: 'Dana Reed',
      email: 'dana.reed@example.com',
      company: 'Northwind',
      title: 'VP Engineering',
      industry: 'information technology',
      employee_count: 480,
      apollo_id: 'apollo-123',
      status: 'new',
      lead_source_type: 'cold',
    });
  });

  it('lands under its own source so it stays tellable apart from the March import', () => {
    expect(mapContactToLead(base, IMPORTED_ON)!.source).toBe('apollo_contacts');
  });

  it('keeps the Apollo list, which is how the sales team recognises these', () => {
    const lead = mapContactToLead(base, IMPORTED_ON)!;
    expect(lead.utm_campaign).toBe('Nate - Ai4 Targets');
    expect(String(lead.notes)).toContain('Nate - Ai4 Targets, ETS25');
    expect(String(lead.notes)).toContain(IMPORTED_ON);
  });

  // REGRESSION, 2026-08-24. The first production import put 337 leads in with
  // NO list attribution. /v1/contacts/search returns `label_ids`, not names,
  // and the original mapper only looked for name fields - so it found nothing,
  // wrote nothing, and never complained, because a contact with no list is
  // legitimately common. The original tests passed because they were written
  // against the shape I assumed Apollo returned, not the shape it does.
  describe('label_ids, the shape the contacts endpoint really returns', () => {
    const REAL = {
      id: 'apollo-real',
      email: 'real@example.com',
      label_ids: ['688a78d8cb19ad001d43ef77', '683876b09467c900111332da'],
    };
    const NAMES = new Map([
      ['688a78d8cb19ad001d43ef77', 'Nate - Ai4 Targets'],
      ['683876b09467c900111332da', 'ETS25'],
    ]);

    it('resolves ids to names through the label map', () => {
      const lead = mapContactToLead(REAL, IMPORTED_ON, NAMES)!;
      expect(lead.utm_campaign).toBe('Nate - Ai4 Targets');
      expect(String(lead.notes)).toContain('Nate - Ai4 Targets, ETS25');
    });

    it('falls back to the raw id rather than dropping the attribution', () => {
      // Ugly but traceable. Silently dropping it is the bug this replaces.
      const lead = mapContactToLead(REAL, IMPORTED_ON, new Map())!;
      expect(lead.utm_campaign).toBe('688a78d8cb19ad001d43ef77');
    });

    it('still works when no label map was fetched at all', () => {
      const lead = mapContactToLead(REAL, IMPORTED_ON)!;
      expect(lead.utm_campaign).toBe('688a78d8cb19ad001d43ef77');
    });

    it('prefers real names when an endpoint does supply them', () => {
      const both = { ...REAL, contact_label_names: ['Hologic DSAIL'] };
      expect(mapContactToLead(both, IMPORTED_ON, NAMES)!.utm_campaign).toBe('Hologic DSAIL');
    });

    it('leaves attribution empty for a contact genuinely on no list', () => {
      const lead = mapContactToLead({ id: 'x', email: 'a@b.com' }, IMPORTED_ON, NAMES)!;
      expect(lead.utm_campaign).toBeNull();
    });
  });

  it('lowercases the email so dedupe is not defeated by casing', () => {
    expect(mapContactToLead({ ...base, email: 'DANA.REED@EXAMPLE.COM' }, IMPORTED_ON)!.email)
      .toBe('dana.reed@example.com');
  });

  it('falls back to a joined name, then to the email', () => {
    expect(mapContactToLead({ ...base, name: '   ' }, IMPORTED_ON)!.name).toBe('Dana Reed');
    expect(
      mapContactToLead({ id: 'x', email: 'solo@example.com' }, IMPORTED_ON)!.name
    ).toBe('solo@example.com');
  });

  it('rejects a contact with no usable email', () => {
    expect(mapContactToLead({ id: 'x' }, IMPORTED_ON)).toBeNull();
    expect(mapContactToLead({ id: 'x', email: '   ' }, IMPORTED_ON)).toBeNull();
    expect(mapContactToLead({ id: 'x', email: 'not-an-email' }, IMPORTED_ON)).toBeNull();
  });

  it('tolerates a contact with no list membership', () => {
    const lead = mapContactToLead({ id: 'x', email: 'a@b.com' }, IMPORTED_ON)!;
    expect(lead.utm_campaign).toBeNull();
    expect(String(lead.notes)).toContain('Imported from Apollo');
  });
});

describe('importApolloContacts', () => {
  const contacts = [
    { id: 'a1', email: 'one@example.com', name: 'One' },
    { id: 'a2', email: 'two@example.com', name: 'Two' },
    { id: 'a3', name: 'No Email' },
  ];

  it('writes nothing on a dry run but still reports what would land', async () => {
    stubContactsPage(contacts);
    mockFindOne.mockResolvedValue(null);

    const result = await importApolloContacts();

    expect(result.committed).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.imported).toBe(2);
    expect(result.skippedNoEmail).toBe(1);
    expect(result.scanned).toBe(3);
  });

  it('creates rows when committed', async () => {
    stubContactsPage(contacts);
    mockFindOne.mockResolvedValue(null);

    const result = await importApolloContacts({ commit: true });

    expect(result.committed).toBe(true);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.imported).toBe(2);
  });

  it('is idempotent: a contact already in the queue is skipped, not duplicated', async () => {
    stubContactsPage(contacts);
    // Every lookup hits an existing row, i.e. this is the second run.
    mockFindOne.mockResolvedValue({ id: 99 });

    const result = await importApolloContacts({ commit: true });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.skippedExisting).toBe(2);
  });

  it('matches an existing lead on apollo_id or email, so a website signup is never duplicated', async () => {
    stubContactsPage([contacts[0]]);
    mockFindOne.mockResolvedValue(null);

    await importApolloContacts({ commit: true });

    const where = mockFindOne.mock.calls[0][0].where;
    const clauses = where[Object.getOwnPropertySymbols(where)[0] as any] ?? [];
    expect(JSON.stringify(clauses)).toContain('one@example.com');
    expect(JSON.stringify(clauses)).toContain('a1');
  });

  it('clamps an oversized limit rather than walking the whole account', async () => {
    const fetchMock = stubContactsPage(contacts);
    mockFindOne.mockResolvedValue(null);

    await importApolloContacts({ limit: 100000 });

    const body = contactsSearchBody(fetchMock);
    expect(body.per_page).toBeLessThanOrEqual(MAX_CONTACTS_PER_RUN);
    expect(body.per_page).toBeLessThanOrEqual(100);
  });

  it('passes a list filter through so a rep can pull one target list', async () => {
    const fetchMock = stubContactsPage(contacts);
    mockFindOne.mockResolvedValue(null);

    await importApolloContacts({ labelIds: ['label-7'] });

    const body = contactsSearchBody(fetchMock);
    expect(body.contact_label_ids).toEqual(['label-7']);
  });

  it('records a row failure without aborting the rest of the batch', async () => {
    stubContactsPage(contacts);
    mockFindOne.mockResolvedValue(null);
    mockCreate
      .mockRejectedValueOnce(new Error('unique constraint'))
      .mockResolvedValueOnce({ id: 2 });

    const result = await importApolloContacts({ commit: true });

    expect(result.failed).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.errors[0]).toContain('one@example.com');
  });

  it('reports no next page when the list is exhausted', async () => {
    stubContactsPage(contacts, { total_pages: 1 });
    mockFindOne.mockResolvedValue(null);

    expect((await importApolloContacts()).nextPage).toBeNull();
  });

  it('stops cleanly on an empty page', async () => {
    stubContactsPage([]);

    const result = await importApolloContacts();

    expect(result.scanned).toBe(0);
    expect(result.nextPage).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
