import * as React from 'react';

/**
 * EmployerDashboardPreview
 * ------------------------
 * On-brand mock of the SPONSOR (employer) view of the Colaberry AI
 * Accelerator. Shows a sponsor how their people are building skills:
 *   - header (company, sponsored-builder count, cohort)
 *   - Team Readiness donut/score
 *   - company leaderboard (rank, initials avatar, name, level badge,
 *     points, thin progress bar) with real table semantics
 *   - skill mini-bars (MCP, Claude Code, Reliability, Architecture)
 *   - Demo Day candidates chip row
 *
 * Self-contained: scoped <style> using Colaberry semantic tokens.
 * No required props — renders with realistic sample data by default.
 */

type Level = 'Bronze' | 'Silver' | 'Gold';

interface Builder {
  rank: number;
  name: string;
  initials: string;
  level: Level;
  points: number;
  /** 0–100 progress toward next level / cohort target */
  progress: number;
  /** brand-color index for the avatar tint */
  hue: 1 | 2 | 3 | 4 | 5 | 6;
  /** flagged for Demo Day */
  demoDay?: boolean;
}

interface Skill {
  label: string;
  /** 0–100 cohort-average mastery */
  value: number;
}

export interface EmployerDashboardPreviewProps {
  /** Optional override of the sponsor company name. */
  companyName?: string;
  /** Optional override of the sponsored-builder headcount. */
  sponsoredCount?: number;
  /** Optional cohort label, e.g. "Cohort 1". */
  cohortLabel?: string;
}

/* ---- realistic sample data ---- */

const BUILDERS: Builder[] = [
  { rank: 1, name: 'Priya Raman',     initials: 'PR', level: 'Gold',   points: 2480, progress: 92, hue: 1, demoDay: true },
  { rank: 2, name: 'Marcus Bell',     initials: 'MB', level: 'Gold',   points: 2310, progress: 86, hue: 2, demoDay: true },
  { rank: 3, name: 'Wei Chen',        initials: 'WC', level: 'Silver', points: 1985, progress: 71, hue: 3, demoDay: true },
  { rank: 4, name: 'Sofia Alvarez',   initials: 'SA', level: 'Silver', points: 1820, progress: 64, hue: 4 },
  { rank: 5, name: 'Daniel Okafor',   initials: 'DO', level: 'Silver', points: 1640, progress: 58, hue: 5 },
  { rank: 6, name: 'Hana Suzuki',     initials: 'HS', level: 'Bronze', points: 1295, progress: 41, hue: 6 },
  { rank: 7, name: 'Tom Becker',      initials: 'TB', level: 'Bronze', points: 1120, progress: 33, hue: 1 },
];

const SKILLS: Skill[] = [
  { label: 'MCP',          value: 82 },
  { label: 'Claude Code',  value: 88 },
  { label: 'Reliability',  value: 74 },
  { label: 'Architecture', value: 69 },
];

/** Team readiness = weighted blend of cohort skill mastery. */
const TEAM_READINESS = 78;

const HUE_VARS: Record<number, { bg: string; fg: string }> = {
  1: { bg: 'var(--blue-500)',  fg: '#fff' },
  2: { bg: 'var(--red-500)',   fg: '#fff' },
  3: { bg: 'var(--green-600)', fg: '#fff' },
  4: { bg: 'var(--amber-500)', fg: '#fff' },
  5: { bg: 'var(--purple-500)',fg: '#fff' },
  6: { bg: 'var(--teal-500)',  fg: '#fff' },
};

const LEVEL_META: Record<Level, { tone: string; label: string }> = {
  Gold:   { tone: 'gold',   label: 'Gold' },
  Silver: { tone: 'silver', label: 'Silver' },
  Bronze: { tone: 'bronze', label: 'Bronze' },
};

/* ---- donut geometry ---- */
const R = 52;
const CIRC = 2 * Math.PI * R;

