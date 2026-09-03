import React from 'react';

/**
 * PortfolioHistory - the Experience and Education blocks of the portfolio.
 *
 * WHY THIS EXISTS. Ali, on the first cut of this page: "make it look more like a
 * Resume ... with an experience section that comes from their linkedin resume."
 * A page that shows only capstone work reads as a bootcamp exercise. The employment
 * history is what makes a stranger read the rest as a professional's work.
 *
 * It renders ONLY what the resume stated. Every field here is nullable and every
 * null is a silence, not a gap to fill: no "Present" invented for a missing end
 * date, no company inferred from an email domain. The backend normalizer
 * (resumeHistory.ts) already dropped anything it could not vouch for.
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

const INK = 'var(--text-strong)';
const BODY = 'var(--text-body)';
const MUTED = 'var(--text-muted)';
const SUBTLE = 'var(--text-subtle)';
const LINE = 'var(--border-subtle)';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2021-03" -> "Mar 2021"; "2021" -> "2021"; anything else -> null. */
function formatPoint(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value);
  if (!m) return null;
  if (!m[2]) return m[1];
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return m[1];
  return MONTHS[idx] + ' ' + m[1];
}

/**
 * The date range as a resume prints it, or null when the resume gave no dates.
 *
 * "Present" appears ONLY for a role the extractor marked current (end === null)
 * AND that has a start date to anchor it. A role with neither date renders no
 * range at all rather than a bare "Present" floating beside a job title.
 */
export function formatPeriod(start: string | null, end: string | null): string | null {
  const s = formatPoint(start);
  const e = formatPoint(end);
  if (s && e) return s + ' - ' + e;
  if (s && !end) return s + ' - Present';
  if (s) return s;
  if (e) return e;
  return null;
}

const SectionHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2
    style={{
      fontSize: 12,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      color: MUTED,
      fontWeight: 700,
      margin: '0 0 4px',
    }}
  >
    {children}
  </h2>
);

/* A short brand rule under each heading. Colaberry red, the one brand mark on a
   page that otherwise stays deliberately neutral so the work is what carries it. */
const BrandRule: React.FC = () => (
  <div style={{ width: 34, height: 3, borderRadius: 2, background: 'var(--surface-brand)', marginBottom: 18 }} />
);

const Role: React.FC<{ item: ExperienceItem; last: boolean }> = ({ item, last }) => {
  const period = formatPeriod(item.start, item.end);
  const highlights = item.highlights || [];
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 4,
        padding: '0 0 18px',
        marginBottom: 18,
        borderBottom: last ? 'none' : '1px solid ' + LINE,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          {item.title && (
            <div style={{ fontSize: 17, fontWeight: 700, color: INK, lineHeight: 1.3 }}>{item.title}</div>
          )}
          {item.company && (
            <div style={{ fontSize: 15, color: BODY, marginTop: 2 }}>{item.company}</div>
          )}
        </div>
        {/* The dates sit right on wide screens and wrap under on a phone. A resume
            reads as a timeline, so the period must stay visually attached. */}
        {(period || item.location) && (
          <div style={{ fontSize: 13, color: SUBTLE, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {period && <div>{period}</div>}
            {item.location && <div style={{ marginTop: 2 }}>{item.location}</div>}
          </div>
        )}
      </div>

      {item.summary && (
        <p style={{ margin: '8px 0 0', fontSize: 14.5, color: BODY, lineHeight: 1.6 }}>{item.summary}</p>
      )}

      {highlights.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: BODY }}>
          {highlights.map((h, i) => (
            <li key={i} style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 2 }}>{h}</li>
          ))}
        </ul>
      )}
    </li>
  );
};

export const ExperienceSection: React.FC<{ items: ExperienceItem[] }> = ({ items }) => {
  if (!items.length) return null;
  return (
    <section style={{ marginTop: 44 }}>
      <SectionHead>Experience</SectionHead>
      <BrandRule />
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item, i) => (
          <Role key={item.company + item.title + i} item={item} last={i === items.length - 1} />
        ))}
      </ul>
    </section>
  );
};

export const EducationSection: React.FC<{ items: EducationItem[] }> = ({ items }) => {
  if (!items.length) return null;
  return (
    <section style={{ marginTop: 44 }}>
      <SectionHead>Education</SectionHead>
      <BrandRule />
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((e, i) => {
          // "B.S., Computer Science" - each half is optional, so the comma is only
          // printed when both sides actually exist.
          const line = [e.credential, e.field].filter(Boolean).join(', ');
          return (
            <li
              key={e.institution + i}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 16,
                padding: '10px 0',
                borderBottom: i === items.length - 1 ? 'none' : '1px solid ' + LINE,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{e.institution}</div>
                {line && <div style={{ fontSize: 14, color: BODY, marginTop: 2 }}>{line}</div>}
              </div>
              {e.year && <div style={{ fontSize: 13, color: SUBTLE, whiteSpace: 'nowrap' }}>{e.year}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export { SectionHead, BrandRule };
