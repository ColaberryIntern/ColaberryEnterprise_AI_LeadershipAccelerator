/**
 * Career Prep v27, CP11.1b: the staff interview desk API (/api/admin/placement/desk) for the browser checks, answered
 * in-process from fixtures by Playwright route interception, in the server's shapes (backend/src/routes/careerDeskSchemas.ts)
 * and with the server's own messages (careerDeskActions.ts / careerDeskService.ts). Nothing here can reach a real server.
 * Every POST is recorded (`state.posts`), so a check can count sends; every body served is recorded (`sent`), so a check
 * can scan for a meeting link. /api/admin/me makes the viewer a staff member with the `placement` section only.
 */
const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-1111-4111-8111-111111111111';
const IV = '33333333-1111-4111-8111-111111111111';

function makeDesk(now) {
  const iso = (h) => new Date(now - h * 3_600_000).toISOString();
  return {
    posts: [],
    overview: { recruiters: [{ name: 'Karthik' }, { name: 'Vivek' }], switches: { employerMail: 'off', inboxTests: 'off' },
      recording: { status: 'scope_missing', note: 'Recording unavailable: Zoom permission missing', since: iso(20) }, heldNote: 'A booking link is held when employer email was switched off when it was due, or when the switch could not be read at that moment. A held link is never sent later on its own: it waits here until you send it.' },
    items: [
      { source: 'item', id: '41', kind: 'low_confidence', title: 'Low confidence: is this an interview?', detail: null, learner: 'Ann Lee', enrollmentId: E1, interviewId: null,
        company: 'Cedar Credit Union', position: null, subject: 'Quick chat this week?', confidence: 0.78, since: iso(3), needsContact: false, related: [],
        actions: [{ action: 'make_interview', label: 'Send booking link' }, { action: 'dismiss', label: 'Not an interview' }] },
      { source: 'item', id: '43', kind: 'unmatched_learner', title: 'No learner matched this email', detail: null, learner: null, enrollmentId: null, interviewId: null,
        company: 'Atlas Manufacturing', position: null, subject: 'Interview availability', confidence: 0.94, since: iso(2), needsContact: false, related: [],
        actions: [{ action: 'match', label: 'Match and send' }, { action: 'dismiss', label: 'Not an interview' }] },
      { source: 'interview', id: IV, kind: 'no_contact', title: 'No employer email to reply to', detail: 'No employer email on file: add one to send the booking link.',
        learner: 'Bo Kim', enrollmentId: E2, interviewId: IV, company: 'Harbor Insurance', position: 'Data Analyst', subject: null, confidence: 0.9, since: iso(1), needsContact: true,
        related: [], actions: [{ action: 'send_link', label: 'Send booking link' }, { action: 'not_interview', label: 'Not an interview' }] },
    ],
    held: [{ interviewId: '44444444-1111-4111-8111-111111111111', learner: 'Ann Lee', enrollmentId: E1, company: 'Meridian Freight', position: 'AI Operations Associate',
      hasContact: true, heldAt: iso(26), heldLabel: 'Fri, Nov 20, 9:00 AM', action: { action: 'send_link', label: 'Send booking link' } }],
    inboxes: { testsSwitch: 'off', learners: [
      { enrollmentId: E1, learner: 'Ann Lee', address: 'ann.lee.careers@gmail.com', health: 'healthy', healthLabel: 'Healthy', lastForwardedAt: iso(1), lastForwardedLabel: 'Sun, Nov 22, 3:00 AM',
        last30Days: 14, lastTestAt: null, lastTestMs: null, confirmationPending: false, canSendTest: true },
      { enrollmentId: E2, learner: 'Bo Kim', address: 'bo.kim.careers@gmail.com', health: 'setup', healthLabel: 'Not set up yet', lastForwardedAt: null, lastForwardedLabel: null,
        last30Days: 0, lastTestAt: null, lastTestMs: null, confirmationPending: true, canSendTest: true },
    ] },
    bookings: { recording: { status: 'scope_missing', note: 'Recording unavailable: Zoom permission missing', since: iso(20) }, bookings: [
      { interviewId: '55555555-1111-4111-8111-111111111111', enrollmentId: E1, learner: 'Ann Lee', company: 'Northwind', position: 'ML Engineer', type: 'recruiter',
        typeLine: 'Recruiter screen, 30 min, with Pat Doe', interviewers: ['Pat Doe'], startsAt: new Date(now + 48 * 3_600_000).toISOString(), startsLabel: 'Tue, Nov 24, 2:00 PM',
        minutes: 30, state: 'booked', stateLabel: 'Booked', recording: 'Not recorded: Zoom permission missing' },
    ] },
    placements: { feeRate: { rate: 1.1, label: '110%' }, kpis: { openOffers: 1, accepted: 1, feesPending: '$115,500', fees: '$118,976', invoiced: '$0', paid: '$0' },
      offers: [
        { offerId: '66666666-1111-4111-8111-111111111111', enrollmentId: E1, learner: 'Ann Lee', client: 'Meridian Freight', company: 'Meridian Freight', role: 'AI Operations Associate',
          pay: '$52.00 an hour, 40 h a week', firstYear: '$108,160', feeRate: '110%', fee: '$118,976', feeCents: 11897600, status: 'accepted', statusLabel: 'Accepted',
          startDate: '2026-12-07', sentAt: iso(30), invoice: { id: '9', status: 'not_invoiced', statusLabel: 'Not invoiced' } },
        { offerId: '77777777-1111-4111-8111-111111111111', enrollmentId: E2, learner: 'Bo Kim', client: null, company: 'Orbit Retail', role: 'Data Analyst', pay: '$105,000 a year',
          firstYear: '$105,000', feeRate: '110%', fee: '$115,500', feeCents: 11550000, status: 'sent', statusLabel: 'Sent', startDate: null, sentAt: iso(5), invoice: null },
      ],
      clients: [{ id: '88888888-1111-4111-8111-111111111111', name: 'Meridian Freight', candidates: 1 }] },
  };
}