function ReadinessDonut({ score }: { score: number }): JSX.Element {
  const dash = (score / 100) * CIRC;
  return (
    <div className="edp-donut" role="img" aria-label={`Team readiness ${score} out of 100`}>
      <svg viewBox="0 0 128 128" width="128" height="128" aria-hidden="true">
        <circle cx="64" cy="64" r={R} className="edp-donut-track" />
        <circle
          cx="64"
          cy="64"
          r={R}
          className="edp-donut-value"
          strokeDasharray={`${dash} ${CIRC}`}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div className="edp-donut-center">
        <span className="edp-donut-score">{score}</span>
        <span className="edp-donut-unit">/ 100</span>
      </div>
    </div>
  );
}

function EmployerDashboardPreview({
  companyName = 'Acme Corp',
  sponsoredCount = 14,
  cohortLabel = 'Cohort 1',
}: EmployerDashboardPreviewProps): JSX.Element {
  const demoCandidates = BUILDERS.filter((b) => b.demoDay);

  return (
    <section className="edp" aria-label={`${companyName} sponsor dashboard preview`}>
      <style>{styles}</style>

      {/* Header */}
      <header className="edp-head">
        <div className="edp-head-id">
          <span className="edp-logo" aria-hidden="true">
            {companyName.slice(0, 2).toUpperCase()}
          </span>
          <div className="edp-head-text">
            <h3 className="edp-company">{companyName}</h3>
            <p className="edp-head-meta">
              <span>{sponsoredCount} sponsored builders</span>
              <span className="edp-dot" aria-hidden="true" />
              <span>{cohortLabel}</span>
            </p>
          </div>
        </div>
        <span className="edp-live" aria-label="Live data">
          <span className="edp-live-dot" aria-hidden="true" />
          Live
        </span>
      </header>

      <div className="edp-grid">
        {/* Team readiness */}
        <article className="edp-card edp-readiness" aria-label="Team readiness">
          <h4 className="edp-card-title">Team Readiness</h4>
          <ReadinessDonut score={TEAM_READINESS} />
          <p className="edp-readiness-caption">
            On track for Demo Day. <strong>+6 pts</strong> this week.
          </p>
        </article>

        {/* Skill mini-bars */}
        <article className="edp-card edp-skills" aria-label="Cohort skill mastery">
          <h4 className="edp-card-title">Skill mastery</h4>
          <ul className="edp-skill-list">
            {SKILLS.map((s) => (
              <li key={s.label} className="edp-skill">
                <div className="edp-skill-top">
                  <span className="edp-skill-label">{s.label}</span>
                  <span className="edp-skill-val">{s.value}%</span>
                </div>
                <div
                  className="edp-skill-track"
                  role="progressbar"
                  aria-valuenow={s.value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${s.label} mastery`}
                >
                  <span className="edp-skill-fill" style={{ width: `${s.value}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </article>

        {/* Leaderboard */}
        <article className="edp-card edp-leaderboard" aria-label="Company leaderboard">
          <div className="edp-card-head">
            <h4 className="edp-card-title">Leaderboard</h4>
            <span className="edp-card-sub">Top sponsored builders</span>
          </div>
          <table className="edp-table">
            <caption className="edp-sr-only">
              {companyName} sponsored builders ranked by points, with skill level and progress.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="edp-th-rank">#</th>
                <th scope="col">Builder</th>
                <th scope="col">Level</th>
                <th scope="col" className="edp-th-num">Points</th>
                <th scope="col" className="edp-th-prog">Progress</th>
              </tr>
            </thead>
            <tbody>
              {BUILDERS.map((b) => {
                const hue = HUE_VARS[b.hue];
                return (
                  <tr key={b.name}>
                    <td className="edp-td-rank">
                      <span className={`edp-rank${b.rank <= 3 ? ' edp-rank--top' : ''}`}>
                        {b.rank}
                      </span>
                    </td>
                    <td>
                      <span className="edp-builder">
                        <span
                          className="edp-avatar"
                          style={{ background: hue.bg, color: hue.fg }}
                          aria-hidden="true"
                        >
                          {b.initials}
                        </span>
                        <span className="edp-name">{b.name}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`edp-level edp-level--${LEVEL_META[b.level].tone}`}>
                        {LEVEL_META[b.level].label}
                      </span>
                    </td>
                    <td className="edp-td-num">{b.points.toLocaleString()}</td>
                    <td className="edp-td-prog">
                      <span
                        className="edp-bar"
                        role="progressbar"
                        aria-valuenow={b.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${b.name} progress`}
                      >
                        <span className="edp-bar-fill" style={{ width: `${b.progress}%` }} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      </div>

      {/* Demo Day candidates */}
      <footer className="edp-demoday" aria-label="Demo Day candidates">
        <span className="edp-demoday-label">
          <span className="edp-star" aria-hidden="true">★</span>
          Demo Day candidates
        </span>
        <ul className="edp-chips">
          {demoCandidates.map((b) => {
            const hue = HUE_VARS[b.hue];
            return (
              <li key={b.name} className="edp-chip">
                <span
                  className="edp-chip-avatar"
                  style={{ background: hue.bg, color: hue.fg }}
                  aria-hidden="true"
                >
                  {b.initials}
                </span>
                <span className="edp-chip-name">{b.name}</span>
                <span className={`edp-chip-level edp-level--${LEVEL_META[b.level].tone}`}>
                  {b.level}
                </span>
              </li>
            );
          })}
        </ul>
      </footer>
    </section>
  );
}

const styles = `
.edp {
  --edp-gold-bg: #FCF1DD; --edp-gold-fg: #8a5a00; --edp-gold-bd: #E8920C;
  --edp-silver-bg: #EEF1F3; --edp-silver-fg: #4A4A4A; --edp-silver-bd: #B4B4B4;
  --edp-bronze-bg: #F6EBE2; --edp-bronze-fg: #7a4a24; --edp-bronze-bd: #C58A55;
  font-family: var(--font-body, system-ui, sans-serif);
  color: var(--text-body, #2B2B2B);
  background: var(--surface-sunken, #F1F1F0);
  border: 1px solid var(--border-subtle, #E4E4E3);
  border-radius: var(--radius-xl, 24px);
  padding: var(--space-5, 20px);
  max-width: var(--container-lg, 1080px);
  margin: 0 auto;
  box-shadow: var(--shadow-lg, 0 8px 20px rgba(26,26,26,0.07));
}
.edp *, .edp *::before, .edp *::after { box-sizing: border-box; }

.edp-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* Header */
.edp-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-4, 16px); flex-wrap: wrap; margin-bottom: var(--space-5, 20px);
}
.edp-head-id { display: flex; align-items: center; gap: var(--space-3, 12px); min-width: 0; }
.edp-logo {
  display: grid; place-items: center; flex: none;
  width: 48px; height: 48px; border-radius: var(--radius-md, 12px);
  background: var(--surface-inverse, #1A1A1A); color: var(--text-on-inverse, #fff);
  font-family: var(--font-display, sans-serif); font-weight: 900;
  font-size: 18px; letter-spacing: -0.02em;
}
.edp-head-text { min-width: 0; }
.edp-company {
  margin: 0; font-family: var(--font-display, sans-serif);
  font-weight: 700; font-size: var(--fs-h4, 22px); line-height: 1.15;
  color: var(--text-strong, #1A1A1A); letter-spacing: -0.01em;
}
.edp-head-meta {
  margin: 2px 0 0; display: flex; align-items: center; flex-wrap: wrap;
  gap: var(--space-2, 8px); font-size: var(--fs-body-sm, 16px);
  color: var(--text-muted, #6B6B6B);
}
.edp-dot { width: 4px; height: 4px; border-radius: 50%; background: var(--border-strong, #B4B4B4); }
.edp-live {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  padding: 4px 12px; border-radius: var(--radius-pill, 999px);
  background: var(--status-success-bg, #F1F9EA); color: var(--status-success, #5BA63C);
  font-size: var(--fs-caption, 14px); font-weight: 700;
}
.edp-live-dot {
  width: 8px; height: 8px; border-radius: 50%; background: var(--green-600, #5BA63C);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--green-600, #5BA63C) 60%, transparent);
  animation: edp-pulse 2s var(--ease-out, ease-out) infinite;
}
@keyframes edp-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green-600, #5BA63C) 55%, transparent); }
  70% { box-shadow: 0 0 0 8px color-mix(in srgb, var(--green-600, #5BA63C) 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--green-600, #5BA63C) 0%, transparent); }
}

/* Grid */
.edp-grid {
  display: grid; gap: var(--space-4, 16px);
  grid-template-columns: 1fr 1fr;
  grid-template-areas: "readiness skills" "leaderboard leaderboard";
}
.edp-readiness { grid-area: readiness; }
.edp-skills { grid-area: skills; }
.edp-leaderboard { grid-area: leaderboard; }

.edp-card {
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-subtle, #E4E4E3);
  border-radius: var(--radius-lg, 16px);
  padding: var(--space-5, 20px);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(26,26,26,0.05));
}
.edp-card-title {
  margin: 0 0 var(--space-3, 12px); font-family: var(--font-display, sans-serif);
  font-weight: 700; font-size: var(--fs-h5, 20px); color: var(--text-strong, #1A1A1A);
  letter-spacing: -0.01em;
}
.edp-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.edp-card-sub { font-size: var(--fs-caption, 14px); color: var(--text-muted, #6B6B6B); }

/* Readiness donut */
.edp-readiness { display: flex; flex-direction: column; align-items: center; text-align: center; }
.edp-donut { position: relative; width: 128px; height: 128px; }
.edp-donut-track { fill: none; stroke: var(--surface-sunken, #F1F1F0); stroke-width: 12; }
.edp-donut-value {
  fill: none; stroke: var(--brand-accent, #FB2832); stroke-width: 12;
  stroke-linecap: round; transition: stroke-dasharray var(--dur-slower, 560ms) var(--ease-out, ease-out);
}
.edp-donut-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; line-height: 1;
}
.edp-donut-score {
  font-family: var(--font-display, sans-serif); font-weight: 900;
  font-size: 36px; color: var(--text-strong, #1A1A1A);
}
.edp-donut-unit { font-size: var(--fs-caption, 14px); color: var(--text-muted, #6B6B6B); margin-top: 4px; }
.edp-readiness-caption {
  margin: var(--space-3, 12px) 0 0; font-size: var(--fs-body-sm, 16px); color: var(--text-muted, #6B6B6B);
}
.edp-readiness-caption strong { color: var(--status-success, #5BA63C); }

/* Skills */
.edp-skill-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3, 12px); }
.edp-skill-top {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 6px; font-size: var(--fs-body-sm, 16px);
}
.edp-skill-label { font-weight: 500; color: var(--text-strong, #1A1A1A); }
.edp-skill-val { font-weight: 700; color: var(--text-muted, #6B6B6B); font-variant-numeric: tabular-nums; }
.edp-skill-track {
  height: 8px; border-radius: var(--radius-pill, 999px);
  background: var(--surface-sunken, #F1F1F0); overflow: hidden;
}
.edp-skill-fill {
  display: block; height: 100%; border-radius: inherit;
  background: linear-gradient(90deg, var(--blue-500, #367895), var(--green-600, #5BA63C));
  transition: width var(--dur-slow, 360ms) var(--ease-out, ease-out);
}

/* Leaderboard table */
.edp-table { width: 100%; border-collapse: collapse; }
.edp-table thead th {
  text-align: left; font-size: var(--fs-overline, 12px); font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-subtle, #8C8C8C);
  padding: 0 var(--space-3, 12px) var(--space-2, 8px); white-space: nowrap;
}
.edp-th-num, .edp-td-num { text-align: right; }
.edp-th-rank { width: 36px; }
.edp-th-prog { width: 30%; }
.edp-table tbody tr { border-top: 1px solid var(--border-subtle, #E4E4E3); }
.edp-table tbody tr:hover { background: var(--surface-subtle, #F8F8F7); }
.edp-table tbody td { padding: var(--space-3, 12px); vertical-align: middle; }
.edp-td-num { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-strong, #1A1A1A); }

.edp-rank {
  display: inline-grid; place-items: center; width: 24px; height: 24px;
  font-size: var(--fs-caption, 14px); font-weight: 700; color: var(--text-muted, #6B6B6B);
}
.edp-rank--top {
  border-radius: 50%; color: var(--text-on-inverse, #fff);
  background: var(--brand-accent, #FB2832);
}

.edp-builder { display: flex; align-items: center; gap: var(--space-3, 12px); min-width: 0; }
.edp-avatar {
  display: grid; place-items: center; flex: none; width: 36px; height: 36px;
  border-radius: 50%; font-size: var(--fs-caption, 14px); font-weight: 700;
  letter-spacing: 0.01em;
}
.edp-name {
  font-weight: 500; color: var(--text-strong, #1A1A1A); white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}

.edp-level {
  display: inline-block; padding: 3px 10px; border-radius: var(--radius-pill, 999px);
  font-size: var(--fs-overline, 12px); font-weight: 700; letter-spacing: 0.02em;
  border: 1px solid transparent; white-space: nowrap;
}
.edp-level--gold   { background: var(--edp-gold-bg);   color: var(--edp-gold-fg);   border-color: color-mix(in srgb, var(--edp-gold-bd) 45%, transparent); }
.edp-level--silver { background: var(--edp-silver-bg); color: var(--edp-silver-fg); border-color: color-mix(in srgb, var(--edp-silver-bd) 55%, transparent); }
.edp-level--bronze { background: var(--edp-bronze-bg); color: var(--edp-bronze-fg); border-color: color-mix(in srgb, var(--edp-bronze-bd) 45%, transparent); }

.edp-bar {
  display: block; height: 6px; width: 100%; border-radius: var(--radius-pill, 999px);
  background: var(--surface-sunken, #F1F1F0); overflow: hidden;
}
.edp-bar-fill {
  display: block; height: 100%; border-radius: inherit;
  background: var(--brand-accent, #FB2832);
  transition: width var(--dur-slow, 360ms) var(--ease-out, ease-out);
}

/* Demo Day */
.edp-demoday {
  margin-top: var(--space-4, 16px); padding: var(--space-4, 16px);
  background: var(--surface-brand-subtle, #FFF0F1);
  border: 1px solid color-mix(in srgb, var(--brand-accent, #FB2832) 22%, transparent);
  border-radius: var(--radius-lg, 16px);
  display: flex; align-items: center; gap: var(--space-4, 16px); flex-wrap: wrap;
}
.edp-demoday-label {
  display: inline-flex; align-items: center; gap: 8px; flex: none;
  font-family: var(--font-display, sans-serif); font-weight: 700;
  font-size: var(--fs-body-sm, 16px); color: var(--text-strong, #1A1A1A);
}
.edp-star { color: var(--amber-500, #E8920C); font-size: 18px; line-height: 1; }
.edp-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--space-2, 8px); }
.edp-chip {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 5px 12px 5px 5px; border-radius: var(--radius-pill, 999px);
  background: var(--surface-card, #fff);
  border: 1px solid var(--border-default, #D8D8D8);
  box-shadow: var(--shadow-xs, 0 1px 2px rgba(26,26,26,0.04));
}
.edp-chip-avatar {
  display: grid; place-items: center; flex: none; width: 26px; height: 26px;
  border-radius: 50%; font-size: 11px; font-weight: 700;
}
.edp-chip-name { font-weight: 500; font-size: var(--fs-body-sm, 16px); color: var(--text-strong, #1A1A1A); }
.edp-chip-level { padding: 2px 8px; font-size: 11px; }

/* Responsive */
@media (max-width: 720px) {
  .edp-grid {
    grid-template-columns: 1fr;
    grid-template-areas: "readiness" "skills" "leaderboard";
  }
  .edp-th-prog, .edp-td-prog { display: none; }
}
@media (max-width: 480px) {
  .edp { padding: var(--space-4, 16px); }
  .edp-th-num, .edp-td-num { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .edp-live-dot { animation: none; }
  .edp-donut-value, .edp-skill-fill, .edp-bar-fill { transition: none; }
}
`;

export default EmployerDashboardPreview;
