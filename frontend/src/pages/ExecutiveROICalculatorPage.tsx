import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { Button, ButtonProps } from '../colaberry/components/core/Button';
import { Badge } from '../colaberry/components/core/Badge';
import { Card } from '../colaberry/components/core/Card';

// ExecutiveROICalculatorPage — /executive-roi-calculator
// REFRAME: from a generic "productivity savings" model to a SPONSOR ROI /
// TALENT-DISCOVERY calculator. The frame is now: a sponsored seat block is a
// fraction of the cost of a single bad senior hire — and it tells you who your
// real AI builders are before you bet a salary on the wrong person.
// DS-only, semantic tokens only. Default export + component name preserved.

// CtaButton: the DS Button only forwards href + on* handlers to its host element
// (it drops React Router's `to`), so we route via href + onClick.
interface CtaButtonProps extends Omit<ButtonProps, 'href' | 'onClick'> {
  to: string;
}
function CtaButton({ to, children, ...rest }: CtaButtonProps) {
  const navigate = useNavigate();
  return (
    <Button
      href={to}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </Button>
  );
}

/* ── Calculation ─────────────────────────────────────────────────── */

interface SponsorROI {
  seatBlockCost: number;
  badHireCost: number;
  buildersSurfaced: number;
  costPerBuilder: number;
  netAvoidedCost: number;
  roiMultiple: number;
}

// Cost of a bad senior hire, widely modeled at ~30% of first-year salary in
// direct costs plus ramp, severance, and re-hire — we expose salary + a
// multiplier so the sponsor can model their own assumption.
function calculateSponsorROI(
  seats: number,
  seatPrice: number,
  baseSalary: number,
  badHireMultiplier: number,
  builderRate: number,
): SponsorROI {
  const seatBlockCost = seats * seatPrice;
  const badHireCost = Math.round(baseSalary * badHireMultiplier);
  const buildersSurfaced = Math.max(0, Math.round(seats * (builderRate / 100)));
  const costPerBuilder = buildersSurfaced > 0 ? Math.round(seatBlockCost / buildersSurfaced) : 0;
  // Value framed as: the seat block costs less than one bad hire it helps you avoid.
  const netAvoidedCost = badHireCost - seatBlockCost;
  const roiMultiple = seatBlockCost > 0 ? badHireCost / seatBlockCost : 0;
  return {
    seatBlockCost,
    badHireCost,
    buildersSurfaced,
    costPerBuilder,
    netAvoidedCost,
    roiMultiple: Math.round(roiMultiple * 10) / 10,
  };
}

/* ── Color helpers (semantic tokens) ─────────────────────────────── */

function roiColor(v: number): string {
  if (v >= 3) return 'var(--status-success)';
  if (v >= 1.5) return 'var(--status-warning)';
  return 'var(--status-danger)';
}

function avoidedColor(v: number): string {
  return v > 0 ? 'var(--status-success)' : 'var(--status-danger)';
}

/* ── Currency formatter ──────────────────────────────────────────── */

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/* ── Slider component ────────────────────────────────────────────── */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div className="cbroi-slider">
      <div className="cbroi-slider-top">
        <label className="cbroi-slider-label">{label}</label>
        <span className="cbroi-slider-val">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        style={{ accentColor: 'var(--brand-accent)', width: '100%' }}
      />
      <div className="cbroi-slider-scale">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

/* ── Metric card ─────────────────────────────────────────────────── */

interface MetricCardProps {
  title: string;
  value: string;
  color: string;
  note?: string;
}

function MetricCard({ title, value, color, note }: MetricCardProps) {
  return (
    <Card elevation="sm" className="cbroi-metric">
      <div className="cbroi-metric-title">{title}</div>
      <div className="cbroi-metric-value" style={{ color }}>{value}</div>
      {note && <div className="cbroi-metric-note">{note}</div>}
    </Card>
  );
}

