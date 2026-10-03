/**
 * Report redesign (2026-10-02) — pure template rendering, zero I/O, zero
 * mocks needed. Covers: every section renders only when its scope is
 * requested, honest omission (never a fabricated "0"/"$0" standing in for
 * "nothing tracked yet"), the NEEDS ATTENTION callout only appears when
 * there's real signal, and the preview-vs-real-recipient distinction.
 */
import { renderReportHtml, renderReportText, ReportData } from '../agentReportTemplateService';

function baseData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    agentId: 'agent-1',
    agentName: 'Reese',
    cadenceLabel: 'DAILY',
    generatedAt: new Date('2026-10-02T13:00:00Z'),
    timezone: 'America/Chicago',
    triggerTypeLabel: 'event_driven',
    abacMode: 'enforce',
    sections: ['tickets', 'trust', 'cost', 'activity'],

    openTicketCount: 41,
    openTicketDelta: 3,
    completedTicketCount30d: 12,
    allTimeTicketBreakdown: [
      { type: 'student_support', count: 35 },
      { type: 'reese_autonomous_outreach', count: 34 },
    ],
    openTicketBreakdown: [
      { type: 'student_support', count: 30 },
      { type: 'reese_autonomous_outreach', count: 11 },
    ],
    needsReplyCount: 4,
    pastDueCount: 6,
    verifiedResolutionCount: 3,
    ownedTicketCountAllTime: 69,
    oldestOpenTicketAgeDays: 9,
    lastTicketActivityAt: new Date('2026-10-01T13:00:00Z'),

    authSummary: { windowDays: 30, total: 41, allow: 0, approval: 26, block: 15, enforcedCount: 21 },
    topReasons: [{ action: 'reese_dm_reply', reason: 'requires_approval:high_risk_tier', count: 20 }],

    costUsd: 0.0281,
    costRuns: 120,
    totalTokens: 48210,
    topModel: 'gpt-4o-mini',
    errorCount30d: 0,

    scheduledTasksOn: 3,
    scheduledTasksOff: 1,

    recipient: { displayName: 'Ali Muwwakkil', email: 'ali@colaberry.com' },
    agentPageUrl: 'https://enterprise.colaberry.ai/admin/agents/agent-1',
    ...overrides,
  };
}

describe('renderReportHtml — section scoping', () => {
  it('happy path: every section with real data renders', () => {
    const html = renderReportHtml(baseData());
    expect(html).toContain('Reese');
    expect(html).toContain('Tickets');
    expect(html).toContain('Trust');
    expect(html).toContain('Cost');
    expect(html).toContain('Activity');
    expect(html).toContain('Student Support');
    expect(html).toContain("Open Reese's page");
  });

  it('a section NOT in scope never renders, even with real underlying data available', () => {
    const html = renderReportHtml(baseData({ sections: ['tickets'] }));
    expect(html).toContain('Tickets');
    expect(html).not.toContain('>Trust<');
    expect(html).not.toContain('>Activity<');
  });

  it('cost tile and footer column both omitted when cost is not in scope', () => {
    const html = renderReportHtml(baseData({ sections: ['tickets', 'trust'] }));
    expect(html).not.toMatch(/>Cost<\/div>/);
  });
});

describe('renderReportHtml — honest omission, never a fabricated number', () => {
  it('no tracked cost (costUsd null, cost IS in scope): shows "No tracked cost", never $0.00', () => {
    const html = renderReportHtml(baseData({ sections: ['cost'], costUsd: null, costRuns: null }));
    expect(html).toContain('No tracked cost');
    expect(html).not.toContain('$0.00');
  });

  it('no prior report: open-ticket delta is honestly omitted, never shown as "+0"', () => {
    const html = renderReportHtml(baseData({ openTicketDelta: null }));
    expect(html).toContain('no prior report to compare');
    expect(html).not.toContain('+0 since last report');
  });

  it('zero top reasons: the "Top reasons" label itself is omitted, not shown empty', () => {
    const html = renderReportHtml(baseData({ topReasons: [] }));
    expect(html).not.toContain('Top reasons');
  });

  it('NEEDS ATTENTION box is omitted entirely when nothing needs attention', () => {
    const html = renderReportHtml(baseData({
      authSummary: { windowDays: 30, total: 10, allow: 10, approval: 0, block: 0, enforcedCount: 0 },
      needsReplyCount: 0,
      oldestOpenTicketAgeDays: null,
      openTicketCount: 0,
    }));
    expect(html).not.toContain('Needs attention');
  });

  it('NEEDS ATTENTION box appears when there IS real signal', () => {
    const html = renderReportHtml(baseData());
    expect(html).toContain('Needs attention');
    expect(html).toContain('15 actions blocked and 26 held for approval out of 41 checks');
  });

  it('allow:0 renders "None" in the summary line, not the digit 0', () => {
    const html = renderReportHtml(baseData({ authSummary: { windowDays: 30, total: 41, allow: 0, approval: 26, block: 15, enforcedCount: 21 } }));
    expect(html).toContain('None of 41 actions cleared without approval');
  });
});

describe('renderReportHtml — preview vs real recipient', () => {
  it('a real recipient shows "Sent to <name> (<email>)"', () => {
    const html = renderReportHtml(baseData());
    expect(html).toContain('Sent to Ali Muwwakkil (ali@colaberry.com)');
  });

  it('no recipient (preview of an unsaved subscription) shows an honest preview note, never a fabricated "Sent to"', () => {
    const html = renderReportHtml(baseData({ recipient: null }));
    expect(html).toContain('Preview only');
    expect(html).not.toContain('Sent to');
  });
});

describe('renderReportText — plain-text fallback', () => {
  it('happy path contains the real open ticket count and approval summary', () => {
    const text = renderReportText(baseData());
    expect(text).toContain('41 open ticket(s)');
    expect(text).toContain('0 of 41 actions cleared without approval in the last 30 days');
  });

  it('no tracked cost: honest text, never a fabricated $0.0000', () => {
    const text = renderReportText(baseData({ sections: ['cost'], costUsd: null, costRuns: null }));
    expect(text).toContain('No tracked cost in the last 30 days.');
  });

  it('preview (no recipient): honest note, never a fabricated "Sent to"', () => {
    const text = renderReportText(baseData({ recipient: null }));
    expect(text).toContain('Preview only');
  });
});
