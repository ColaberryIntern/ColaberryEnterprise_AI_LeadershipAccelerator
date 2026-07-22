import React from 'react';
import { TimelineFeedCard } from '../../components/timeline/TimelineCard';

/**
 * SkillMeter — the Free Preview's "which foundational AI skills am I building" gauge.
 * The preview is a taste of the program, so it maps every activity onto the
 * FOUNDATIONAL AI skills a beginner needs first — LLM Fundamentals, Prompting, RAG,
 * Vectors & Embeddings, Agents & Tools, Evaluation & Guardrails — and each bar
 * fills as you complete activities that build that skill.
 *
 * The mapping lives here (activity type → foundational skills) rather than on the
 * card's `competencies` field on purpose: `competencies` drives the separate
 * architect competency/readiness engine, so we don't want to repurpose it. Every
 * activity type maps to at least one skill, so completing anything always moves the
 * meter. Pure/presentational — recomputes live as the classroom feed reloads.
 */

// The foundational skills, in the order a beginner meets them.
const FOUNDATIONAL: Array<{ key: string; label: string; color: string }> = [
  { key: 'llm', label: 'LLM Fundamentals', color: '#367895' },
  { key: 'prompting', label: 'Prompting', color: '#5BA63C' },
  { key: 'rag', label: 'RAG', color: '#E8920C' },
  { key: 'vectors', label: 'Vectors & Embeddings', color: '#D97757' },
  { key: 'agents', label: 'Agents & Tools', color: '#8B5CF6' },
  { key: 'evaluation', label: 'Evaluation & Guardrails', color: '#FB2832' },
];

// Activity type → the foundational skills it builds. Every type resolves to ≥1
// skill (default LLM), so no completion is ever a dead end.
const TYPE_SKILLS: Record<string, string[]> = {
  announcement: ['llm'],
  architect_mindset: ['agents', 'evaluation'],
  deep_dive: ['llm', 'rag'],
  knowledge_check: ['llm', 'vectors'],
  quiz: ['llm', 'vectors'],
  evaluation: ['evaluation'],
  warmup: ['prompting'],
  reflection: ['evaluation'],
  video: ['llm'],
  ai_video_stream: ['llm'],
  testimonial: ['llm'],
  blog: ['rag'],
  podcast: ['llm'],
  setup_lab: ['agents'],
  prompt_lab: ['prompting'],
  prompt_challenge: ['prompting'],
  survey: ['evaluation'],
  deep_dive_field_guide: ['rag', 'llm'],
};
function skillsForCard(card: TimelineFeedCard): string[] {
  return TYPE_SKILLS[card.type] || ['llm'];
}

const SkillMeter: React.FC<{ cards: TimelineFeedCard[] }> = ({ cards }) => {
  const agg = new Map<string, { total: number; done: number }>();
  for (const card of cards) {
    const isDone = card.status === 'completed';
    for (const s of skillsForCard(card)) {
      const cur = agg.get(s) || { total: 0, done: 0 };
      cur.total += 1;
      if (isDone) cur.done += 1;
      agg.set(s, cur);
    }
  }
  // Show the foundational skills the preview actually touches, in canonical order.
  const rows = FOUNDATIONAL
    .map((f) => ({ ...f, ...(agg.get(f.key) || { total: 0, done: 0 }) }))
    .filter((r) => r.total > 0)
    .map((r) => ({ ...r, pct: r.total ? Math.round((r.done / r.total) * 100) : 0 }));
  const totalDone = rows.reduce((s, r) => s + r.done, 0);
  const totalAll = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="tl-card" style={{ padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: rows.length ? 14 : 4 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Your foundational AI skills</h3>
        <span className="tl-small">
          {rows.length
            ? <>Every activity builds a foundational AI skill — watch these climb as you finish them. <b>{totalDone}</b> of <b>{totalAll}</b> skill-builds done.</>
            : 'Complete the preview activities and your foundational AI skills will start filling in here.'}
        </span>
      </div>
      {rows.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((r) => (
            <div key={r.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, fontSize: 13.5 }}>
                <span style={{ fontWeight: 600 }}>{r.label}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums', opacity: r.done ? 1 : 0.55 }}>{r.done}/{r.total}</b>
              </div>
              <div style={{ height: 8, borderRadius: 5, background: 'rgba(128,128,128,.18)', overflow: 'hidden' }}>
                <i style={{ display: 'block', height: '100%', width: `${r.pct}%`, background: r.color, borderRadius: 5, transition: 'width .55s ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SkillMeter;
