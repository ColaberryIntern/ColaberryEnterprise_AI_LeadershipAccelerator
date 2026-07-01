import React from 'react';
import './anthropicBento.css';

/**
 * AnthropicCoursesBento — production React port of the approved
 * Colaberry Design System bento redesign for Anthropic / Skilljar
 * Week-1 courses. Spec: docs/design/anthropic-course-wrapper-bento.{html,md}.
 *
 * Container component: it takes the WHOLE Skilljar course list and
 * arranges a featured entry point + compact supporting tiles + a
 * cherry "path" anchor (and computes the path summary), rather than
 * rendering one isolated card per course. All brand styling is scoped
 * under `.acw-ds` (see anthropicBento.css) so the rest of the navy
 * portal is untouched.
 */

export interface AnthropicCourse {
  title: string;
  url: string;
  description?: string;
  estimatedMinutes?: number;
  courseNumber?: number;
}

interface Props {
  courses: AnthropicCourse[];
  /** Section label on the cherry path anchor. Defaults to a generic label. */
  pathLabel?: string;
}

// RemixIcon glyphs in the spec mapped to Bootstrap Icons (already loaded
// by the portal) so the bento needs no new icon-font dependency.
const COMPACT_ICONS = ['bi-terminal', 'bi-stars', 'bi-lightning-charge', 'bi-diagram-3'];

function Icon({ name }: { name: string }) {
  return (
    <span className="cb-i">
      <i className={`bi ${name}`} aria-hidden="true" />
    </span>
  );
}

/** Sum of estimated minutes; undefined durations count as 0. */
function totalMinutes(courses: AnthropicCourse[]): number {
  return courses.reduce((sum, c) => sum + (c.estimatedMinutes ?? 0), 0);
}

/** 150 -> "2h 30m", 45 -> "45m", 0 -> "" */
function formatDuration(mins: number): string {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Stable sort by course number (entry point = lowest), original order as tiebreak. */
function orderCourses(courses: AnthropicCourse[]): AnthropicCourse[] {
  return courses
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const an = a.c.courseNumber ?? Number.MAX_SAFE_INTEGER;
      const bn = b.c.courseNumber ?? Number.MAX_SAFE_INTEGER;
      return an !== bn ? an - bn : a.i - b.i;
    })
    .map(({ c }) => c);
}

function FeaturedTile({ course, showStartHere }: { course: AnthropicCourse; showStartHere: boolean }) {
  const dur = formatDuration(course.estimatedMinutes ?? 0);
  return (
    <article className="cb-card cb-card--hoverable cb-card--accent feat ga-feat">
      <div className="cb-card__body">
        <div className="acw__head">
          <span className="cb-icon-tile acw__tile"><Icon name="bi-mortarboard" /></span>
          <div className="acw__head-text">
            <div className="acw__topline">
              <p className="acw__overline">Anthropic · Skilljar</p>
              {showStartHere && <span className="cb-badge cb-badge--solid">Start here</span>}
            </div>
            <h3 className="acw__title cb-clamp-2">{course.title}</h3>
          </div>
        </div>
        {course.description && <p className="acw__desc cb-clamp-3">{course.description}</p>}
        <div className="acw__meta">
          {course.courseNumber != null && (
            <span className="cb-badge cb-badge--neutral">Course {course.courseNumber}</span>
          )}
          {dur && (
            <span className="acw__meta-item">
              <Icon name="bi-clock" /><span className="num">{course.estimatedMinutes}</span> min
            </span>
          )}
          <span className="acw__divider" aria-hidden="true" />
          <span className="acw__meta-item"><Icon name="bi-person" />Self-paced</span>
        </div>
        <div className="acw__foot">
          <a
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className="cb-btn cb-btn--primary"
            aria-label={`Launch ${course.title} — opens in new tab`}
          >
            Launch course <Icon name="bi-box-arrow-up-right" />
          </a>
        </div>
      </div>
    </article>
  );
}

