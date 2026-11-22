/**
 * CP11.1a against a REAL Postgres (the integration tier): the staff desk's statements run as written, through the real
 * desk service and actions, the REAL bookingReply.sendBookingLink and the REAL inboxTestJob.sendTest (switch reads are
 * injected; the mailer and send ledger are stand-ins, so nothing is ever sent).
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts careerDeskStore.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};
const mockSent: string[] = [];
jest.mock('../../email/idempotentSend', () => ({
  sendOnce: async (id: { recipient: string; subject: string; businessEventId: string }, send: () => Promise<{ ok: boolean }>) => {
    const key = `${id.recipient}|${id.subject}|${id.businessEventId}`;
    if (mockSent.includes(key)) return { outcome: 'skipped', reason: 'already_sent', idempotencyKey: key };
    mockSent.push(key);
    await send();
    return { outcome: 'sent', ledgerId: key, idempotencyKey: key };
  },
}));
jest.mock('../../emailService', () => ({ guardedSendMail: async () => ({ messageId: 'm' }), resolveEmailRecipient: async (to: string, subject: string) => ({ to, subject }) }));
jest.mock('../../settingsService', () => ({ getSetting: async () => null }));
jest.mock('../../careerPrep/careerPrepFlag', () => ({ careerPrepEnabled: async () => true, careerPrepEnrollmentIds: async () => ['7eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', '7eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'] }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[careerDeskStore.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('the staff desk against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let hire: typeof import('../../../db/ensureHireClientSchema');
  let svc: typeof import('../careerDeskService');
  let act: typeof import('../careerDeskActions');
  let scan: typeof import('./helpers/noRoomUrl');
  const E1 = '7eeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'; const E2 = '7eeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
  const URL = 'https://zoom.example/j/SECRET';
  const ON = async () => true; const OFF = async () => false;
  const S = (read: () => Promise<unknown>) => ({ staff: 'staff-7', read });
  const rows = async <T>(sql: string): Promise<T[]> => (await sequelize.query(sql))[0] as T[];
  const iv = async (src: string, state: string, extra = ''): Promise<string> => (await rows<{ id: string }>(`INSERT INTO placement_interviews
    (enrollment_id, source_event_id, company, position, contact_email, state, room_url, room_provider_id${extra ? `, ${extra.split('=')[0]}` : ''})
    VALUES ('${E1}', '${src}', 'Acme', 'Analyst', 'pat@acme.example', '${state}', '${URL}', 'zm-1'${extra ? `, ${extra.split('=')[1]}` : ''}) RETURNING id`))[0].id;
  const audits = (event: string) => rows<{ actor: string; payload: { outcome: string } }>(`SELECT actor, payload FROM placement_events WHERE event = '${event}' ORDER BY id`);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    hire = await import('../../../db/ensureHireClientSchema');
    svc = await import('../careerDeskService');
    act = await import('../careerDeskActions');
    scan = await import('./helpers/noRoomUrl');
    for (const m of ['log', 'warn', 'error'] as const) jest.spyOn(console, m).mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)');
    await sequelize.query('ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS email VARCHAR(255)');
    await sequelize.query(`INSERT INTO enrollments (id, full_name, email) VALUES ('${E1}', 'Ann Lee', 'ann.personal@mail.example'), ('${E2}', 'Bo Kim', 'bo@mail.example') ON CONFLICT DO NOTHING`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    for (const sql of hire.HIRE_CLIENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await hire.ensureHireClientSchema();
    await schema.ensurePlacementSchema();
    await sequelize.query(`INSERT INTO job_search_inboxes (enrollment_id, address, mailbox, verified_at) VALUES ('${E1}', 'ann.jobs@gmail.com', 'annjobs@gmail.com', NOW())`);
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    for (const sql of hire.HIRE_CLIENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('the queue, held list, bookings and overview read every kind from real SQL and never carry the provider link', async () => {
    const gave = await iv('desk:gave', 'review');
    await sequelize.query(`INSERT INTO placement_events (subject_type, subject_id, event, from_state, to_state, actor) VALUES ('placement_interview', '${gave}', 'booking_link_gave_up', 'new', 'review', 'platform')`);
    const held = await iv('desk:held', 'new', "booking_link_round='first'");
    await sequelize.query(`INSERT INTO placement_events (subject_type, subject_id, event, actor, source_event_id) VALUES ('placement_interview', '${held}', 'booking_link_held', 'platform', 'booking_link_held:${held}:first')`);
    const conf = await iv('desk:conf', 'booked', "confirm_attempts=3");
    await sequelize.query(`UPDATE placement_interviews SET starts_at = '2026-11-23T15:00:00Z', minutes = 45, type = 'technical', interviewer_emails = '{kim@acme.example}', recording_consent = 'unavailable' WHERE id = '${conf}'`);
    for (const kind of ['low_confidence', 'unmatched_learner', 'unmatched_update', 'ambiguous_update', 'not_booked', 'recording_mismatch']) {
      await sequelize.query(`INSERT INTO placement_review_items (kind, source_event_id, enrollment_id, interview_id, summary) VALUES ('${kind}', 'desk:${kind}', '${E1}', ${kind === 'recording_mismatch' ? `'${conf}'` : 'NULL'},
        '{"company":"Acme","subject":"see ${URL}","room_url":"${URL}","seen":"on","expected":"off"}'::jsonb)`);
    }
    await sequelize.query("INSERT INTO placement_events (subject_type, subject_id, event, actor, source_event_id) VALUES ('zoom_app', 'recording-scope', 'zoom_scope_missing', 'platform', 'zoom_scope_missing:today')");
    const q = await svc.reviewQueue();
    const o = await svc.overview(OFF);
    const b = await svc.bookingList();
    for (const body of [q, o, b]) scan.expectNoRoomUrl(body);
    expect(q.items.map((i) => i.kind)).toEqual(expect.arrayContaining(['low_confidence', 'unmatched_learner', 'unmatched_update', 'ambiguous_update', 'not_booked', 'recording_mismatch', 'booking_gave_up', 'confirm_gave_up']));
    expect(q.items.find((i) => i.kind === 'unmatched_update')?.related.length).toBeGreaterThanOrEqual(3);
    expect(q.held.map((h) => h.interviewId)).toEqual([held]);
    expect(o).toMatchObject({ recruiters: [{ name: 'Karthik' }, { name: 'Vivek' }], switches: { employerMail: 'off', inboxTests: 'off' }, recording: { note: 'Recording unavailable: Zoom permission missing' } });
    expect(b.bookings.find((x) => x.interviewId === conf)).toMatchObject({ startsLabel: 'Mon, Nov 23, 9:00 AM CST', typeLine: 'Technical interview, 45 min, with kim@acme.example' });
    expect(JSON.stringify([q, o, b])).not.toContain('ann.personal@mail.example');
  });

  it('0.78 confidence: Send booking link with mail off is held + audited + listed; on it is sent ONCE; a second click sends nothing', async () => {
    const r78 = await iv('desk:r78', 'review', 'confidence=0.78');
    expect(await act.sendLink(r78, S(OFF))).toMatchObject({ status: 'ok', outcome: 'held' });
    expect((await svc.reviewQueue()).held.map((h) => h.interviewId)).toContain(r78);
    expect(await rows(`SELECT 1 FROM placement_events WHERE source_event_id = 'booking_link_held:${r78}:first'`)).toHaveLength(1);
    expect(await act.sendLink(r78, S(ON))).toMatchObject({ status: 'ok', outcome: 'sent' });
    expect(await act.sendLink(r78, S(ON))).toMatchObject({ status: 'conflict' });
    expect(mockSent.filter((k) => k.includes(`placement_interview:${r78}:booking_link`))).toHaveLength(1);
    expect((await audits('desk_send_link')).map((a) => [a.actor, a.payload.outcome])).toEqual([['staff-7', 'held'], ['staff-7', 'sent'], ['staff-7', 'conflict']]);
  });

  it('Low confidence Send booking link, clicked twice at once: ONE interview from the stored email, the item resolved', async () => {
    const payload = { event_id: 'lc1', message_id: '<lc@x>', type: 'interview.detected', to_address: 'ann.jobs@gmail.com', received_at: '2026-11-19T15:00:00Z', company: 'Beta', confidence: 0.6, contact: { email: 'hr@beta.example' } };
    await sequelize.query(`INSERT INTO inbox_events (event_id, message_id, type, payload, received_at) VALUES ('lc1', '<lc@x>', 'interview.detected', CAST(:p AS jsonb), NOW())`, { replacements: { p: JSON.stringify(payload) } });
    const [item] = await rows<{ id: string }>(`INSERT INTO placement_review_items (kind, source_event_id, enrollment_id) VALUES ('low_confidence', 'interview.detected:<lc@x>', '${E1}') RETURNING id`);
    await Promise.all([act.itemAction(String(item.id), 'make_interview', S(OFF)), act.itemAction(String(item.id), 'make_interview', S(OFF))]);
    expect(await rows("SELECT state FROM placement_interviews WHERE source_event_id = 'interview.detected:<lc@x>'")).toEqual([{ state: 'new' }]);
    expect(await rows(`SELECT status, resolved_by FROM placement_review_items WHERE id = ${item.id}`)).toEqual([{ status: 'resolved', resolved_by: 'staff-7' }]);
    expect(await audits('desk_make_interview')).toHaveLength(2);
  });

  it('Send test: off = 409 path, nothing sent, audited; on = one test, a second click the same Central day sends nothing new', async () => {
    expect(await svc.deskSendTest(E1, 'staff-7', OFF)).toMatchObject({ status: 'conflict', switchedOff: true });
    expect(mockSent.filter((k) => k.includes('inbox-test-'))).toHaveLength(0);
    expect(await svc.deskSendTest(E1, 'staff-7', ON)).toMatchObject({ status: 'ok', outcome: 'sent' });
    expect(await svc.deskSendTest(E1, 'staff-7', ON)).toMatchObject({ status: 'ok', outcome: 'already_today' });
    expect(mockSent.filter((k) => k.includes('inbox-test-'))).toHaveLength(1);
    expect((await audits('desk_send_test')).map((a) => a.payload.outcome)).toEqual(['switched_off', 'sent', 'already_today']);
    const h = await svc.inboxHealthList(OFF);
    expect(h.learners.map((l) => [l.enrollmentId, l.healthLabel])).toEqual([[E1, 'Forwarding healthy'], [E2, 'Not set up yet']]);
  });

  it('placements: the fee rate (110% by default), KPIs, invoice status and put forward, each once', async () => {
    const [o] = await rows<{ id: string }>(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id, company, role, pay_basis, salary_cents, first_year_cents,
      fee_rate_bp, fee_cents, fee_agreed_at, agreed_by, agreement_text_version, status, created_by) VALUES (gen_random_uuid(), 1, gen_random_uuid(), '${E1}', 'Acme', 'Analyst',
      'yearly', 10500000, 10500000, 11000, 11550000, NOW(), 'pat', 'f7', 'accepted', 'pat') RETURNING id`);
    const [inv] = await rows<{ id: string }>(`INSERT INTO placement_invoices (offer_id, enrollment_id, fee_cents) VALUES ('${o.id}', '${E1}', 11550000) RETURNING id`);
    const [cl] = await rows<{ id: string }>("INSERT INTO hire_clients (name, created_by) VALUES ('Acme Corp', 'staff') RETURNING id");
    for (const [status, fee] of [['sent', 5500000], ['talk_first', 100], ['declined', 999900]] as const) {
      await sequelize.query(`INSERT INTO placement_offers (offer_group_id, version, client_key, enrollment_id, company, role, pay_basis, salary_cents, first_year_cents,
        fee_rate_bp, fee_cents, fee_agreed_at, agreed_by, agreement_text_version, status, created_by) VALUES (gen_random_uuid(), 1, gen_random_uuid(), '${E1}', 'Beta', 'Dev',
        'yearly', 5000000, 5000000, 11000, ${fee}, NOW(), 'pat', 'f7', '${status}', 'pat')`);
    }
    const p = await svc.placements(async () => null);
    expect(p).toMatchObject({ feeRate: { rate: 1.1, label: '110%' }, kpis: { openOffers: 2, accepted: 1, feesPending: '$55,001', fees: '$115,500' }, clients: [{ name: 'Acme Corp', candidates: 0 }] });
    expect(p.offers.find((x) => x.offerId === String(o.id))).toMatchObject({ fee: '$115,500', invoice: { status: 'not_invoiced' } });
    expect(await svc.setInvoiceStatus(String(inv.id), 'invoiced', 'staff-7')).toMatchObject({ outcome: 'changed' });
    expect(await svc.setInvoiceStatus(String(inv.id), 'invoiced', 'staff-7')).toMatchObject({ outcome: 'unchanged' });
    expect(await svc.putForward(String(cl.id), E1, 'staff-7')).toMatchObject({ outcome: 'added' });
    expect(await svc.putForward(String(cl.id), E1, 'staff-7')).toMatchObject({ outcome: 'already' });
    expect(await rows(`SELECT put_forward_by FROM hire_client_candidates WHERE client_id = '${cl.id}'`)).toEqual([{ put_forward_by: 'staff-7' }]);
    expect((await svc.placements(async () => null)).kpis.invoiced).toBe('$115,500');
  });
});
