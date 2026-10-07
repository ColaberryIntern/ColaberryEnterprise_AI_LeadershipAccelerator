/**
 * COMPONENT E - brand preflight on the main email sender.
 *
 * emailService.ts is the one sender in this repo that was NOT gated by
 * mandrillPreflight.validateBeforeSend. 60+ one-off scripts in
 * backend/src/scripts/ call it; the service that sends enrollment, welcome,
 * magic-link, briefing and digest mail did not, so the highest-volume sender
 * had the weakest copy checks.
 *
 * This suite exists in three parts, in the order the work had to happen:
 *
 *   STEP 1 (MEASURE)  Run validateBeforeSend over every body emailService can
 *                     actually produce, captured at the transport boundary.
 *                     A gate switched on without this number is a gate that
 *                     starts refusing real mail with nobody knowing which.
 *   STEP 2 (FIX)      The measured failures are copy defects in the templates,
 *                     fixed in place. validateBeforeSend is NOT weakened.
 *   STEP 3 (GATE)     validateBeforeSend runs at guardedSendMail, the single
 *                     transport chokepoint, and THROWS.
 *
 * Why capture at the transport and not at the build* functions: several bodies
 * are produced by module-private builders (buildDigestHtml, buildConfirmationHtml,
 * buildOrgInviteHtml and so on) that are unreachable from a test. The transport
 * boundary sees the finished html/text of every template without exception,
 * which is the only place a claim of full coverage can honestly be made.
 */

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

const mockEnv = {
  mandrillApiKey: 'test-key', // non-empty so the module builds a (mocked) transporter
  smtpUser: '',
  smtpPass: '',
  smtpHost: 'smtp.example.com',
  smtpPort: 587,
  emailFrom: 'ali@colaberry.com',
  trainingWelcomeFromEmail: 'training@colaberry.com',
  trainingWelcomeFromName: 'Colaberry Training',
  frontendUrl: 'https://enterprise.colaberry.ai',
  // Present only so any transitive config/database import cannot construct a
  // Sequelize instance with an undefined URL at module scope.
  databaseUrl: 'postgres://u:p@localhost:5432/test',
  nodeEnv: 'test',
};
jest.mock('../../config/env', () => ({ env: mockEnv }));

const mockSendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (...a: unknown[]) => mockSendMail(...a) }) },
}));

jest.mock('../settingsService', () => ({
  getTestOverrides: jest.fn().mockResolvedValue({ enabled: false, email: '', phone: '' }),
  getSetting: jest.fn().mockResolvedValue('ali@colaberry.com'),
}));

const mockKillSwitch = jest.fn().mockResolvedValue(false);
jest.mock('../launchSafety', () => ({ isKillSwitchActive: (...a: unknown[]) => mockKillSwitch(...a) }));

// isDev false: applyDevEmailGuard passes options straight through, so what the
// transport receives is exactly what production would send.
jest.mock('../../config/featureFlags', () => ({ isDev: false }));

// internshipEmails (a blocker tripwire below) imports email/idempotentSend,
// which constructs Sequelize at module scope. Only its pure renderer is used
// here, so the ledger is mocked away rather than given a database.
jest.mock('../email/idempotentSend', () => ({
  sendOnce: jest.fn(),
  computeIdempotencyKey: jest.fn(),
}));

// sendSessionReminder writes an audit row through a LAZY require of
// communicationLogService, which pulls in the whole Sequelize model graph. The
// require is inside a try/catch so the failure is invisible, but it costs
// seconds per call and leaves an open connection pool that stops jest exiting.
// Mocked so the audit path is exercised without a database.
jest.mock('../communicationLogService', () => ({
  logCommunication: jest.fn().mockResolvedValue({ id: 'log-1' }),
}));

import * as emailService from '../emailService';

// The subject under test. Required, not imported, because mandrillPreflight is
// CommonJS with no type declarations.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { validateBeforeSend } = require('../../scripts/lib/mandrillPreflight');

const EM_DASH = '—';

/* ────────────────────────────────────────────────────────────────────────────
 * Fixtures. Realistic values, because a template only renders the branch its
 * data selects: an empty array renders the empty state and would hide whatever
 * copy defect lives in the populated branch. Where a template has a
 * conditional, the fixture takes the branch that produces MORE copy.
 * ──────────────────────────────────────────────────────────────────────────── */

