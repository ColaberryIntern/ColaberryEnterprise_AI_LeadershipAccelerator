/**
 * The regression this file exists for.
 *
 * The sort compared timestamps with `localeCompare`, because the fields are
 * TYPED `string | null`. Sequelize returns Date objects for timestamp columns,
 * so it threw `TypeError: bt.localeCompare is not a function` and took the
 * whole profile endpoint down with a 500 — for every person with any message.
 *
 * Nothing caught it. tsc believed the declared type. The other tests mock
 * `sequelize.query` and hand back strings, so they never saw a Date. Verifying
 * the SQL against production exercised the query and not this sort.
 *
 * So these mocks return DATE OBJECTS deliberately. A test that feeds the shape
 * the type claims, rather than the shape the driver returns, would have passed
 * the broken code.
 */

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import { loadCommunications } from '../panels/communicationPanels';

beforeEach(() => mockQuery.mockReset());

/** One enrolment, three messages, timestamps as Dates — as the driver returns them. */
function withDateRows() {
  mockQuery
    .mockResolvedValueOnce([
      {
        campaign_id: 'c1', campaign_name: 'Alumni AI Champion', campaign_status: 'active',
        status: 'active', current_step_index: 0, total_steps: 4,
        enrolled_at: new Date('2026-08-01T10:00:00Z'),
        last_activity_at: new Date('2026-08-13T18:52:35Z'),
        touchpoint_count: 1, response_count: 0,
      },
    ])
    .mockResolvedValueOnce([
      {
        id: 'm-old', campaign_id: 'c1', direction: 'outbound', channel: 'email',
        subject: 'First', body: 'body one', sent_at: new Date('2026-08-01T10:00:00Z'),
        scheduled_for: null, status: 'sent', ai_generated: false, step_index: 0,
        to_address: 'a@b.com', source: 'scheduled_emails',
      },
      {
        id: 'm-new', campaign_id: 'c1', direction: 'inbound', channel: 'email',
        subject: 'Reply', body: 'body two', sent_at: new Date('2026-08-13T18:52:35Z'),
        scheduled_for: null, status: 'sent', ai_generated: false, step_index: null,
        to_address: 'a@b.com', source: 'communication_logs',
      },
      {
        // Never sent — ordering must fall back to scheduled_for, also a Date.
        id: 'm-pending', campaign_id: 'c1', direction: 'outbound', channel: 'sms',
        subject: 'Nudge', body: null, sent_at: null,
        scheduled_for: new Date('2026-08-21T15:48:01Z'), status: 'cancelled',
        ai_generated: false, step_index: 1, to_address: 'a@b.com', source: 'scheduled_emails',
      },
    ])
    .mockResolvedValueOnce([
      { scheduled_email_id: 'm-old', campaign_id: 'c1', outcome: 'opened', channel: 'email', created_at: new Date('2026-08-02T09:00:00Z') },
    ]);
}

describe('loadCommunications', () => {
  it('returns null and issues no query for a person with no lead', async () => {
    await expect(loadCommunications([])).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('sorts Date timestamps without throwing', async () => {
    withDateRows();
    // The regression: this threw TypeError before the fix.
    const panel = await loadCommunications([1]);
    expect(panel).not.toBeNull();
    const order = panel!.threads[0].messages.map((m) => m.id);
    // Newest first, and the unsent message orders by scheduled_for.
    expect(order).toEqual(['m-pending', 'm-new', 'm-old']);
  });

  it('attaches an outcome to the message it describes', async () => {
    withDateRows();
    const panel = await loadCommunications([1]);
    const old = panel!.threads[0].messages.find((m) => m.id === 'm-old');
    expect(old!.outcomes.map((o) => o.outcome)).toEqual(['opened']);
    // And not to the others.
    expect(panel!.threads[0].messages.find((m) => m.id === 'm-new')!.outcomes).toEqual([]);
  });

  it('counts a reply as inbound', async () => {
    withDateRows();
    const panel = await loadCommunications([1]);
    expect(panel!.inboundCount).toBe(1);
    expect(panel!.totalMessages).toBe(3);
    expect(panel!.totalCampaigns).toBe(1);
  });

  it('keeps a message with no campaign in its own thread', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'welcome', campaign_id: null, direction: 'outbound', channel: 'email',
          subject: 'Welcome to Colaberry', body: null,
          sent_at: new Date('2026-07-21T16:49:28Z'), scheduled_for: null,
          status: 'sent', ai_generated: false, step_index: null,
          to_address: 'a@b.com', source: 'communication_logs',
        },
      ])
      .mockResolvedValueOnce([]);

    const panel = await loadCommunications([1]);
    // The whole reason this panel is keyed on the person: a campaign-scoped
    // view cannot reach a message that belongs to no campaign.
    expect(panel!.threads).toHaveLength(1);
    expect(panel!.threads[0].campaignName).toBe('Not part of a campaign');
    expect(panel!.totalCampaigns).toBe(0);
  });
});