const CSS = `
.cbroi-root{font-family:var(--font-body);color:var(--text-body);background:var(--surface-page);line-height:var(--lh-relaxed);-webkit-font-smoothing:antialiased}
.cbroi-root *{box-sizing:border-box}
.cbroi-root h1,.cbroi-root h2,.cbroi-root h3{font-family:var(--font-display);color:var(--text-strong);margin:0;line-height:var(--lh-heading);letter-spacing:var(--ls-tight)}
.cbroi-wrap{max-width:var(--container-lg);margin:0 auto;padding:0 var(--space-6)}
.cbroi-eyebrow{font-size:var(--fs-overline);font-weight:var(--fw-bold);letter-spacing:var(--ls-overline);text-transform:uppercase;color:var(--brand-accent)}
.cbroi-sec{padding:var(--space-16) 0 var(--space-24)}
.cbroi-h2{font-size:var(--fs-h2);font-weight:var(--fw-bold)}
.cbroi-lead{font-size:var(--fs-body-lg);line-height:var(--lh-normal);color:var(--text-muted)}
.cbroi-mt2{margin-top:var(--space-2)}
.cbroi-mt4{margin-top:var(--space-4)}

/* HERO */
.cbroi-hero{background:var(--surface-inverse);color:var(--text-on-inverse);padding:var(--space-20) 0;text-align:center}
.cbroi-hero h1{color:var(--text-on-inverse);font-size:var(--fs-hero-fluid);font-weight:var(--fw-black);max-width:20ch;margin:var(--space-4) auto 0}
.cbroi-hero .cbroi-eyebrow{color:var(--red-300)}
.cbroi-hero .cbroi-lead{color:var(--neutral-300);max-width:60ch;margin:var(--space-5) auto 0}

/* CALCULATOR LAYOUT */
.cbroi-grid{display:grid;grid-template-columns:5fr 7fr;gap:var(--space-8);align-items:start}
.cbroi-panel{padding:var(--space-8)}
.cbroi-panel h2{font-size:var(--fs-h5);font-weight:var(--fw-bold)}
.cbroi-sliders{margin-top:var(--space-6);display:flex;flex-direction:column;gap:var(--space-6)}
.cbroi-slider-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:var(--space-2)}
.cbroi-slider-label{font-size:var(--fs-body-sm);font-weight:var(--fw-medium);color:var(--text-body);margin:0}
.cbroi-slider-val{font-family:var(--font-display);font-weight:var(--fw-bold);color:var(--brand-accent);font-size:var(--fs-h5)}
.cbroi-slider-scale{display:flex;justify-content:space-between;margin-top:var(--space-1);font-size:var(--fs-caption);color:var(--text-muted)}

.cbroi-results h2{font-size:var(--fs-h5);font-weight:var(--fw-bold);margin-bottom:var(--space-4)}
.cbroi-metrics{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)}
.cbroi-metric{padding:var(--space-6);text-align:center}
.cbroi-metric-title{font-size:var(--fs-caption);font-weight:var(--fw-medium);color:var(--text-muted);text-transform:uppercase;letter-spacing:var(--ls-wide)}
.cbroi-metric-value{font-family:var(--font-display);font-weight:var(--fw-black);font-size:var(--fs-h2);line-height:1.05;margin-top:var(--space-2)}
.cbroi-metric-note{font-size:var(--fs-caption);color:var(--text-muted);margin-top:var(--space-2)}
.cbroi-summary{margin-top:var(--space-4);padding:var(--space-6);border-left:var(--border-3) solid var(--brand-accent);background:var(--surface-subtle);border-radius:var(--radius-md)}
.cbroi-summary p{margin:0;font-size:var(--fs-body-sm);color:var(--text-body)}

/* CLOSING */
.cbroi-closing{text-align:center}
.cbroi-closing h2{font-size:var(--fs-h2);max-width:24ch;margin:0 auto}
.cbroi-closing .cbroi-lead{max-width:56ch;margin:var(--space-4) auto var(--space-8)}
.cbroi-closing-cta{display:flex;gap:var(--space-4);justify-content:center;flex-wrap:wrap}

@media(max-width:900px){
  .cbroi-grid{grid-template-columns:1fr}
  .cbroi-metrics{grid-template-columns:1fr}
}
`;

/* ── Page component ──────────────────────────────────────────────── */

