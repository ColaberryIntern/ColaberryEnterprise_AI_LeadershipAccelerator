import React from 'react';
import type {
  CaseStudyMetricMember,
  CaseStudyMetricPayload,
  PublicCaseStudyMetric,
} from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyMetricShape - the picture a figure has earned.
 *
 * THE PROBLEM THIS SOLVES. A metric used to arrive as one string. "4 of 7" was
 * printed as text with the seven module names buried in a methodology
 * paragraph, so a reader could see the number but not which four, and the card
 * could not draw a meter because nothing told it there was a denominator.
 *
 * ONE VISUAL PER SHAPE, and each was chosen for what the reader has to be able
 * to do with it:
 *
 *   count   a chip grid.  The count is the claim; the chips are the evidence
 *                         a reader can scan without opening anything.
 *   ratio   meter + grid. The meter is the proportion at a glance, the grid is
 *                         WHICH members, and the untested ones come first
 *                         because the gap is the useful half.
 *   share   meter + note. A percentage is meaningless without its denominator,
 *                         so the denominator sits under the meter, not in a
 *                         paragraph somewhere below it.
 *   span    a date bar.   Two dates and the distance between them. Elapsed
 *                         time is not effort and the footer says so.
 *   series  a sparkline.  Shape over time, empty weeks included, because a gap
 *                         in the work should look like a gap.
 *
 * NO ARITHMETIC ON THE HERO NUMBER. `valueDisplay` prints exactly as approved.
 * The meter geometry is derived from the payload, and if the two ever disagree
 * the publish gate has already refused the page.
 *
 * RENDERS NOTHING WITHOUT A PAYLOAD. A shape with no numbers is not a smaller
 * picture, it is no picture, and the caller falls back to the definition list
 * every record used before shapes existed.
 */

export interface CaseStudyMetricShapeProps {
  metric: PublicCaseStudyMetric;
}

/** Members shown in a grid before it becomes a wall. The rest are counted. */
const MAX_VISIBLE_MEMBERS = 24;

export function CaseStudyMetricShape({
  metric,
}: CaseStudyMetricShapeProps): React.ReactElement | null {
  const payload = metric.payload;
  if (!payload || !metric.shape || payload.shape !== metric.shape) return null;

  return (
    <div className="cbv2-cs-shape" data-shape={payload.shape}>
      {visualFor(payload)}
    </div>
  );
}

function visualFor(payload: CaseStudyMetricPayload): React.ReactElement | null {
  switch (payload.shape) {
    case 'count':
      return <ChipGrid members={payload.members ?? []} total={payload.value} />;
    case 'ratio':
      return (
        <>
          <Meter numerator={payload.numerator} denominator={payload.denominator} />
          <StatusGrid members={payload.members ?? []} total={payload.denominator} />
        </>
      );
    case 'share':
      return (
        <>
          <Meter numerator={payload.numerator} denominator={payload.denominator} />
          <p className="cbv2-cs-shape__legend">
            <span className="cbv2-cs-shape__legend-figure">
              {payload.numerator} of {payload.denominator}
            </span>
            {payload.denominatorNote ? ` ${payload.denominatorNote}` : null}
          </p>
        </>
      );
    case 'span':
      return (
        <DateBar
          startDate={payload.startDate}
          endDate={payload.endDate}
          count={payload.count}
          countLabel={payload.countLabel}
        />
      );
    case 'series':
      return <Sparkline points={payload.points} unit={payload.unit} />;
    default:
      return null;
  }
}

/* ────────────────────────────────────────────────────────────────── meter ── */

/**
 * A proportion, drawn once and labelled for a screen reader.
 *
 * `role="img"` with an `aria-label` rather than a progressbar: this is not
 * progress towards anything, it is a measured proportion, and announcing it as
 * a progress bar would suggest it is on its way somewhere.
 *
 * AN SVG RATHER THAN A DIV WITH A WIDTH PERCENTAGE. This module ships one
 * styling mechanism and `caseStudyStyleContract` fails on any inline style
 * object, so a width that comes from data cannot be a style prop. In an SVG it
 * is a rect attribute, which is geometry, and the colours stay in the
 * stylesheet where every other colour in this module lives.
 */
const METER_WIDTH = 100;
const METER_HEIGHT = 8;

function Meter({ numerator, denominator }: { numerator: number; denominator: number }): React.ReactElement {
  const safe = denominator > 0 ? Math.min(1, Math.max(0, numerator / denominator)) : 0;
  const percent = Math.round(safe * 1000) / 10;
  return (
    <svg
      className="cbv2-cs-shape__meter"
      viewBox={`0 0 ${METER_WIDTH} ${METER_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${numerator} of ${denominator}, which is ${percent} percent`}
    >
      <rect className="cbv2-cs-shape__meter-track" x="0" y="0" width={METER_WIDTH} height={METER_HEIGHT} />
      <rect className="cbv2-cs-shape__meter-fill" x="0" y="0" width={percent} height={METER_HEIGHT} />
    </svg>
  );
}

