import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { STANDARD_CTAS } from '../config/programSchedule';

/* ── Calculation ─────────────────────────────────────────────────── */

function calculateROI(
  employees: number,
  hoursSaved: number,
  hourlyCost: number,
  weeks: number,
  investment: number,
) {
  const weeklySavings = employees * hoursSaved * hourlyCost;
  const annualSavings = Math.round(weeklySavings * weeks);
  const roiMultiple = weeklySavings > 0 ? annualSavings / investment : 0;
  const breakEvenWeeks = weeklySavings > 0 ? investment / weeklySavings : 999;
  const threeYearImpact = annualSavings * 3;
  return {
    weeklySavings,
    annualSavings,
    roiMultiple: Math.round(roiMultiple * 10) / 10,
    breakEvenWeeks: Math.round(breakEvenWeeks * 10) / 10,
    threeYearImpact,
  };
}

/* ── Color helpers ───────────────────────────────────────────────── */

function savingsColor(v: number): string {
  if (v >= 250_000) return '#38a169';
  if (v >= 100_000) return '#2b6cb0';
  return '#718096';
}

function roiColor(v: number): string {
  if (v >= 3) return '#38a169';
  if (v >= 1.5) return '#dd6b20';
  return '#e53e3e';
}

function breakEvenColor(v: number): string {
  if (v < 10) return '#38a169';
  if (v <= 20) return '#dd6b20';
  return '#e53e3e';
}

function threeYearColor(v: number): string {
  return v >= 500_000 ? '#38a169' : '#718096';
}

/* ── Currency formatter ──────────────────────────────────────────── */

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/* ── Slider component ────────────────────────────────────────────── */

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-baseline mb-1">
        <label className="form-label small fw-medium mb-0" style={{ color: 'var(--color-text)' }}>
          {label}
        </label>
        <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: '1.1rem' }}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        className="form-range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ accentColor: 'var(--color-primary)' }}
      />
      <div className="d-flex justify-content-between">
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>{format(min)}</span>
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>{format(max)}</span>
      </div>
    </div>
  );
}

/* ── Metric card ─────────────────────────────────────────────────── */