function CompactTile({ course, iconName }: { course: AnthropicCourse; iconName: string }) {
  const dur = formatDuration(course.estimatedMinutes ?? 0);
  const overline = [
    course.courseNumber != null ? `Course ${course.courseNumber}` : null,
    dur || null,
  ].filter(Boolean);
  return (
    <article className="cb-card cb-card--hoverable cb-card--accent compact ga-compact">
      <div className="cb-card__body">
        <div className="acw__head">
          <span className="cb-icon-tile acw__tile"><Icon name={iconName} /></span>
          <div className="acw__head-text">
            <p className="acw__overline">
              {overline.map((part, i) => (
                <React.Fragment key={i}>
                  {i > 0 && ' · '}
                  {dur && part === dur ? <span style={{ fontFamily: 'var(--font-mono)' }}>{part}</span> : part}
                </React.Fragment>
              ))}
            </p>
            <h3 className="acw__title acw__title--sm cb-clamp-2">{course.title}</h3>
          </div>
        </div>
        <div className="acw__foot">
          <a
            href={course.url}
            target="_blank"
            rel="noopener noreferrer"
            className="cb-btn cb-btn--ghost cb-btn--sm"
            aria-label={`Launch ${course.title} — opens in new tab`}
          >
            Launch <Icon name="bi-arrow-right" />
          </a>
        </div>
      </div>
    </article>
  );
}

function PathAnchor({
  count,
  total,
  href,
  label,
}: { count: number; total: number; href: string; label: string }) {
  const dur = formatDuration(total);
  return (
    <div className="stat-tile ga-stat">
      <div>
        <p className="label">{label}</p>
        <div className="figures">
          <span className="big">{count}</span>
          <span className="unit">courses</span>
          {dur && <span className="big" style={{ marginLeft: 14 }}>{dur}</span>}
          <span className="unit">total · self-paced</span>
        </div>
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="cb-btn cb-btn--on-accent"
        aria-label="Start the Anthropic path — opens the first course in a new tab"
      >
        Start the path <Icon name="bi-arrow-right" />
      </a>
    </div>
  );
}

function AnthropicCoursesBento({ courses, pathLabel }: Props) {
  if (!courses || courses.length === 0) return null;

  const ordered = orderCourses(courses);
  const featured = ordered[0];
  const compacts = ordered.slice(1);
  const label = pathLabel || 'Anthropic · Skilljar path';

  // `.acw-ds` is the scope/token wrapper; the grid is a child of it so the
  // descendant CSS selectors (`.acw-ds .acw-bento`, `.acw-ds .ga-feat`, …)
  // all resolve — keep these on separate elements, not one combined node.

  // 1 course: featured tile only — no anchor (no path to summarize).
  if (compacts.length === 0) {
    return (
      <div className="acw-ds acw-bento acw-bento--single" role="group" aria-label={`${label} — 1 course`}>
        <FeaturedTile course={featured} showStartHere={false} />
      </div>
    );
  }

  // 2+ courses: featured + compact tiles + cherry path anchor.
  // CSS custom property drives the featured tile's row-span (see CSS);
  // cast the style object since CSSProperties has no index signature for vars.
  const gridStyle = { '--compact-rows': String(compacts.length) } as React.CSSProperties;
  return (
    <div
      className="acw-ds acw-bento acw-bento--multi"
      style={gridStyle}
      role="group"
      aria-label={`${label} — ${courses.length} courses`}
    >
      <FeaturedTile course={featured} showStartHere />
      {compacts.map((c, i) => (
        <CompactTile key={c.url || i} course={c} iconName={COMPACT_ICONS[i % COMPACT_ICONS.length]} />
      ))}
      <PathAnchor count={courses.length} total={totalMinutes(courses)} href={featured.url} label={label} />
    </div>
  );
}

export default AnthropicCoursesBento;