const digestFixture = {
  generatedAt: new Date('2026-10-06T12:00:00Z'),
  period: 'daily' as const,
  revenue: {
    totalRevenue: 125000, totalEnrollments: 20, paidEnrollments: 14,
    pendingInvoice: 6, seatsRemaining: 5, upcomingCohorts: 2,
  },
  leads: {
    total: 300, thisMonth: 42, highIntent: 9, conversionRate: '7.1%',
    byStatus: { new: 12, contacted: 20, qualified: 10 },
  },
  pipeline: { discovery: 8, proposal: 4, closing: 2 },
  opportunities: {
    total_scored: 30, avg_score: 61.5,
    distribution: { hot: 5, warm: 12, cold: 13 },
    stall_counts: { high: 3, medium: 5, low: 2 },
    total_pipeline_value: 480000,
  },
  forecast: {
    total_projected_enrollments: 11,
    total_projected_revenue: 198000,
    weighted_pipeline_value: 143000,
  },
  atRisk: [{
    leadName: 'Dana Whitfield', company: 'Northwind Logistics', score: 74,
    stall_risk: 'high', stall_reason: 'No reply in 18 days', days_since_last_activity: 18,
  }],
  visitors: {
    total_visitors: 1420, total_sessions: 1890,
    avg_session_duration: 164, bounce_rate: 0.42,
  },
  highIntentCount: 9,
  appointments: [{
    title: 'Strategy call', scheduled_at: '2026-10-08T15:00:00Z',
    lead_name: 'Dana Whitfield', type: 'strategy_call',
  }],
};

const briefingFixture = {
  generatedAt: new Date('2026-10-06T12:00:00Z'),
  type: 'daily' as const,
  digest: digestFixture,
  alertSummary: { openCount: 4, criticalOpen: 1, last24h: 2, byType: { agent_error: 3, cost: 1 } },
  agentFleet: { total: 12, healthy: 10, errored: 2, paused: 0 },
  ticketSummary: { openCount: 7, resolvedLast24h: 3, criticalOpen: 1 },
  strategicInsights: {
    count: 2, critical: 1,
    items: [{ problem: 'Lead response latency rising', risk_tier: 'high', confidence: 0.82 }],
  },
  departmentReports: [],
  activeTasks: { total: 9 },
  // Present so the campaign branch renders rather than being skipped.
  campaignMetrics: {
    emailsSent: 2400, smsSent: 60, callsMade: 15,
    uniqueOpens: 900, openRate: '37.5%', uniqueClicks: 240, clickRate: '10.0%',
    replies: 18, advisorClicks: 30, demoStarts: 12, demoCompletes: 7,
    bookings: 3, unsubscribes: 4,
    byCampaign: [{ type: 'executive_outreach', sent: 1800 }, { type: 'nurture_drip', sent: 600 }],
    topClickers: [{ name: 'Dana Whitfield', company: 'Northwind Logistics', title: 'VP Data', clicks: 6 }],
    advisorVisitors: [{ name: 'Marcus Reed', company: 'Helio Freight', pageviews: 9 }],
  },
};

const sessionReminderFixture = {
  to: 'student@example.com',
  fullName: 'Jordan Ellis',
  sessionId: 'f2a1c8d4-0000-4000-8000-000000000001',
  sessionTitle: 'Agent Orchestration Patterns',
  sessionNumber: 14,
  sessionDate: '2026-10-09',
  startTime: '18:30',
  meetingLink: 'https://zoom.us/j/1234567890',
  materialsJson: [{ title: 'Lab handout', url: 'https://example.com/lab.pdf' }],
  isOneHour: true,
};

/**
 * Every exported sender in emailService, with a fixture that reaches the
 * transport. The list is asserted complete against the module's own exports
 * below, so a sender added later cannot quietly escape measurement.
 */
