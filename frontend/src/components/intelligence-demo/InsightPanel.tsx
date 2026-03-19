import React, { useEffect, useRef, useState } from 'react';
import { FUNNEL_NODES, INSIGHTS, CATEGORY_COLORS, type StageInsight, type BreakdownItem } from './demoData';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNode(id: string) {
  return FUNNEL_NODES.find(n => n.id === id);
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Loading steps per category ──────────────────────────────────────────────

const LOADING_STEPS: Record<string, string[]> = {
  source: [
    'Connecting to lead sources...',
    'Analyzing acquisition channels...',
    'Computing pipeline contribution...',
    'Generating source intelligence...',
  ],
  outreach: [
    'Querying outreach logs...',
    'Analyzing delivery & engagement...',
    'Computing channel performance...',
    'Generating outreach intelligence...',
  ],
  visitor: [
    'Loading session data...',
    'Analyzing visitor behavior...',
    'Computing engagement signals...',
    'Generating visitor intelligence...',
  ],
  engagement: [
    'Connecting to CRM pipeline...',
    'Analyzing conversion actions...',
    'Computing close rate metrics...',
    'Generating engagement intelligence...',
  ],
  conversion: [
    'Pulling revenue data...',
    'Analyzing conversion paths...',
    'Computing unit economics...',
    'Generating conversion intelligence...',
  ],
};

// ─── Count-Up Hook ───────────────────────────────────────────────────────────

function parseNumericValue(value: string): { prefix: string; number: number; suffix: string; decimals: number } {
  const match = value.match(/^([^0-9]*)([0-9]+(?:\.[0-9]+)?)(.*)$/);
  if (!match) return { prefix: '', number: 0, suffix: value, decimals: 0 };
  const numStr = match[2];
  const decimals = numStr.includes('.') ? numStr.split('.')[1].length : 0;
  return { prefix: match[1], number: parseFloat(numStr), suffix: match[3], decimals };
}

function useCountUp(targetValue: string, active: boolean, delay: number): string {
  const [display, setDisplay] = useState(targetValue);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active || prefersReducedMotion()) {
      setDisplay(targetValue);
      return;
    }

    const { prefix, number: target, suffix, decimals } = parseNumericValue(targetValue);
    if (target === 0) { setDisplay(targetValue); return; }

    const duration = 800;
    let start: number | null = null;

    const timer = window.setTimeout(() => {
      const animate = (ts: number) => {
        if (!start) start = ts;
        const elapsed = ts - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = eased * target;
        const formatted = decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString();
        setDisplay(`${prefix}${formatted}${suffix}`);
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };
      rafRef.current = requestAnimationFrame(animate);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [targetValue, active, delay]);

  return display;
}

// ─── Animated Metric Card ────────────────────────────────────────────────────

function MetricCard({ label, value, sublabel, color, animate, delay }: {
  label: string;
  value: string;
  sublabel?: string;
  color: string;
  animate: boolean;
  delay: number;
}) {
  const displayValue = useCountUp(value, animate, delay);

  return (
    <div
      className="text-center p-3"
      style={{
        background: `${color}08`,
        borderRadius: 12,
        border: `1px solid ${color}18`,
        opacity: animate ? 1 : 0,
        transform: animate ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.95)',
        transition: `opacity 0.4s ease ${delay}ms, transform 0.4s ease ${delay}ms`,
      }}
    >
      <div className="fw-bold" style={{ fontSize: '1.5rem', color, lineHeight: 1.1 }}>
        {displayValue}
      </div>
      <div className="fw-semibold mt-1" style={{ fontSize: '0.75rem', color: 'var(--color-text)' }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ fontSize: '0.68rem', color: 'var(--color-text-light)', marginTop: 2 }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

// ─── Animated Breakdown Bar ─────────────────────────────────────────────────

function BreakdownBar({ items, animate }: { items: BreakdownItem[]; animate: boolean }) {
  return (
    <div
      style={{
        opacity: animate ? 1 : 0,
        transition: 'opacity 0.4s ease 0.5s',
      }}
    >
      {/* Stacked bar */}
      <div className="d-flex" style={{ height: 8, borderRadius: 4, overflow: 'hidden' }}>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              width: animate ? `${item.pct}%` : '0%',
              background: item.color,
              opacity: 0.8,
              transition: `width 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) ${0.6 + i * 0.15}s`,
            }}
          />
        ))}
      </div>
      {/* Labels */}
      <div className="d-flex flex-wrap gap-3 mt-2">
        {items.map((item, i) => (
          <div key={i} className="d-flex align-items-center gap-1" style={{ fontSize: '0.72rem' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: item.color,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--color-text-light)' }}>{item.label}</span>
            <span className="fw-semibold" style={{ color: 'var(--color-text)' }}>{item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Loading Sequence ────────────────────────────────────────────────────────

function LoadingSequence({ steps, currentStep, color }: {
  steps: string[];
  currentStep: number;
  color: string;
}) {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center"
      style={{ minHeight: 280, padding: '2rem 1rem' }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
          animation: 'intelPulse 1.2s ease-in-out infinite',
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: `3px solid ${color}`,
            borderTopColor: 'transparent',
            animation: 'intelSpin 0.8s linear infinite',
          }}
        />
      </div>
      <div style={{ width: '100%', maxWidth: 280 }}>
        {steps.map((step, i) => {
          const isDone = i < currentStep;
          const isCurrent = i === currentStep;
          const isVisible = i <= currentStep;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '0.8rem',
                lineHeight: 1.4,
                marginBottom: 6,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateX(0)' : 'translateX(-8px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease',
                color: isDone ? color : isCurrent ? 'var(--color-text)' : 'var(--color-text-light)',
              }}
            >
              <span style={{ width: 16, textAlign: 'center', flexShrink: 0, fontWeight: 600 }}>
                {isDone ? '✓' : isCurrent ? '●' : ''}
              </span>
              <span style={{ fontWeight: isDone ? 500 : isCurrent ? 600 : 400 }}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Insight Content ─────────────────────────────────────────────────────────

function InsightContent({ insight, color, animate }: { insight: StageInsight; color: string; animate: boolean }) {
  return (
    <div>
      {/* Metrics grid */}
      <div
        className="mb-3"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
        }}
      >
        {insight.metrics.map((m, i) => (
          <MetricCard
            key={i}
            label={m.label}
            value={m.value}
            sublabel={m.sublabel}
            color={color}
            animate={animate}
            delay={i * 120}
          />
        ))}
      </div>

      {/* Breakdown */}
      {insight.breakdown.length > 0 && (
        <div className="mb-3">
          <div className="fw-semibold mb-2" style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Channel Breakdown
          </div>
          <BreakdownBar items={insight.breakdown} animate={animate} />
        </div>
      )}

      {/* Narrative */}
      <div
        className="p-3 mt-2"
        style={{
          background: `${color}08`,
          borderRadius: 10,
          borderLeft: `3px solid ${color}`,
          fontSize: '0.82rem',
          color: 'var(--color-text)',
          lineHeight: 1.55,
          opacity: animate ? 1 : 0,
          transform: animate ? 'translateY(0)' : 'translateY(8px)',
          transition: 'opacity 0.5s ease 0.7s, transform 0.5s ease 0.7s',
        }}
      >
        {insight.narrative}
      </div>
    </div>
  );
}

// ─── CSS Keyframes (injected once) ───────────────────────────────────────────

const styleId = 'intel-panel-keyframes';
function injectKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    @keyframes intelSpin {
      to { transform: rotate(360deg); }
    }
    @keyframes intelPulse {
      0%, 100% { transform: scale(1); opacity: 0.8; }
      50% { transform: scale(1.08); opacity: 1; }
    }
    @media (prefers-reduced-motion: reduce) {
      @keyframes intelSpin { to { transform: none; } }
      @keyframes intelPulse { 0%, 100% { transform: none; opacity: 1; } }
    }
  `;
  document.head.appendChild(style);
}

// ─── Default Prompt ──────────────────────────────────────────────────────────

function DefaultPrompt() {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center text-center h-100"
      style={{ minHeight: 300, padding: '2rem 1rem' }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-bg-alt)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.5rem',
          marginBottom: 16,
        }}
      >
        👈
      </div>
      <div className="fw-semibold mb-1" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>
        Tap a stage to explore
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', maxWidth: 260 }}>
        Click any node in the funnel to see real-time intelligence about that stage.
      </div>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface Props {
  selectedStageId: string | null;
}

export default function InsightPanel({ selectedStageId }: Props) {
  const node = selectedStageId ? getNode(selectedStageId) : null;
  const insight = selectedStageId ? INSIGHTS[selectedStageId] : null;
  const catColor = node ? (CATEGORY_COLORS[node.category] || node.color) : 'var(--color-primary)';
  const category = node?.category || 'source';

  // Loading sequence state
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [showContent, setShowContent] = useState(false);
  const [contentReady, setContentReady] = useState(false);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => { injectKeyframes(); }, []);

  useEffect(() => {
    if (!selectedStageId || selectedStageId === prevIdRef.current) return;
    prevIdRef.current = selectedStageId;

    // Skip animation for reduced motion
    if (prefersReducedMotion()) {
      setIsLoading(false);
      setShowContent(true);
      setContentReady(true);
      return;
    }

    // Start loading sequence
    setIsLoading(true);
    setShowContent(false);
    setContentReady(false);
    setLoadingStep(0);

    const stepDuration = 420;
    const steps = LOADING_STEPS[category] || LOADING_STEPS.source;
    const timers: ReturnType<typeof setTimeout>[] = [];

    for (let i = 1; i <= steps.length; i++) {
      timers.push(setTimeout(() => {
        setLoadingStep(i);
        if (i === steps.length) {
          // All steps done — transition to content
          timers.push(setTimeout(() => {
            setIsLoading(false);
            setShowContent(true);
            // Small delay before triggering count-up animations
            timers.push(setTimeout(() => setContentReady(true), 50));
          }, 300));
        }
      }, i * stepDuration));
    }

    return () => timers.forEach(t => clearTimeout(t));
  }, [selectedStageId, category]);

  // Reset when deselected
  useEffect(() => {
    if (!selectedStageId) {
      prevIdRef.current = null;
      setIsLoading(false);
      setShowContent(false);
      setContentReady(false);
    }
  }, [selectedStageId]);

  const steps = LOADING_STEPS[category] || LOADING_STEPS.source;

  return (
    <div
      className="card border-0 shadow-sm h-100"
      style={{ borderRadius: '1rem', overflow: 'hidden' }}
      aria-live="polite"
      aria-label="Intelligence insights panel"
    >
      {/* Color accent bar */}
      <div
        style={{
          height: 4,
          background: node ? catColor : 'var(--color-border)',
          transition: 'background 0.3s ease',
        }}
      />

      <div className="card-body" style={{ padding: '1.25rem' }}>
        {node && insight ? (
          <>
            {/* Header — always visible once selected */}
            <div className="d-flex align-items-center gap-2 mb-3">
              <span style={{ fontSize: '1.3rem' }}>{node.icon}</span>
              <div>
                <div className="fw-bold" style={{ fontSize: '1rem', color: catColor, lineHeight: 1.2 }}>
                  {insight.title}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                  {insight.subtitle}
                </div>
              </div>
            </div>

            {isLoading ? (
              <LoadingSequence steps={steps} currentStep={loadingStep} color={catColor} />
            ) : showContent ? (
              <InsightContent insight={insight} color={catColor} animate={contentReady} />
            ) : null}
          </>
        ) : (
          <DefaultPrompt />
        )}
      </div>
    </div>
  );
}
