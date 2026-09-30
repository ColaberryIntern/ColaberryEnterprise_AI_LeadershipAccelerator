import React from 'react';
import type { ChartRowView, ChartView } from './storyVisualModel';
import { compositionRemainder } from './storyVisualModel';

/**
 * StoryChartPrimitives - the few shapes every story chart is built from.
 *
 * THE BAR IS DECORATION; THE WORDS ARE THE DATA. Each SVG is `aria-hidden`
 * and sits beside HTML text that states the figure in the wire's own wording
 * ("586 of 604"), so nothing a reader needs is inside the picture. Bars are
 * drawn in a 100-unit viewBox stretched to the container, which is why no
 * text lives inside them: it would stretch too.
 *
 * COLOUR NEVER STANDS ALONE. A bar's status is a class the stylesheet maps to
 * a semantic token, and the same status is a word in the row beside it.
 *
 * NO INLINE STYLE. Lengths are SVG attributes; everything else is a class.
 */

const percentAttr = (p: number): string => String(Math.round(p * 100) / 100);

export function Bar({ percent, status }: { percent: number; status: string }): React.ReactElement {
  return (
    <svg className="cbv2-story-visual__bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="cbv2-story-visual__bar-track" x="0" y="0" width="100" height="8" rx="2" />
      <rect className={`cbv2-story-visual__bar-fill cbv2-story-visual__bar-fill--${status}`} x="0" y="0" width={percentAttr(percent)} height="8" rx="2" />
    </svg>
  );
}

export function StackedBar({ rows, remainderPercent }: { rows: readonly ChartRowView[]; remainderPercent: number }): React.ReactElement {
  let x = 0;
  return (
    <svg className="cbv2-story-visual__bar cbv2-story-visual__bar--stacked" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="cbv2-story-visual__bar-track" x="0" y="0" width="100" height="12" rx="2" />
      {rows.map((row) => {
        const start = x;
        x += row.percent;
        return (
          <rect
            key={row.label}
            className={`cbv2-story-visual__bar-fill cbv2-story-visual__bar-fill--${row.status}`}
            x={percentAttr(start)}
            y="0"
            width={percentAttr(row.percent)}
            height="12"
          />
        );
      })}
      {remainderPercent > 0 ? (
        <rect className="cbv2-story-visual__bar-fill cbv2-story-visual__bar-fill--unknown" x={percentAttr(x)} y="0" width={percentAttr(remainderPercent)} height="12" />
      ) : null}
    </svg>
  );
}

export function BarRow({ row }: { row: ChartRowView }): React.ReactElement {
  return (
    <li className={`cbv2-story-visual__row cbv2-story-visual__row--${row.status}`}>
      <span className="cbv2-story-visual__row-label">{row.label}</span>
      <span className="cbv2-story-visual__row-figure">{row.figure}</span>
      <Bar percent={row.percent} status={row.status} />
      <span className="cbv2-story-visual__row-status">{row.statusWord}</span>
      {row.caveat ? <span className="cbv2-story-visual__row-caveat">{row.caveat}</span> : null}
    </li>
  );
}

/** The same numbers as a table, folded under a summary, for anyone who wants them as numbers. */
export function ChartTable({ chart }: { chart: ChartView }): React.ReactElement {
  const remainder = chart.kind === 'composition' ? compositionRemainder(chart) : 0;
  const unitLabel = chart.kind === 'two_value' ? (chart.unit ?? 'Value') : 'Of';
  return (
    <details className="cbv2-story-visual__table-fold">
      <summary className="cbv2-story-visual__table-summary">Show the numbers</summary>
      <table className="cbv2-story-visual__table" data-testid="story-chart-table">
        <caption className="cbv2-sr-only">{chart.summary}</caption>
        <thead>
          <tr>
            <th scope="col">Part</th>
            <th scope="col">Value</th>
            <th scope="col">{unitLabel}</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}{row.caveat ? <span className="cbv2-story-visual__table-caveat"> ({row.caveat})</span> : null}</th>
              <td>{row.value.toLocaleString('en-US')}</td>
              <td>{chart.kind === 'two_value' ? (chart.unit ?? '') : row.denominator.toLocaleString('en-US')}</td>
              <td>{row.statusWord}</td>
            </tr>
          ))}
          {chart.kind === 'composition' ? (
            <>
              {remainder > 0 ? (
                <tr>
                  <th scope="row">Not accounted for above</th>
                  <td>{remainder.toLocaleString('en-US')}</td>
                  <td>{chart.denominator.toLocaleString('en-US')}</td>
                  <td>Unknown</td>
                </tr>
              ) : null}
              <tr className="cbv2-story-visual__table-total">
                <th scope="row">Total</th>
                <td>{chart.denominator.toLocaleString('en-US')}</td>
                <td>{chart.denominator.toLocaleString('en-US')}</td>
                <td />
              </tr>
            </>
          ) : null}
        </tbody>
      </table>
    </details>
  );
}