function MetricCard({
  title,
  value,
  color,
  glow,
}: {
  title: string;
  value: string;
  color: string;
  glow?: boolean;
}) {
  return (
    <div
      className="card border-0 shadow-sm mb-3"
      style={{
        transition: 'box-shadow 0.3s ease',
        boxShadow: glow ? `0 0 20px ${color}33, 0 4px 12px rgba(0,0,0,0.08)` : undefined,
      }}
    >
      <div className="card-body text-center py-4">
        <div className="text-muted small fw-medium mb-2">{title}</div>
        <div
          className="fw-bold"
          style={{
            fontSize: '2.25rem',
            lineHeight: 1.1,
            color,
            transition: 'color 0.3s ease',
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

/* ── Page component ──────────────────────────────────────────────── */

function ExecutiveROICalculatorPage() {
  const [searchParams] = useSearchParams();
  const p = (key: string, fallback: number) => {
    const v = Number(searchParams.get(key));
    return v > 0 ? v : fallback;
  };

  const [employees, setEmployees] = useState(() => p('employees', 15));
  const [hoursSaved, setHoursSaved] = useState(() => p('hours', 5));
  const [hourlyCost, setHourlyCost] = useState(() => p('cost', 70));
  const [weeks, setWeeks] = useState(() => p('weeks', 52));
  const [investment, setInvestment] = useState(() => p('investment', 15000));

  const roi = useMemo(
    () => calculateROI(employees, hoursSaved, hourlyCost, weeks, investment),
    [employees, hoursSaved, hourlyCost, weeks, investment],
  );

  return (
    <>
      <SEOHead
        title="Executive AI ROI Calculator"
        description="Estimate the financial impact of building internal AI execution capability. Interactive ROI modeling for enterprise leaders."
      />

      {/* Header */}
      <section className="section-alt" style={{ paddingBottom: '2rem' }}>
        <div className="container text-center">
          <h1 className="display-5 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
            Executive AI ROI Calculator
          </h1>
          <p className="lead mb-2" style={{ color: 'var(--color-text-light)' }}>
            Estimate the financial impact of building internal AI execution capability.
          </p>
          <p className="small" style={{ color: 'var(--color-text-light)', maxWidth: '600px', margin: '0 auto' }}>
            Small workflow automation gains compound into enterprise-level financial impact.
            Adjust the inputs below to model your organization's potential.
          </p>
        </div>
      </section>

      {/* Calculator */}
      <section className="section" style={{ paddingTop: '2rem' }}>
        <div className="container">
          <div className="row g-4 g-lg-5">
            {/* Left — Sliders */}
            <div className="col-lg-5">
              <div className="card border-0 shadow-sm p-4">
                <h2 className="h6 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
                  Model Inputs
                </h2>

                <Slider
                  label="Employees Impacted"
                  value={employees}
                  min={1}
                  max={200}
                  step={1}
                  format={(v) => String(v)}
                  onChange={setEmployees}
                />

                <Slider
                  label="Hours Saved Per Week (per employee)"
                  value={hoursSaved}
                  min={1}
                  max={20}
                  step={1}
                  format={(v) => String(v)}
                  onChange={setHoursSaved}
                />

                <Slider
                  label="Average Fully Loaded Hourly Cost ($)"
                  value={hourlyCost}
                  min={30}
                  max={150}
                  step={5}
                  format={(v) => `$${v}`}
                  onChange={setHourlyCost}
                />

                <Slider
                  label="Weeks Per Year"
                  value={weeks}
                  min={40}
                  max={52}
                  step={1}
                  format={(v) => String(v)}
                  onChange={setWeeks}
                />

                <Slider
                  label="Program Investment ($)"
                  value={investment}
                  min={5000}
                  max={50000}
                  step={1000}
                  format={(v) => fmt.format(v)}
                  onChange={setInvestment}
                />
              </div>
            </div>

            {/* Right — Dashboard */}
            <div className="col-lg-7">
              <h2 className="h6 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>
                Projected Financial Impact
              </h2>

              <div className="row g-3">
                <div className="col-sm-6">
                  <MetricCard
                    title="Annual Recurring Savings"
                    value={fmt.format(roi.annualSavings)}
                    color={savingsColor(roi.annualSavings)}
                  />
                </div>
                <div className="col-sm-6">
                  <MetricCard
                    title="ROI Multiple"
                    value={`${roi.roiMultiple}x`}
                    color={roiColor(roi.roiMultiple)}
                    glow={roi.roiMultiple >= 3}
                  />
                </div>
                <div className="col-sm-6">
                  <MetricCard
                    title="Break-even Timeline"
                    value={`${roi.breakEvenWeeks} weeks`}
                    color={breakEvenColor(roi.breakEvenWeeks)}
                  />
                </div>
                <div className="col-sm-6">
                  <MetricCard
                    title="3-Year Financial Impact"
                    value={fmt.format(roi.threeYearImpact)}
                    color={threeYearColor(roi.threeYearImpact)}
                    glow={roi.threeYearImpact >= 500_000}
                  />
                </div>
              </div>

              {/* Summary callout */}
              <div
                className="card border-0 mt-3 p-3"
                style={{
                  background: roi.roiMultiple >= 3
                    ? 'linear-gradient(135deg, rgba(56,161,105,0.08) 0%, rgba(56,161,105,0.02) 100%)'
                    : 'var(--color-bg-alt)',
                  borderLeft: `4px solid ${roiColor(roi.roiMultiple)}`,
                  transition: 'background 0.3s ease, border-color 0.3s ease',
                }}
              >
                <p className="mb-0 small" style={{ color: 'var(--color-text)' }}>
                  With <strong>{employees} employees</strong> saving <strong>{hoursSaved} hours/week</strong>,
                  your organization recovers <strong>{fmt.format(roi.weeklySavings)}/week</strong> in
                  productivity — paying back the program investment
                  in <strong>{roi.breakEvenWeeks} weeks</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section-alt text-center">
        <div className="container" style={{ maxWidth: '600px' }}>
          <h2 className="h4 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
            Ready to Capture This ROI?
          </h2>
          <p className="text-muted mb-4">
            Download the Executive Briefing or schedule a strategy call
            to discuss how the program maps to your organization.
          </p>
          <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center">
            <Link to="/#download-overview" className="btn btn-primary btn-lg">
              {STANDARD_CTAS.primary}
            </Link>
            <Link to="/contact" className="btn btn-outline-primary btn-lg">
              {STANDARD_CTAS.secondary}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default ExecutiveROICalculatorPage;
