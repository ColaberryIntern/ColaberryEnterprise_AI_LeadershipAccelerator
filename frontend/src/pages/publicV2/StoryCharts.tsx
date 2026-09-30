import React from 'react';
import { CaseStudyVerificationBadge } from '../../components/caseStudy/CaseStudyVerificationBadge';
import { BarRow, ChartTable, StackedBar } from './StoryChartPrimitives';
import { compositionRemainder } from './storyVisualModel';
import type { ChartView } from './storyVisualModel';

/**
 * StoryCharts - the record's figures, drawn the one way each kind allows.
 *
 * FIVE KINDS, FIVE GUARDRAILS, ALL VISIBLE. A composition is a stacked bar
 * whose parts and remainder sum to the whole in the table beneath it. A
 * comparison is two bars on a shared 0 to 100 scale with its caveat printed,
 * not tucked in a tooltip. A share is one bar with its denominator in words. A
 * two-value chart says "two summary statistics, not a trend" under the bars.
 * A zero card prints the zero and the denominator it was counted over. There
 * is no line, no axis with dates, and no kind that could be read as a trend.
 *
 * EVERY FIGURE IS TEXT BEFORE IT IS A SHAPE, in the row beside its bar and in
 * the table under the fold, so a chart with its stylesheet missing or its SVG
 * unsupported still says exactly what it measured. A missing value is never
 * drawn as zero: the model dropped any chart without a resolved row, and a
 * zero here is the wire's own zero.
 */

function ChartFrame({ chart, children }: { chart: ChartView; children: React.ReactNode }): React.ReactElement {
  return (
    <figure
      className={`cbv2-story-visual__chart cbv2-story-visual__chart--${chart.kind}`}
      data-testid="story-chart"
      data-chart-kind={chart.kind}
      aria-label={chart.summary}
    >
      <figcaption className="cbv2-story-visual__chart-head">
        <span className="cbv2-story-visual__chart-title">{chart.title}</span>
        {chart.caption ? <span className="cbv2-story-visual__chart-caption">{chart.caption}</span> : null}
        <CaseStudyVerificationBadge
          verificationClass={chart.metric.verificationClass}
          verificationMethod={chart.metric.verificationMethod}
          className="cbv2-story-visual__chart-badge"
        />
      </figcaption>
      {children}
      {chart.note ? <p className="cbv2-story-visual__chart-note">{chart.note}</p> : null}
      {chart.caveat ? <p className="cbv2-story-visual__chart-caveat">{chart.caveat}</p> : null}
      {chart.limitations.length > 0 ? (
        <ul className="cbv2-story-visual__chart-limits">
          {chart.limitations.map((l) => <li key={l}>{l}</li>)}
        </ul>
      ) : null}
      <ChartTable chart={chart} />
    </figure>
  );
}

function Composition({ chart }: { chart: ChartView }): React.ReactElement {
  const remainder = compositionRemainder(chart);
  const remainderPercent = chart.denominator > 0 ? (remainder / chart.denominator) * 100 : 0;
  return (
    <ChartFrame chart={chart}>
      <StackedBar rows={chart.rows} remainderPercent={remainderPercent} />
      <ul className="cbv2-story-visual__legend">
        {chart.rows.map((row) => (
          <li key={row.label} className={`cbv2-story-visual__legend-item cbv2-story-visual__legend-item--${row.status}`}>
            <span className="cbv2-story-visual__legend-swatch" aria-hidden="true" />
            <span className="cbv2-story-visual__legend-label">{row.label}</span>
            <span className="cbv2-story-visual__legend-figure">{row.figure}</span>
          </li>
        ))}
        {remainder > 0 ? (
          <li className="cbv2-story-visual__legend-item cbv2-story-visual__legend-item--unknown">
            <span className="cbv2-story-visual__legend-swatch" aria-hidden="true" />
            <span className="cbv2-story-visual__legend-label">Not accounted for above</span>
            <span className="cbv2-story-visual__legend-figure">{remainder.toLocaleString('en-US')} of {chart.denominator.toLocaleString('en-US')}</span>
          </li>
        ) : null}
      </ul>
      <p className="cbv2-story-visual__chart-total">Of {chart.denominator.toLocaleString('en-US')} in total.</p>
    </ChartFrame>
  );
}

function Bars({ chart }: { chart: ChartView }): React.ReactElement {
  return (
    <ChartFrame chart={chart}>
      <ul className="cbv2-story-visual__rows">
        {chart.rows.map((row) => <BarRow key={row.label} row={row} />)}
      </ul>
      {chart.kind === 'share' ? (
        <p className="cbv2-story-visual__chart-total">Share of {chart.denominator.toLocaleString('en-US')}.</p>
      ) : null}
      {chart.kind === 'two_value' && chart.axisMax !== null ? (
        <p className="cbv2-story-visual__chart-total">Bars scaled to {chart.axisMax.toLocaleString('en-US')}{chart.unit ? ` ${chart.unit}` : ''}.</p>
      ) : null}
    </ChartFrame>
  );
}

function ZeroCard({ chart }: { chart: ChartView }): React.ReactElement {
  const row = chart.rows[0];
  return (
    <ChartFrame chart={chart}>
      <p className="cbv2-story-visual__zero">
        <strong className="cbv2-story-visual__zero-figure">{row.value.toLocaleString('en-US')}</strong>
        <span className="cbv2-story-visual__zero-of">of {row.denominator.toLocaleString('en-US')}</span>
        <span className="cbv2-story-visual__zero-label">{row.label}</span>
      </p>
    </ChartFrame>
  );
}

export interface StoryChartsProps {
  charts: readonly ChartView[];
}

export function StoryCharts({ charts }: StoryChartsProps): React.ReactElement | null {
  if (charts.length === 0) return null;
  return (
    <div className="cbv2-story-visual__charts" data-testid="story-charts">
      {charts.map((chart) => {
        if (chart.kind === 'composition') return <Composition key={chart.key} chart={chart} />;
        if (chart.kind === 'zero_card') return <ZeroCard key={chart.key} chart={chart} />;
        return <Bars key={chart.key} chart={chart} />;
      })}
    </div>
  );
}

export default StoryCharts;
