import React from 'react';
import type { FunnelStage } from '../acquisitionFunnelApi';
import {
  STAGE, countOf, formatCount, formatPct, headlineRates,
} from './performanceMetrics';

/**
 * The five headline figures, in the order the spec fixes them.
 *
 * WHY "CAME BACK LATER" IS STYLED AS THE BAD ONE. It is not a design flourish: of the people who
 * sign up, roughly one in ten returns on a later day, and that is the weakest number on the page.
 * Colouring it like the other four would bury the finding the report exists to surface. The
 * numeric value is shown either way, so the colour is emphasis rather than the only signal -
 * which is also what keeps this accessible.
 */

interface Kpi {
  key: string;
  label: string;
  value: string;
  note: string;
  /** Series token index, or 'critical' for the one card that reads as a warning. */
  accent: number | 'critical';
}

function buildKpis(stages: FunnelStage[]): Kpi[] {
  const rates = headlineRates(stages);
  return [
    {
      key: 'ad-sessions',
      label: 'Ad sessions',
      value: formatCount(countOf(stages, STAGE.adClicks)),
      note: 'Visits carrying a paid click id. Sessions, not people.',
      accent: 1,
    },
    {
      key: 'signups',
      label: 'Signups',
      value: formatCount(countOf(stages, STAGE.signups)),
      note: 'Accounts created from a landing page form.',
      accent: 2,
    },
    {
      key: 'ad-to-signup',
      label: 'Ad → signup',
      value: formatPct(rates.adToSignup),
      note: 'Signups ÷ ad sessions.',
      accent: 3,
    },
    {
      key: 'crm-sync',
      label: 'Reached CRM',
      value: formatPct(rates.crmSync),
      note: 'Of signups, synced to GoHighLevel.',
      accent: 4,
    },
    {
      key: 'returned',
      label: 'Came back later',
      value: formatPct(rates.returnRate),
      note: 'Of signups, returned on a later day.',
      accent: 'critical',
    },
  ];
}

export default function KpiRow({
  stages, loading,
}: {
  stages: FunnelStage[];
  loading?: boolean;
}) {
  const kpis = buildKpis(stages);

  return (
    <div className="mp-kpis">
      {kpis.map((kpi) => (
        <div
          key={kpi.key}
          data-testid={`performance-kpi-${kpi.key}`}
          className={`mp-kpi${kpi.accent === 'critical' ? ' mp-kpi--critical' : ''}`}
          style={{
            // The top rule carries the series colour; `critical` takes the danger token instead.
            ['--mp-kpi-accent' as string]:
              kpi.accent === 'critical' ? 'var(--status-danger)' : `var(--chart-${kpi.accent})`,
          }}
        >
          <span className="mp-kpi__label">{kpi.label}</span>
          <span className="mp-kpi__value">
            {/* The skeleton occupies the value's own box, so the card does not resize on arrival. */}
            {loading ? <span className="mp-skeleton">0,000</span> : kpi.value}
          </span>
          <span className="mp-kpi__note">{kpi.note}</span>
        </div>
      ))}
    </div>
  );
}
