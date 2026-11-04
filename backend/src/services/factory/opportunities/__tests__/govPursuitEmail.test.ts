import { daysTone, daysUntil, fitTone, govPursuitSubject, qualifyUrl, renderGovPursuitEmail } from '../govPursuitEmail';
import type { BoardRow, DiscoveryBoard } from '../govDiscoveryBoard';

const TODAY = '2026-11-04';
const row = (stage: BoardRow['stage'], over: any = {}, vetting: any = null): BoardRow => ({
  stage, vetting, fromSnapshot: false,
  opportunity: { uuid: 'u1', title: 'Permitting Software', agency: 'City', closeDate: '2026-12-01', fitScore: 75, estimatedValue: 1, sourceUrl: 'https://city.bonfirehub.com/opportunities/1', ...over },
});
const board = (rows: BoardRow[], counts: any = {}): DiscoveryBoard => ({
  rows, dismissedCount: 0, assignedCount: 0, incomplete: false,
  counts: { needs_zip: 0, analyzing: 0, vetted: 0, needs_read: 0, approved: 0, flagged: 0, below_bar: 0, ...counts },
});
const html = (b: DiscoveryBoard, hidden: any[] = []) => renderGovPursuitEmail(b, hidden, TODAY);

describe('text it cannot control', () => {
  const longWord = 'X'.repeat(120);
  it('lets a long unbroken title, agency, reason and quote wrap, so the email stays phone width', () => {
    const out = html(board([row('vetted', { title: longWord, agency: longWord }, { reason: longWord, quote: longWord, coveragePct: 80 })]));
    const shown = out.match(new RegExp(`<div style="[^"]*"[^>]*>[^<]*${longWord}`, 'g')) ?? [];
    expect(shown).toHaveLength(4);
    for (const m of shown) expect(m).toContain('overflow-wrap:anywhere');
  });
  it('takes the em dash out of the AI reason, and leaves the source quote verbatim', () => {
    const out = html(board([row('vetted', {}, { reason: 'Strong match — no walls', quote: 'Vendor — must comply', coveragePct: 80 })]));
    expect(out).toContain('Strong match, no walls');
    expect(out).toContain('Vendor — must comply');
  });
  it('says when the fit is unknown', () => expect(html(board([row('needs_zip', { fitScore: null })]))).toContain('Fit unknown'));
});

describe('when saved data could not be read', () => {
  it('warns, and does not claim nothing was hidden when something was', () => {
    const out = html({ ...board([]), incomplete: true }, [{ opportunity: row('needs_zip').opportunity, reason: 'ai_not_a_fit' }]);
    expect(out).toContain('may be incomplete');
    expect(out).toContain('Hidden this morning');
    expect(out).not.toContain('nothing was hidden');
    expect(out).not.toContain('Nothing needs you today');
  });
  it('the subject does not say nothing needs you', () => {
    expect(govPursuitSubject({ ...board([]), incomplete: true })).toContain('check the board');
  });
});

describe('the upload section', () => {
  const out = html(board([row('needs_zip')], { needs_zip: 1 }));
  it('links to the proposal on Bonfire and to the upload page', () => {
    expect(out).toContain('href="https://city.bonfirehub.com/opportunities/1"');
    expect(out).toContain('1. Download ZIP on Bonfire');
    expect(out).toContain('2. Upload on Gov Opps');
  });
  it('the upload link carries the title and agency, so a new record is named', () => {
    expect(qualifyUrl('u1', 'A & B', 'City')).toContain(`gws=${encodeURIComponent('gws:u1')}&from=A%20%26%20B&agency=City`);
    expect(out).toContain('from=Permitting%20Software');
  });
  it('drops a non-http Bonfire link rather than rendering it', () => {
    const bad = html(board([row('needs_zip', { sourceUrl: 'javascript:alert(1)' })]));
    expect(bad).not.toContain('javascript:');
    expect(bad).not.toContain('Download ZIP on Bonfire');
    expect(bad).toContain('2. Upload on Gov Opps');
  });
});

describe('the vetted section', () => {
  it('stars the bid and shows the AI reason and quote', () => {
    const out = html(board([row('vetted', {}, { reason: 'Strong match.', quote: 'Vendor shall provide permitting.', coveragePct: 80 })], { vetted: 1 }));
    expect(out).toContain('⭐ Permitting Software');
    expect(out).toContain('Strong match.');
    expect(out).toContain('Vendor shall provide permitting.');
    expect(out).toContain('80% capability match');
  });
});

