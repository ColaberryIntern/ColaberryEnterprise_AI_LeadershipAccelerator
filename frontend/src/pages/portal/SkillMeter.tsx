import React from 'react';
import { TimelineFeedCard } from '../../components/timeline/TimelineCard';

/**
 * SkillMeter — the Free Preview's "how am I developing the basic AI skills" gauge.
 * Every preview activity is tagged with one or more competency domains; this rolls
 * the cards up into a bar per skill (completed / total) that fills as the student
 * finishes tagged activities. Replaces the flat "N items this week" count.
 *
 * Pure/presentational — derives everything from the cards' `competencies` tags, so
 * it moves live as the classroom feed reloads on completion.
 */

// Friendly names for the foundational AI-skill domains the preview tags.
const DOMAIN_LABEL: Record<string, string> = {
  ai_governance: 'AI Governance',
  architecture: 'AI Architecture',
  context_engineering: 'Context Engineering',
  decision_making: 'Decision-Making',
  systems_thinking: 'Systems Thinking',
  tradeoffs: 'Trade-offs',
  mcp: 'MCP & Tools',
  integration: 'Integration',
  communication: 'Communication',
  leadership: 'Leadership',
  claude_code: 'Claude Code',
  prompting: 'Prompting',
  evaluation: 'Evaluation',
};
function label(d: string): string {
  return DOMAIN_LABEL[d] || d.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The skill domains a card is tagged with — handles `[{domain_id}]` and plain strings. */
function domainsOf(card: TimelineFeedCard): string[] {
  const c = card.competencies as unknown;
  if (!Array.isArray(c)) return [];
  return c
    .map((x) => (typeof x === 'string' ? x : (x && typeof x === 'object' ? (x as { domain_id?: string }).domain_id : null)))
    .filter((d): d is string => !!d);
}

const COLORS = ['#367895', '#5BA63C', '#E8920C', '#FB2832', '#D97757', '#2E6A86', '#8B5CF6', '#0EA5A4'];

const SkillMeter: React.FC<{ cards: TimelineFeedCard[] }> = ({ cards }) => {
  const agg = new Map<string, { total: number; done: number }>();
  for (const card of cards) {
    const isDone = card.status === 'completed';
    for (const d of domainsOf(card)) {
      const cur = agg.get(d) || { total: 0, done: 0 };
      cur.total += 1;
      if (isDone) cur.done += 1;
      agg.set(d, cur);
    }
  }
  const rows = Array.from(agg.entries())
    .map(([d, v]) => ({ d, total: v.total, done: v.done, pct: v.total ? Math.round((v.done / v.total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct || b.total - a.total || a.d.localeCompare(b.d));
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  const totalAll = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="tl-card" style={{ padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: rows.length ? 14 : 4 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Your AI skills</h3>
        <span className="tl-small">
          {rows.length
            ? <>Each preview activity builds a foundational AI skill — watch these climb as you complete them. <b>{totalDone}</b> of <b>{totalAll}</b> skill-checks done.</>
            : 'Complete the preview activities and your foundational AI skills will start filling in here.'}
        </span>
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r, i) => (
            <div key={r.d}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, fontSize: 13.5 }}>
                <span style={{ fontWeight: 600 }}>{label(r.d)}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums', opacity: r.done ? 1 : 0.55 }}>{r.done}/{r.total}</b>
              </div>
              <div style={{ height: 8, borderRadius: 5, background: 'rgba(128,128,128,.18)', overflow: 'hidden' }}>
                <i style={{ display: 'block', height: '100%', width: `${r.pct}%`, background: COLORS[i % COLORS.length], borderRadius: 5, transition: 'width .55s ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SkillMeter;
