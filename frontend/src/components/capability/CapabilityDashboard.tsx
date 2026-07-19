import React from 'react';
import { Badge } from '../../colaberry/components/core/Badge';
import { ILLUSTRATIVE_DASHBOARD, ILLUSTRATIVE_ROSTER } from '../../data/capabilityModel';

const good = '#5BA63C', mid = '#E8920C', low = '#FB2832';
const barColor = (pct: number): string => (pct >= 75 ? good : pct >= 55 ? mid : low);
const tierColor = (tier: string): string =>
  tier === 'Architect' ? '#E8920C' : tier === 'Builder' ? '#5BA63C' : '#367895';

interface DashboardProps {
  /** 'org' = CIO readiness view; 'team' = sponsor roster view. Same visual language. */
  variant?: 'org' | 'team';
}

/**
 * The single canonical platform dashboard, used consistently across the homepage,
 * program, and employer pages. One dark card, one metric-tile style, one bar style;
 * two data views (organization readiness, sponsored-team roster).
 */
export default function CapabilityDashboard({ variant = 'org' }: DashboardProps) {
  const onInv = (p: number) => `color-mix(in srgb, var(--text-on-inverse) ${p}%, transparent)`;
  const track = onInv(12);
  const label: React.CSSProperties = {
    fontSize: 'var(--fs-overline)', fontWeight: 700, letterSpacing: 'var(--ls-overline)',
    textTransform: 'uppercase', color: '#8FB3E6', margin: '0 0 var(--space-4)',
  };
  const shell: React.CSSProperties = {
    background: 'var(--surface-inverse)', color: 'var(--text-on-inverse)',
    border: `var(--border-1) solid ${onInv(10)}`,
    borderRadius: 'var(--radius-2xl)', boxShadow: 'var(--shadow-xl)', padding: 'var(--space-8)',
  };

  const Tile = ({ value, name }: { value: string; name: string }) => (
    <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', textAlign: 'center', background: onInv(6), border: `var(--border-1) solid ${track}` }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-h4)' }}>{value}</div>
      <div style={{ fontSize: 'var(--fs-caption)', color: onInv(70) }}>{name}</div>
    </div>
  );

  const Header = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
      <div>
        <div style={{ ...label, marginBottom: 'var(--space-2)' }}>{eyebrow}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-h4)' }}>{title}</div>
      </div>
      <Badge tone="neutral" outline>Illustrative</Badge>
    </div>
  );

  if (variant === 'team') {
    return (
      <div style={shell}>
        <Header eyebrow="Sponsor dashboard" title="Your team, one live view" />
        <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: 'var(--space-8)' }}>
          <Tile value="14" name="Seats active" />
          <Tile value="72%" name="Avg progress" />
          <Tile value="3" name="On Architect track" />
          <Tile value="5" name="Demo Day shortlist" />
        </div>
        <p style={label}>Who is building right now</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {ILLUSTRATIVE_ROSTER.map((m) => (
            <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 2fr auto', gap: 'var(--space-3)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--fs-body-sm)', fontWeight: 600 }}>{m.name}</span>
              <span style={{ fontSize: 'var(--fs-caption)', color: onInv(74) }}>{m.team}</span>
              <div style={{ height: 8, borderRadius: 'var(--radius-pill)', background: track, overflow: 'hidden' }}>
                <div style={{ width: `${m.progress}%`, height: '100%', background: barColor(m.progress), borderRadius: 'var(--radius-pill)' }} />
              </div>
              <span style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: '#fff', background: tierColor(m.tier), padding: '2px 10px', borderRadius: 'var(--radius-pill)' }}>{m.tier}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // variant === 'org'
  const d = ILLUSTRATIVE_DASHBOARD;
  const maxTier = Math.max(...d.tiers.map((t) => t.count));
  return (
    <div style={shell}>
      <Header eyebrow="AI Capability Dashboard" title="Organizational readiness" />
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '48px', lineHeight: 1 }}>{d.overallReadiness}%</span>
          <span style={{ color: onInv(74) }}>overall AI readiness</span>
        </div>
        <div style={{ height: 10, borderRadius: 'var(--radius-pill)', background: track, overflow: 'hidden', marginTop: 'var(--space-3)' }}>
          <div style={{ width: `${d.overallReadiness}%`, height: '100%', background: barColor(d.overallReadiness), borderRadius: 'var(--radius-pill)' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gap: 'var(--space-8)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div>
          <p style={label}>By department</p>
          {d.departments.map((dep) => (
            <div key={dep.name} style={{ marginBottom: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-body-sm)', marginBottom: 4 }}>
                <span style={{ color: onInv(86) }}>{dep.name}</span><span style={{ fontWeight: 700 }}>{dep.pct}%</span>
              </div>
              <div style={{ height: 7, borderRadius: 'var(--radius-pill)', background: track, overflow: 'hidden' }}>
                <div style={{ width: `${dep.pct}%`, height: '100%', background: barColor(dep.pct), borderRadius: 'var(--radius-pill)' }} />
              </div>
            </div>
          ))}
        </div>
        <div>
          <p style={label}>People by capability</p>
          {d.tiers.map((t) => (
            <div key={t.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
              <div style={{ width: 92, fontSize: 'var(--fs-body-sm)', color: onInv(86) }}>{t.name}</div>
              <div style={{ flexGrow: 1, height: 18, borderRadius: 'var(--radius-sm)', background: track, overflow: 'hidden' }}>
                <div style={{ width: `${(t.count / maxTier) * 100}%`, height: '100%', background: 'var(--chart-1)', borderRadius: 'var(--radius-sm)' }} />
              </div>
              <div style={{ width: 40, textAlign: 'right', fontWeight: 700, fontSize: 'var(--fs-body-sm)' }}>{t.count}</div>
            </div>
          ))}
        </div>
      </div>
      <p style={{ ...label, marginTop: 'var(--space-8)' }}>Business impact</p>
      <div style={{ display: 'grid', gap: 'var(--space-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
        {d.impact.map((m) => (<Tile key={m.name} value={m.value} name={m.name} />))}
      </div>
    </div>
  );
}