describe('escaping', () => {
  it('escapes feed and ZIP-derived text everywhere', () => {
    const evil = '<img src=x onerror=alert(1)>"\'';
    const out = html(
      board([row('vetted', { title: evil, agency: evil }, { reason: evil, quote: evil })]),
      [{ opportunity: row('needs_zip', { title: evil }).opportunity, reason: 'ai_not_a_fit' }],
    );
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});

describe('sections', () => {
  it('omits empty sections', () => {
    const out = html(board([row('needs_zip')], { needs_zip: 1 }));
    expect(out).not.toContain('Vetted: read these first');
    expect(out).not.toContain('Needs your read');
    expect(out).not.toContain('Hidden this morning');
  });
  it('an empty day still says so, with the analyzing count', () => {
    expect(html(board([]))).toContain('Nothing needs you today.');
    expect(html(board([], { analyzing: 3 }))).toContain('The AI is still working on 3.');
  });
  it('analyzing and flagged rows are never listed as work', () => {
    const out = html(board([row('analyzing', { title: 'Busy One' }), row('flagged', { title: 'Flagged One' })], { analyzing: 1, flagged: 1 }));
    expect(out).not.toContain('Busy One');
    expect(out).not.toContain('Flagged One');
  });
  it('sorts by nearest deadline', () => {
    const out = html(board([row('needs_zip', { title: 'Later', closeDate: '2026-12-30' }), row('needs_zip', { title: 'Sooner', closeDate: '2026-11-20' })]));
    expect(out.indexOf('Sooner')).toBeLessThan(out.indexOf('Later'));
  });
  it('caps a long upload list and points at the board', () => {
    const rows = Array.from({ length: 45 }, (_, i) => row('needs_zip', { uuid: `u${i}`, title: `Bid ${i}` }));
    expect(html(board(rows))).toContain('Plus 5 more');
  });
  it('explains each hide', () => {
    const o = row('needs_zip').opportunity;
    const out = html(board([]), [{ opportunity: o, reason: 'ai_not_a_fit' }, { opportunity: o, reason: 'auto_off_target' }, { opportunity: o, reason: 'auto_fit_below_threshold' }]);
    expect(out).toContain('AI says not a fit');
    expect(out).toContain('Off-target title');
    expect(out).toContain('Fit under 60');
  });
});

describe('conditional formatting boundaries', () => {
  it('fit', () => {
    expect([fitTone(75), fitTone(74), fitTone(60), fitTone(59), fitTone(null)]).toEqual(['good', 'warn', 'warn', 'bad', 'mute']);
  });
  it('days left', () => {
    expect([daysTone(31), daysTone(30), daysTone(15), daysTone(14), daysTone(null)]).toEqual(['good', 'warn', 'warn', 'bad', 'mute']);
  });
  it('counts days and tolerates unknown dates', () => {
    expect(daysUntil('2026-11-25', TODAY)).toBe(21);
    expect(daysUntil('2026-11-25T23:00:00Z', TODAY)).toBe(21);
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('garbage', TODAY)).toBeNull();
  });
});

describe('subject', () => {
  it('lists the work, singular and plural', () => {
    expect(govPursuitSubject(board([], { vetted: 2, needs_zip: 1 }))).toContain('2 vetted ⭐, 1 ZIP to upload');
    expect(govPursuitSubject(board([], { needs_zip: 16 }))).toContain('16 ZIPs to upload');
  });
  it('says when there is nothing', () => expect(govPursuitSubject(board([]))).toContain('nothing needs you today'));
});

describe('email-safe markup and house style', () => {
  const out = html(board([row('vetted', {}, { reason: 'r', coveragePct: 80 }), row('needs_read'), row('approved'), row('needs_zip')], { vetted: 1, needs_read: 1, approved: 1, needs_zip: 1 }));
  it('uses no markup email clients strip', () => {
    expect(out).not.toMatch(/<style|<script|display:\s*(flex|grid)|class=/i);
  });
  it('uses no em dash and no banned word', () => {
    expect(out).not.toContain('—');
    expect(out.toLowerCase()).not.toMatch(/\bfree\b/);
  });
  it('holds the bar chart inside the 600px layout', () => {
    expect(out).toContain('max-width:600px');
  });
});