const SENDERS: Array<{ name: string; run: () => Promise<unknown> }> = [
  { name: 'sendCommunityReplyEmail', run: () => emailService.sendCommunityReplyEmail({
    to: 'member@example.com', recipientName: 'Jordan Ellis', actorName: 'Marcus Reed',
    preview: 'That matches what we saw in the lab run.', postId: 'p-1', onOwnPost: true, eventId: 'c-1',
  }) },
  { name: 'sendTrainingWelcome', run: () => emailService.sendTrainingWelcome({
    to: 'new@example.com', fullName: 'Jordan Ellis', portalLink: 'https://enterprise.colaberry.ai/portal?token=x',
  }) },
  { name: 'sendEnrollmentConfirmation', run: () => emailService.sendEnrollmentConfirmation({
    to: 'student@example.com', fullName: 'Jordan Ellis', cohortName: 'Cohort 12',
    startDate: 'October 20, 2026', coreDay: 'Thursday', coreTime: '6:30 PM CT', optionalLabDay: 'Saturday',
  } as never) },
  { name: 'sendInvoiceRequestConfirmation', run: () => emailService.sendInvoiceRequestConfirmation({
    to: 'ap@example.com', fullName: 'Jordan Ellis', cohortName: 'Cohort 12',
    startDate: 'October 20, 2026', coreDay: 'Thursday', coreTime: '6:30 PM CT', optionalLabDay: 'Saturday',
  } as never) },
  { name: 'sendInterestEmail', run: () => emailService.sendInterestEmail({
    to: 'lead@example.com', fullName: 'Jordan Ellis',
  } as never) },
  { name: 'sendExecutiveOverviewEmail', run: () => emailService.sendExecutiveOverviewEmail({
    to: 'exec@example.com', fullName: 'Dana Whitfield',
  } as never) },
  { name: 'sendHighIntentAlert', run: () => emailService.sendHighIntentAlert({
    name: 'Dana Whitfield', company: 'Northwind Logistics', title: 'VP Data',
    email: 'dana@example.com', phone: '555-0100', score: 88, source: 'advisor',
  } as never) },
  { name: 'sendNewLeadAlert', run: () => emailService.sendNewLeadAlert({
    lead: {
      id: 101, name: 'Dana Whitfield', email: 'dana@example.com', phone: '555-0100',
      company: 'Northwind Logistics', title: 'VP Data', source: 'website', message: 'Interested in the accelerator.',
    } as never,
    convertUrl: 'https://enterprise.colaberry.ai/admin/leads/101',
  }) },
  { name: 'sendSponsorshipKitEmail', run: () => emailService.sendSponsorshipKitEmail({
    to: 'sponsor@example.com', fullName: 'Marcus Reed', company: 'Helio Freight', scoreTier: 'gold',
  } as never) },
  { name: 'sendStrategyCallConfirmation', run: () => emailService.sendStrategyCallConfirmation({
    to: 'lead@example.com', name: 'Dana Whitfield', scheduledAt: new Date('2026-10-08T15:00:00Z'),
    timezone: 'America/Chicago', meetLink: 'https://meet.google.com/abc-defg-hij', prepToken: 'tok-1',
  } as never) },
  { name: 'sendIntelligenceBrief', run: () => emailService.sendIntelligenceBrief({
    name: 'Dana Whitfield', email: 'dana@example.com', company: 'Northwind Logistics',
    completionScore: 82, aiMaturity: 'piloting', timeline: '2 quarters',
    challenges: ['Data quality', 'Change management'], tools: ['Snowflake', 'Azure'],
    budgetRange: '$250k-$500k', evaluatingConsultants: true,
    priorityUseCase: 'Forecast accuracy', specificQuestions: 'How do you staff this internally?',
    uploadedFileName: 'strategy.pdf', aiSynthesis: 'Strong fit for the architecture track.',
    aiConfidenceScore: 0.78, aiRecommendedFocus: ['Architecture', 'Governance'], leadId: 101,
  }) },
  { name: 'sendDigestEmail', run: () => emailService.sendDigestEmail(digestFixture as never) },
  { name: 'sendSessionReminder', run: () => emailService.sendSessionReminder(sessionReminderFixture) },
  { name: 'sendMissedSessionEmail', run: () => emailService.sendMissedSessionEmail({
    to: 'student@example.com', fullName: 'Jordan Ellis', sessionTitle: 'Agent Orchestration Patterns',
    sessionNumber: 14, sessionDate: '2026-10-02', recordingUrl: 'https://example.com/rec',
    materialsJson: [{ title: 'Lab handout', url: 'https://example.com/lab.pdf' }], consecutiveMisses: 2,
  } as never) },
  { name: 'sendAbsenceAlert', run: () => emailService.sendAbsenceAlert({
    enrollmentName: 'Jordan Ellis', enrollmentEmail: 'student@example.com',
    enrollmentCompany: 'Northwind Logistics', cohortName: 'Cohort 12',
    consecutiveMisses: 3, missedSessions: ['Session 12', 'Session 13', 'Session 14'],
  } as never) },
  { name: 'sendPortalMagicLink', run: () => emailService.sendPortalMagicLink({
    to: 'student@example.com', fullName: 'Jordan Ellis', token: 'tok-magic',
    cohortName: 'Cohort 12', next: '/portal/class-checkin/abc',
  } as never) },
  { name: 'sendOrgInviteEmail', run: () => emailService.sendOrgInviteEmail({
    to: 'teammate@example.com', fullName: 'Marcus Reed', orgName: 'Helio Freight', token: 'tok-invite',
  } as never) },
  { name: 'sendOrgWelcomeEmail', run: () => emailService.sendOrgWelcomeEmail({
    to: 'owner@example.com', fullName: 'Marcus Reed', orgName: 'Helio Freight', hasRealCompanyName: true,
  } as never) },
  { name: 'sendAdmissionsDocument', run: () => emailService.sendAdmissionsDocument({
    to: 'lead@example.com', name: 'Dana Whitfield', documentType: 'executive_briefing',
    documentContent: 'A short overview of the programme.',
  } as never) },
  { name: 'sendAlertEmail', run: () => emailService.sendAlertEmail('ops@example.com', {
    type: 'agent_error', severity: 4, title: 'Reese outreach agent errored',
    description: 'Three consecutive failures on the Apollo enrichment step.',
    impact_area: 'outreach', source_type: 'agent', urgency: 'high', created_at: new Date('2026-10-06T11:00:00Z'),
  }) },
  { name: 'sendTicketApprovalEmail', run: () => emailService.sendTicketApprovalEmail({
    ticketId: 'c9b1f0e2-0000-4000-8000-000000000002', replyToken: 'tok-reply',
    title: 'Publish the October case study',
    // Supplied so the safeDescription branch renders rather than collapsing to ''.
    description: 'Draft is ready for review. Second paragraph.',
    directorName: 'Sohail Syed',
  }) },
  { name: 'sendTicketReplyConfirmation', run: () => emailService.sendTicketReplyConfirmation({
    to: 'ali@colaberry.com', ticketNumber: 4821, title: 'Publish the October case study', outcome: 'done',
  }) },
  { name: 'sendRawEmail', run: () => emailService.sendRawEmail({
    to: ['ops@example.com'], subject: 'Incident fanout',
    html: '<p>An incident was opened.</p>', text: 'An incident was opened.',
  } as never) },
  { name: 'sendBriefingEmail', run: () => emailService.sendBriefingEmail('ali@colaberry.com', briefingFixture as never) },
  { name: 'sendCurriculumImpactDigest', run: () => emailService.sendCurriculumImpactDigest('ops@example.com', [{
    url: 'https://example.com/week-9', content_type: 'lesson', score: 72,
    severity: 'high', rationale: 'Lab steps no longer match the deck.',
  }] as never) },
  { name: 'sendInterviewResult', run: () => emailService.sendInterviewResult({
    to: 'student@example.com', full_name: 'Jordan Ellis', week_number: 9,
    total_score: 84, feedback: 'Strong architecture reasoning. Tighten the cost model.',
  }) },
  { name: 'sendCommunityDigestEmail', run: () => emailService.sendCommunityDigestEmail({
    to: 'member@example.com', fullName: 'Jordan Ellis', digestDate: '2026-10-06',
    unreadNotificationCount: 3, unreadDmCount: 2, newPostCount: 5,
    upcomingEvents: [{ title: 'Open House', event_type: 'open_house', starts_at: new Date('2026-10-08T23:00:00Z') }],
  } as never) },
  { name: 'sendSponsorMagicLink', run: () => emailService.sendSponsorMagicLink({
    to: 'sponsor@example.com', contactName: 'Marcus Reed',
    companyName: 'Helio Freight', token: 'tok-sponsor',
  } as never) },
  { name: 'sendDeliveryClientMagicLink', run: () => emailService.sendDeliveryClientMagicLink({
    to: 'client@example.com', displayName: 'Dana Whitfield',
    brandName: 'Northwind Logistics', token: 'tok-client',
  } as never) },
];

type Measured = {
  sender: string;
  bodies: number;
  subjects: string[];
  failures: string[];
  threw: string | null;
};

/** Invoke one sender and preflight every body it hands to the transport. */
async function measure(entry: { name: string; run: () => Promise<unknown> }): Promise<Measured> {
  mockSendMail.mockReset();
  mockSendMail.mockResolvedValue({ messageId: 'mid-1', accepted: ['x@example.com'], rejected: [] });

  let threw: string | null = null;
  try {
    await entry.run();
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }

  const failures: string[] = [];
  const subjects: string[] = [];
  for (const call of mockSendMail.mock.calls) {
    const options = call[0] as { html?: string; text?: string; subject?: string };
    subjects.push(String(options.subject ?? ''));
    try {
      validateBeforeSend(options.html ?? '', options.text ?? '');
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { sender: entry.name, bodies: mockSendMail.mock.calls.length, subjects, failures, threw };
}

const repoRoot = (): string => require('path').join(__dirname, '..', '..', '..', '..');
const readRepoFile = (rel: string): string =>
  require('fs').readFileSync(require('path').join(repoRoot(), rel), 'utf8');

describe('Component E - emailService brand preflight', () => {
  beforeEach(() => {
    mockKillSwitch.mockReset().mockResolvedValue(false);
  });

  /* ── STEP 1: the measurement, and the regression guard it becomes ───────── */

  describe('step 1: measurement over every producible body', () => {
    let results: Measured[];

    // 30 senders, each awaiting settings and recipient resolution: comfortably
    // past jest's 5s default for a hook.
    beforeAll(async () => {
      results = [];
      for (const entry of SENDERS) results.push(await measure(entry));
    }, 120000);

    /**
     * The anti-theatre assertion. Without it, a sender whose fixture is too thin
     * to reach the transport would contribute zero bodies and zero failures, and
     * the suite would report a clean preflight it never actually ran. "No
     * failures" has to mean "checked and clean", never "never checked".
     */
    it('every sender actually reached the transport, so the measurement is complete', () => {
      const unmeasured = results
        .filter(r => r.bodies === 0)
        .map(r => r.sender + ' (threw: ' + (r.threw ?? 'no send') + ')');
      expect(unmeasured).toEqual([]);
    });

    it('the sender table covers every exported sender in the module', () => {
      const exported = Object.keys(emailService)
        .filter(k => k.startsWith('send') && typeof (emailService as Record<string, unknown>)[k] === 'function')
        .sort();
      expect(SENDERS.map(s => s.name).sort()).toEqual(exported);
    });

    /**
     * STEP 1 RESULT, after the STEP 2 copy fixes.
     *
     * The measurement found six failing senders, all em-dash, all in bodies this
     * file owns except one: sendTrainingWelcome, sendOrgInviteEmail,
     * sendTicketApprovalEmail, sendTicketReplyConfirmation and
     * sendCommunityDigestEmail were fixed in place. sendNewLeadAlert was not:
     * its body is built by services/leadAlertMessage.ts.
     *
     * sendNewLeadAlert is why the gate is not enabled. It is also why grepping
     * this file would not have been enough - there is no em-dash in
     * emailService.ts on that path at all, the defect arrives through an import.
     */
    it('no body emailService itself produces fails the preflight', () => {
      const failing = results
        .filter(r => r.failures.length > 0 && r.sender !== 'sendNewLeadAlert')
        .map(r => ({ sender: r.sender, failures: r.failures }));
      expect(failing).toEqual([]);
    });

    /**
     * validateBeforeSend(html, text) takes no subject, so subjects are
     * structurally outside the preflight for every one of its 60+ callers. Two
     * of this file's subjects carried em-dashes. Rather than widen the shared
     * validator (which would change behaviour for all those callers at once),
     * the subject rule is enforced here, for this file only.
     */
    it('no subject emailService itself produces contains an em-dash', () => {
      const dirty = results
        // sendNewLeadAlert excluded for the same reason as the body assertion
        // above: its subject is built by leadAlertMessage.ts:97, and the
        // BLOCKER 2 tripwire below is what reports it.
        .filter(r => r.sender !== 'sendNewLeadAlert')
        .flatMap(r => r.subjects.map(s => ({ sender: r.sender, subject: s })))
        .filter(x => x.subject.includes(EM_DASH));
      expect(dirty).toEqual([]);
    });
  });

  /* ── STEP 3 precondition: the preflight behaves as a chokepoint gate ────── */

  describe('step 3 precondition: validateBeforeSend on the exact arguments the chokepoint would pass', () => {
    const asChokepoint = (options: { html?: string; text?: string }) =>
      validateBeforeSend(options.html ?? '', options.text ?? '');

    it('happy path: a clean body passes', () => {
      expect(() => asChokepoint({ html: '<p>All good here.</p>', text: 'All good here.' })).not.toThrow();
    });

    it('failure path: an em-dash in the html throws', () => {
      expect(() => asChokepoint({ html: '<p>Hello ' + EM_DASH + ' goodbye.</p>', text: 'Hello - goodbye.' }))
        .toThrow(/Em-dash/);
    });

    it('failure path: an em-dash in the text body alone throws', () => {
      expect(() => asChokepoint({ html: '<p>Hello - goodbye.</p>', text: 'Hello ' + EM_DASH + ' goodbye.' }))
        .toThrow(/Em-dash/);
    });

    it('failure path: a duplicated branded signature throws', () => {
      const sig = '<p>200 Chisholm Place, Plano TX</p>';
      expect(() => asChokepoint({ html: '<p>Body.</p>' + sig + sig, text: 'Body.' }))
        .toThrow(/duplicate signature/);
    });

    /**
     * Boundary. Several alert paths send with no text body, and a bare
     * notification can send with neither. The chokepoint coalesces both to ''
     * before calling, so absent bodies must read as clean rather than throwing
     * on undefined.
     */
    it('boundary: absent html and absent text are treated as clean, not as an error', () => {
      expect(() => asChokepoint({})).not.toThrow();
    });

    /**
     * Idempotency. countSignatureBlocks builds /g regexes; a shared one carries
     * lastIndex between calls and would make the second identical send disagree
     * with the first. Same input twice must give the same verdict twice.
     */
    it('idempotency: the same clean body passes on both of two consecutive calls', () => {
      const options = { html: '<p>200 Chisholm Place, Plano TX</p>', text: 'Plain body.' };
      expect(() => asChokepoint(options)).not.toThrow();
      expect(() => asChokepoint(options)).not.toThrow();
    });

    it('idempotency: the same dirty body is refused on both of two consecutive calls', () => {
      const options = { html: '<p>Hello ' + EM_DASH + ' goodbye.</p>', text: 'clean' };
      expect(() => asChokepoint(options)).toThrow(/Em-dash/);
      expect(() => asChokepoint(options)).toThrow(/Em-dash/);
    });
  });

  /* ── STEP 3 state: present, disabled, honestly documented ──────────────── */

  describe('step 3 state: the gate is staged at the chokepoint but not enabled', () => {
    const source = (): string => readRepoFile('backend/src/services/emailService.ts');

    it('guardedSendMail is still the single transport handoff, so one call would gate everything', () => {
      const calls = source().match(/transporter!?\.sendMail\(/g) ?? [];
      expect(calls).toHaveLength(1);
    });

    it('the staged call sits inside guardedSendMail and is commented, not live', () => {
      const src = source();
      const guarded = src.slice(src.indexOf('export async function guardedSendMail'));
      const body = guarded.slice(0, guarded.indexOf('\n}'));
      expect(body).toContain("// validateBeforeSend(options.html ?? '', options.text ?? '');");
      expect(src).not.toMatch(/^\s*validateBeforeSend\(/m);
    });

    it('the staged call names all three blockers, so the comment cannot drift from the report', () => {
      const src = source();
      expect(src).toContain('leadAlertMessage.ts:97');
      expect(src).toContain('internshipEmails.ts:107,121,138,152,162');
      expect(src).toContain('allowJs');
    });

    /**
     * BLOCKER 1, as an executable guard on production boot.
     *
     * mandrillPreflight is a .js file; backend/tsconfig.json sets no "allowJs",
     * so tsc never emits it to dist/. The runtime image copies only
     * /app/backend/dist and starts `node dist/server.js`, so a module-scope
     * require of it from a compiled service resolves to a path that does not
     * exist and the backend dies on boot.
     *
     * This test is the only thing standing between that and a green CI run:
     * ts-jest resolves from src/, where the file IS present, so every other test
     * in this suite would pass while production failed to start.
     */
    it('emailService does not require mandrillPreflight at module scope, which would not resolve in dist', () => {
      expect(source()).not.toMatch(/^\s*(const|import)[^\n]*mandrillPreflight/m);
    });

    it('the deploy blocker is real: no allowJs, and the preflight exists only as .js', () => {
      const tsconfig = JSON.parse(readRepoFile('backend/tsconfig.json'));
      expect(tsconfig.compilerOptions.allowJs).toBeUndefined();

      const fs = require('fs');
      const path = require('path');
      const libDir = path.join(repoRoot(), 'backend', 'src', 'scripts', 'lib');
      const variants = fs.readdirSync(libDir).filter((f: string) => f.startsWith('mandrillPreflight'));
      expect(variants).toEqual(['mandrillPreflight.js']);
    });
  });

  /* ── Blocker tripwires: these go RED when the blocker is FIXED ──────────── */

  describe('blocker tripwires - a failure here means the blocker is cleared, so enable the gate', () => {
    /**
     * Each test below asserts that a body OUTSIDE this component's file ownership
     * still fails the preflight. That is a ratchet, not a celebration of the bug:
     * the moment someone fixes the copy, the matching test fails and its name
     * says what to do about it.
     */
    it('BLOCKER 2 leadAlertMessage still fails the preflight (when this goes red, enable the gate)', () => {
      const { buildLeadAlert } = require('../leadAlertMessage');
      const alert = buildLeadAlert(
        {
          id: 101, name: 'Dana Whitfield', email: 'dana@example.com', phone: '555-0100',
          company: 'Northwind Logistics', title: 'VP Data', source: 'website',
          message: 'Interested in the accelerator.',
        },
        { convertUrl: 'https://enterprise.colaberry.ai/admin/leads/101' },
      );
      expect(() => validateBeforeSend(alert.html, alert.text)).toThrow(/Em-dash/);
    });

    it.each([
      ['decision_approved', 'capacity_or_timing'],
      ['decision_rejected', 'experience_gap'],
      ['decision_waitlisted', 'capacity_or_timing'],
    ])('BLOCKER 3 internshipEmails %s still fails the preflight (when this goes red, enable the gate)', (template, reasonCode) => {
      const { renderDecisionEmail } = require('../internship/internshipEmails');
      const rendered = renderDecisionEmail({
        template,
        firstName: 'Jordan',
        reasonCode,
        studentMessage: 'We will revisit this next cohort.',
        conditions: 'Complete the onboarding checklist.',
        nowMs: Date.parse('2026-10-06T12:00:00Z'),
      });
      expect(() => validateBeforeSend(rendered.html, rendered.text)).toThrow(/Em-dash/);
    });
  });

  /* ── Soft-fail inventory: the gate that silently turns itself off ──────── */

  describe('soft-fail preflight requires - a missing preflight must crash, not disable the check', () => {
    /**
     * Two senders wrap the preflight require in a try/catch whose fallback is
     * `validateBeforeSend: () => {}`. A deploy that misses one file therefore
     * turns the check off while the call site still reads as protected, which is
     * the worst of both states: no enforcement and no signal.
     *
     * Both files are outside this component's ownership, so they are reported
     * here rather than edited. These tests fail once the soft-fail is removed,
     * which is the signal to delete them.
     */
    it.each([
      ['scripts/sendPrReviewDigest.js'],
      ['scripts/ops-engine/cb-system-handler.js'],
    ])('%s still soft-fails the preflight into a no-op stub', (rel) => {
      expect(readRepoFile(rel)).toMatch(/validateBeforeSend[\s\S]{0,40}=>\s*\{\s*\}/);
    });

    it('emailService itself has no soft-fail fallback for the preflight', () => {
      expect(readRepoFile('backend/src/services/emailService.ts'))
        .not.toMatch(/validateBeforeSend[\s\S]{0,40}=>\s*\{\s*\}/);
    });
  });
});
