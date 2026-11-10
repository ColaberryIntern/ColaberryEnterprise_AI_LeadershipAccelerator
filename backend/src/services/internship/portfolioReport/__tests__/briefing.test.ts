import { BRAND } from '../brand';
import { composeInternshipPortfolio } from '../compose';
import { renderDashboard } from '../dashboard/renderDashboard';
import { renderInternshipPortfolio } from '../render';
import { renderBriefing } from '../renderBriefing';
import { buildSidecar } from '../sidecar/build';
import { NOW, collected, daysAgo, rosterRow } from './fixtures';

function build() {
  const d = collected({
    roster: [rosterRow(), rosterRow({ enrollment_id: 'e2', name: 'Megan Doe', email: 'megan@example.com', project: null, day: 50 })],
    emails: [{ email: 'kal@example.com', subject: 'Can you review my plan?', snippet: '?', received_at: daysAgo(2) }],
  });
  const report = composeInternshipPortfolio(d, { now: NOW });
  const s = buildSidecar(report, { reportDate: '2026-11-09', previous: null, lastOutbound: [] });
  return { report, s, b: renderBriefing(report, s) };
}

describe('briefing: the email focuses on the 10 most impactful things', () => {
  it('lists every highlight in tour order, with its title and why', () => {
    const { s, b } = build();
    expect(s.highlights.length).toBeGreaterThan(0);
    let at = -1;
    for (const h of s.highlights) {
      const i = b.html.indexOf(h.title);
      expect(i).toBeGreaterThan(at);
      at = i;
    }
    expect(b.text).toContain(`1. ${s.highlights[0].title}`);
  });

  it('names the attached page and the JSON, and keeps Your move and everyone at a glance', () => {
    const { b } = build();
    expect(b.html).toContain('Open the attached internship-report-2026-11-09.html</strong> to take the guided tour');
    expect(b.html).toContain('internship-report-2026-11-09.json');
    expect(b.html).toContain('Your move');
    expect(b.html).toContain('Everyone at a glance');
    expect(b.html).toContain('Kalkidan Bezabeh');
  });

  it('carries the Colaberry header, same as the page', () => {
    const { report, s, b } = build();
    expect(b.html).toContain(`src="${BRAND.logoUrl}" alt="Colaberry"`);
    expect(renderDashboard(report, s)).toContain(`src="${BRAND.logoUrl}" alt="Colaberry"`);
  });

  it('keeps the subject the inbox manager keeps, and no em or en dashes anywhere', () => {
    const { report, b } = build();
    expect(b.subject).toBe(renderInternshipPortfolio(report).subject);
    expect(b.subject.startsWith("Ali, here's your Internship Report for ")).toBe(true);
    expect(/[—–]/.test(b.subject + b.html + b.text)).toBe(false);
  });

  it('a hostile highlight title is escaped', () => {
    const { report, s } = build();
    s.highlights[0].title = '<img src=x onerror=alert(1)>';
    expect(renderBriefing(report, s).html).not.toContain('<img src=x');
  });
});