/** One desk request: [status, body]. Mirrors the server's answers for the actions the checks use. */
function deskRoute(st, method, p, body) {
  const D = '/api/admin/placement/desk';
  if (method === 'GET') {
    if (p === D) return [200, st.overview];
    if (p === `${D}/queue`) return [200, { items: st.items, held: st.held, heldNote: st.overview.heldNote }];
    if (p === `${D}/inboxes`) return [200, st.inboxes];
    if (p === `${D}/bookings`) return [200, st.bookings];
    if (p === `${D}/placements`) return [200, st.placements];
    return [404, { error: 'Not found' }];
  }
  st.posts.push({ path: p, body });
  const item = /\/review-items\/(\d+)\/actions$/.exec(p);
  if (item) {
    const it = st.items.find((x) => x.source === 'item' && x.id === item[1]);
    if (!it) return [200, { outcome: 'already_resolved', message: 'Already done; nothing changed.' }];
    st.items = st.items.filter((x) => x !== it);
    return body.action === 'make_interview' ? [200, { outcome: 'made', message: 'Interview made.', interviewId: IV }] : [200, { outcome: 'resolved', message: 'Done.' }];
  }
  if (/\/inboxes\/[^/]+\/test$/.test(p)) return st.overview.switches.inboxTests === 'on' ? [200, { outcome: 'sent', message: 'Test sent. It should arrive within 10 minutes.' }] : [409, { error: 'Inbox tests are switched off' }];
  if (/\/inboxes\/[^/]+\/forwarding$/.test(p)) {
    return body.action === 'open' ? [200, { outcome: 'opened', message: 'Open the link (or use the code) in Gmail, then mark it confirmed.', link: 'https://mail-settings.google.com/mail/vf-%5BDESK-E2E%5D', code: '987654321' }]
      : [200, { outcome: 'confirmed', message: 'Forwarding marked confirmed.' }];
  }
  if (/\/invoices\/[^/]+\/status$/.test(p)) return [200, { outcome: 'changed', message: 'Invoice status saved.' }];
  return [200, { outcome: 'sent', message: 'Booking link sent to the employer.' }];
}

async function installFakeDesk(page, now) {
  const st = makeDesk(now);
  const sent = [];
  await page.route('**/api/**', async (r) => {
    const req = r.request();
    const url = new URL(req.url());
    let out = [200, {}];
    if (url.pathname === '/api/admin/me') out = [200, { user: { role: 'admin' }, mgmt_role: null, sections: ['placement'], has_portal_account: false }];
    else if (url.pathname.startsWith('/api/admin/placement/desk')) out = deskRoute(st, req.method(), url.pathname, req.postDataJSON() || {});
    else if (req.method() === 'GET') out = [200, []];
    sent.push({ path: url.pathname, payload: out[1] });
    await r.fulfill({ status: out[0], contentType: 'application/json', body: JSON.stringify(out[1]) });
  });
  return { state: st, sent };
}

module.exports = { installFakeDesk, E1, E2, IV };
