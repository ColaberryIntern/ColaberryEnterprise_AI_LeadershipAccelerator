import React from 'react';

/**
 * PortfolioHistory - the Experience and Education blocks of the resume-format portfolio.
 *
 * WHY THIS EXISTS. Ali, on the first cut of this page: "make it look more like a Resume
 * ... with an experience section that comes from their linkedin resume." A page showing
 * only capstone work reads as a bootcamp exercise; the employment history is what makes a
 * stranger read the rest as a professional's work.
 *
 * It renders ONLY what the resume stated. Every field is nullable and every null is a
 * silence rather than a gap to fill: no "Present" invented for a missing end date, no
 * duration computed from a date nobody wrote down. The backend normalizer
 * (resumeHistory.ts) has already dropped anything it could not vouch for.
 */

export interface ExperienceItem {
  company: string;
  title: string;
  start: string | null;
  /** null means CURRENT ROLE. */
  end: string | null;
  location?: string | null;
  summary?: string | null;
  highlights?: string[];
}

export interface EducationItem {
  institution: string;
  credential: string | null;
  field?: string | null;
  year?: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Point { year: number; month: number | null }

function parsePoint(value: string | null | undefined): Point | null {
  if (!value) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  if (year < 1950 || year > 2100) return null;
  if (!m[2]) return { year, month: null };
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** "2021-03" -> "Mar 2021"; "2021" -> "2021"; anything else -> null. */
function formatPoint(value: string | null | undefined): string | null {
  const p = parsePoint(value);
  if (!p) return null;
  return p.month === null ? String(p.year) : `${MONTHS[p.month - 1]} ${p.year}`;
}

/**
 * The date range as a resume prints it, or null when no dates were stated.
 *
 * "Present" appears ONLY for a role the extractor marked current (`end === null`) that
 * also has a start date to anchor it. A role with neither renders no range at all, rather
 * than a bare "Present" floating beside a job title.
 */
export function formatPeriod(start: string | null, end: string | null): string | null {
  const s = formatPoint(start);
  const e = formatPoint(end);
  if (s && e) return `${s} - ${e}`;
  if (s && !end) return `${s} - Present`;
  if (s) return s;
  return e;
}

/**
 * How long the role lasted, e.g. "6 yrs 1 mo", or null.
 *
 * Only computed when a start date exists, and only to the precision the resume gave: a
 * role stated as "2019" with no month yields whole years, because inventing a month to
 * make the arithmetic prettier would be inventing a fact.
 */
export function formatDuration(
  start: string | null,
  end: string | null,
  now: Date = new Date(),
): string | null {
  const s = parsePoint(start);
  if (!s) return null;
  const e = parsePoint(end);
  const endYear = e ? e.year : now.getUTCFullYear();
  const endMonth = e ? (e.month ?? 12) : now.getUTCMonth() + 1;

  // No month on either side: the resume only committed to years, so neither do we.
  if (s.month === null && (!e || e.month === null)) {
    const years = endYear - s.year;
    if (years < 0) return null;
    return years < 1 ? null : `${years} yr${years === 1 ? '' : 's'}`;
  }

  const months = (endYear - s.year) * 12 + (endMonth - (s.month ?? 1));
  if (months < 0) return null;
  const y = Math.floor(months / 12);
  const m = months % 12;
  const parts: string[] = [];
  if (y > 0) parts.push(`${y} yr${y === 1 ? '' : 's'}`);
  if (m > 0) parts.push(`${m} mo${m === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : null;
}

export const SectionHead: React.FC<{ children: React.ReactNode; badge?: string }> = (
  { children, badge },
) => (
  <h2 className="pf-h2">
    {children}
    {badge && <span className="pf-badge">{badge}</span>}
  </h2>
);

export const Rule: React.FC = () => <div className="pf-rule" />;

const Role: React.FC<{ item: ExperienceItem }> = ({ item }) => {
  const period = formatPeriod(item.start, item.end);
  const duration = formatDuration(item.start, item.end);
  const highlights = item.highlights || [];
  return (
    <div className="pf-job">
      <div className="pf-when">
        {period}
        {duration && <span className="pf-dur">{duration}</span>}
        {item.location && <span className="pf-dur">{item.location}</span>}
      </div>
      <div>
        {item.title && <div className="pf-title">{item.title}</div>}
        {item.company && <div className="pf-co">{item.company}</div>}
        {item.summary && <p className="pf-sum">{item.summary}</p>}
        {highlights.length > 0 && (
          <ul className="pf-hl">
            {highlights.map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
};

export const ExperienceSection: React.FC<{ items: ExperienceItem[]; badge?: string }> = (
  { items, badge },
) => {
  if (!items.length) return null;
  return (
    <section id="experience" className="pf-card">
      <SectionHead badge={badge}>Experience</SectionHead>
      <Rule />
      {items.map((item, i) => <Role key={`${item.company}${item.title}${i}`} item={item} />)}
    </section>
  );
};

export const EducationSection: React.FC<{ items: EducationItem[] }> = ({ items }) => {
  if (!items.length) return null;
  return (
    <section className="pf-card">
      <SectionHead>Education</SectionHead>
      <Rule />
      <ul className="pf-list">
        {items.map((e, i) => {
          // "B.S., Computer Science" - each half is optional, so the comma only appears
          // when both sides genuinely exist.
          const line = [e.credential, e.field].filter(Boolean).join(', ');
          return (
            <li key={`${e.institution}${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <span>
                <span className="pf-title" style={{ fontSize: 15 }}>{e.institution}</span>
                {line && <span style={{ display: 'block', color: 'var(--pf-body)' }}>{line}</span>}
              </span>
              {e.year && <span style={{ color: 'var(--pf-mut)', whiteSpace: 'nowrap' }}>{e.year}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};