function ExecutiveROICalculatorPage() {
  const [searchParams] = useSearchParams();
  const p = (key: string, fallback: number) => {
    const v = Number(searchParams.get(key));
    return v > 0 ? v : fallback;
  };

  const [seats, setSeats] = useState(() => p('seats', 25));
  const [seatPrice, setSeatPrice] = useState(() => p('seatprice', 1500));
  const [baseSalary, setBaseSalary] = useState(() => p('salary', 160000));
  const [badHireMultiplier, setBadHireMultiplier] = useState(() => p('multiplier', 1));
  const [builderRate, setBuilderRate] = useState(() => p('builderrate', 20));

  const roi = useMemo(
    () => calculateSponsorROI(seats, seatPrice, baseSalary, badHireMultiplier, builderRate),
    [seats, seatPrice, baseSalary, badHireMultiplier, builderRate],
  );

  return (
    <div className="cbroi-root">
      <style>{CSS}</style>
      <SEOHead
        title="Sponsor ROI & Talent-Discovery Calculator"
        description="Model the ROI of sponsoring a seat block in the Colaberry AI Challenge: a fraction of the cost of one bad senior hire, and it surfaces who your real AI builders are before you bet a salary on the wrong person."
      />

      {/* HERO */}
      <header className="cbroi-hero">
        <div className="cbroi-wrap">
          <div className="cbroi-eyebrow">Sponsor ROI · Talent Discovery</div>
          <h1 className="cb-balance">A seat block costs less than one bad hire — and tells you who can actually build.</h1>
          <p className="cbroi-lead">
            You can spend a senior salary hiring an AI builder you hope is real, or sponsor a block of seats and
            watch your real builders surface on a leaderboard first. Model both below.
          </p>
        </div>
      </header>

      {/* CALCULATOR */}
      <section className="cbroi-sec">
        <div className="cbroi-wrap">
          <div className="cbroi-grid">
            {/* Inputs */}
            <Card elevation="sm" className="cbroi-panel">
              <Badge tone="blue" outline>Model Inputs</Badge>
              <h2 className="cbroi-mt2">Your sponsorship &amp; hiring assumptions</h2>
              <div className="cbroi-sliders">
                <Slider
                  label="Seats in your block"
                  value={seats}
                  min={5}
                  max={250}
                  step={5}
                  format={(v) => String(v)}
                  onChange={setSeats}
                />
                <Slider
                  label="Price per sponsored seat (annual)"
                  value={seatPrice}
                  min={500}
                  max={3000}
                  step={100}
                  format={(v) => fmt.format(v)}
                  onChange={setSeatPrice}
                />
                <Slider
                  label="Base salary of an AI hire you’d otherwise make"
                  value={baseSalary}
                  min={80000}
                  max={300000}
                  step={5000}
                  format={(v) => fmt.format(v)}
                  onChange={setBaseSalary}
                />
                <Slider
                  label="Cost of a bad hire (× salary)"
                  value={badHireMultiplier}
                  min={0.5}
                  max={2}
                  step={0.1}
                  format={(v) => `${v.toFixed(1)}×`}
                  onChange={setBadHireMultiplier}
                />
                <Slider
                  label="Share of seats who emerge as real builders (%)"
                  value={builderRate}
                  min={5}
                  max={50}
                  step={1}
                  format={(v) => `${v}%`}
                  onChange={setBuilderRate}
                />
              </div>
            </Card>

            {/* Results */}
            <div className="cbroi-results">
              <h2>What the seat block buys you</h2>
              <div className="cbroi-metrics">
                <MetricCard
                  title="Your seat block"
                  value={fmt.format(roi.seatBlockCost)}
                  color="var(--text-strong)"
                  note={`${seats} seats × ${fmt.format(seatPrice)}`}
                />
                <MetricCard
                  title="One bad AI hire"
                  value={fmt.format(roi.badHireCost)}
                  color="var(--status-danger)"
                  note={`${badHireMultiplier.toFixed(1)}× a ${fmt.format(baseSalary)} salary`}
                />
                <MetricCard
                  title="Builders surfaced"
                  value={String(roi.buildersSurfaced)}
                  color="var(--brand-accent)"
                  note={roi.costPerBuilder > 0 ? `${fmt.format(roi.costPerBuilder)} per builder identified` : 'Raise the builder rate'}
                />
                <MetricCard
                  title="Cost avoided vs one bad hire"
                  value={`${roi.roiMultiple}×`}
                  color={roiColor(roi.roiMultiple)}
                  note={roi.netAvoidedCost >= 0 ? `${fmt.format(roi.netAvoidedCost)} less than a bad hire` : 'Above one bad hire'}
                />
              </div>

              <div className="cbroi-summary" style={{ borderLeftColor: roiColor(roi.roiMultiple) }}>
                <p>
                  Sponsoring <strong>{seats} seats</strong> costs <strong>{fmt.format(roi.seatBlockCost)}</strong> —
                  about <strong style={{ color: avoidedColor(roi.netAvoidedCost) }}>{roi.roiMultiple}×</strong> cheaper than
                  the <strong>{fmt.format(roi.badHireCost)}</strong> a single mis-hire would cost you. Along the way it
                  surfaces an estimated <strong>{roi.buildersSurfaced} real AI builders</strong> already on your
                  payroll — without taking anyone off the job.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING */}
      <section className="cbroi-sec" style={{ background: 'var(--surface-subtle)' }}>
        <div className="cbroi-wrap cbroi-closing">
          <div className="cbroi-eyebrow">Pick Your Door</div>
          <h2 className="cb-balance cbroi-mt4">Sponsor your team — or join the Challenge yourself.</h2>
          <p className="cbroi-lead">
            Sponsor a seat block to discover the AI builders already inside your company, or join the same class
            as an individual. One program, two doors, one leaderboard.
          </p>
          <div className="cbroi-closing-cta">
            <CtaButton to="/sponsorship" size="lg" trailingIcon={<span aria-hidden>→</span>}>
              Sponsor Your Team
            </CtaButton>
            <CtaButton to="/enroll" size="lg" variant="outline">
              Join the Challenge
            </CtaButton>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ExecutiveROICalculatorPage;
