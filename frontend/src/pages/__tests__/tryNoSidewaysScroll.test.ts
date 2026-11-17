/**
 * tryNoSidewaysScroll.test.ts -- /try (and /start, which redirects to it) scrolled sideways on a
 * phone: the page was 584px wide on a 390px screen (Ali, 2026-11-16: "fix the /try sideways scroll").
 *
 * Cause: grid columns written as `1fr` (or no columns at all) size to their widest child's
 * min-content. The readiness chart is 570px at minimum, so the column, and the page, became 570px.
 * `minmax(0, 1fr)` lets the column shrink to the screen; the chart already scrolls inside its own
 * card (`.cmd-scroll { overflow-x: auto }`).
 *
 * Measured after the fix: page width equals screen width at 11 widths from 1,920 to 320, in the
 * company view, a member drill-down and the student view.
 */
import fs from 'fs';
import path from 'path';

const page = fs.readFileSync(path.join(__dirname, '..', 'ManagementPreviewPage.tsx'), 'utf8');
const dash = fs.readFileSync(path.join(__dirname, '..', '..', 'components', 'capability', 'CompanyMomentumDashboard.tsx'), 'utf8');

describe('/try never scrolls sideways', () => {
  it('every one-column page grid can shrink below its widest child', () => {
    /* a grid with a gap but no columns sizes its one column to min-content */
    expect(page).not.toMatch(/style=\{\{ display: 'grid', gap: 'var\(--space-6\)'(, maxWidth: 760)? \}\}/);
    expect(page.match(/gridTemplateColumns: 'minmax\(0, 1fr\)' \}\}>/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it('the two-column rows stack into a column that can shrink', () => {
    expect(page).toContain('.try-cols { grid-template-columns: minmax(0, 1fr) !important; }');
  });

  it('the readiness dashboard chart column can shrink at every width', () => {
    expect(dash).toContain('grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);');
    expect(dash).toContain('@media (max-width: 720px) { .cmd-grid { grid-template-columns: minmax(0, 1fr); } }');
    expect(dash).toContain('.cmd-scroll { overflow-x: auto; }');
  });
});