/* ───────────────────────────────────────────────────────────────── members ── */

function ChipGrid({ members, total }: { members: readonly CaseStudyMetricMember[]; total: number }): React.ReactElement | null {
  if (members.length === 0) return null;
  const shown = members.slice(0, MAX_VISIBLE_MEMBERS);
  return (
    <>
      <ul className="cbv2-cs-shape__chips">
        {shown.map((member) => (
          <li className="cbv2-cs-shape__chip" key={member.name}>
            {member.href ? <a href={member.href}>{member.name}</a> : member.name}
          </li>
        ))}
      </ul>
      <MoreNote shown={shown.length} total={Math.max(total, members.length)} />
    </>
  );
}

/**
 * Which members are covered and which are not.
 *
 * The status word is printed, not only coloured. A grid that says "yes" and
 * "no" in green and red alone is unreadable to anyone who cannot separate the
 * two, and this is precisely the information a sceptical reader came for.
 */
function StatusGrid({ members, total }: { members: readonly CaseStudyMetricMember[]; total: number }): React.ReactElement | null {
  if (members.length === 0) return null;
  const shown = members.slice(0, MAX_VISIBLE_MEMBERS);
  return (
    <>
      <ul className="cbv2-cs-shape__members">
        {shown.map((member) => (
          <li
            className="cbv2-cs-shape__member"
            data-status={member.status ?? 'unknown'}
            key={member.name}
          >
            <span className="cbv2-cs-shape__member-name">
              {member.href ? <a href={member.href}>{member.name}</a> : member.name}
            </span>
            {member.status ? (
              <span className="cbv2-cs-shape__member-status">{member.status}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <MoreNote shown={shown.length} total={Math.max(total, members.length)} />
    </>
  );
}

/** Says what was left out, so a truncated list never reads as the whole list. */
function MoreNote({ shown, total }: { shown: number; total: number }): React.ReactElement | null {
  if (total <= shown) return null;
  return (
    <p className="cbv2-cs-shape__more">
      Showing {shown} of {total}.
    </p>
  );
}

/* ─────────────────────────────────────────────────────────────────── span ── */

function DateBar({
  startDate, endDate, count, countLabel,
}: {
  startDate: string; endDate: string; count?: number; countLabel?: string;
}): React.ReactElement {
  return (
    <div className="cbv2-cs-shape__span">
      <div className="cbv2-cs-shape__span-bar" role="img" aria-label={`From ${startDate} to ${endDate}`}>
        <span className="cbv2-cs-shape__span-end">{startDate}</span>
        <span className="cbv2-cs-shape__span-line" />
        <span className="cbv2-cs-shape__span-end">{endDate}</span>
      </div>
      {typeof count === 'number' ? (
        <p className="cbv2-cs-shape__legend">
          <span className="cbv2-cs-shape__legend-figure">{count}</span>
          {countLabel ? ` ${countLabel}` : null} inside that window.
        </p>
      ) : null}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── series ── */

const SPARK_WIDTH = 320;
const SPARK_HEIGHT = 64;

/**
 * A sparkline drawn as one path, from a zero baseline.
 *
 * BASELINE AT ZERO, ALWAYS. Scaling a chart to its own minimum turns a series
 * running 40, 42, 41 into a dramatic mountain range. The y axis here starts at
 * zero and ends at the largest point, so a flat month looks flat.
 */
function Sparkline({
  points, unit,
}: {
  points: readonly { date: string; value: number }[]; unit: string;
}): React.ReactElement | null {
  if (points.length === 0) return null;
  const peak = Math.max(...points.map((p) => p.value), 1);
  const step = points.length > 1 ? SPARK_WIDTH / (points.length - 1) : 0;
  const coords = points.map((point, i) => {
    const x = points.length > 1 ? i * step : SPARK_WIDTH / 2;
    const y = SPARK_HEIGHT - (point.value / peak) * SPARK_HEIGHT;
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  });
  const busiest = points.reduce((best, p) => (p.value > best.value ? p : best), points[0]);

  return (
    <div className="cbv2-cs-shape__series">
      <svg
        className="cbv2-cs-shape__spark"
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${points.length} weeks, peaking at ${busiest.value} ${unit} in the week of ${busiest.date}`}
      >
        <polyline
          className="cbv2-cs-shape__spark-line"
          points={coords.join(' ')}
          fill="none"
        />
      </svg>
      <p className="cbv2-cs-shape__legend">
        <span className="cbv2-cs-shape__legend-figure">{points[0].date}</span>
        {' to '}
        <span className="cbv2-cs-shape__legend-figure">{points[points.length - 1].date}</span>
        {`, peaking at ${busiest.value} ${unit} in one week.`}
      </p>
    </div>
  );
}

export default CaseStudyMetricShape;
