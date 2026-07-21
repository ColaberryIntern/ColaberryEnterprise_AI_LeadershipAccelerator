import React from 'react';
import type { OrgMemberDetail, OrgRosterMember } from '../../../services/orgApi';
import { card, h2, muted, sub, initials, lvlTone, prettyLevel, prettySlug, Bar, Spark } from './companyUi';

/**
 * Per-student drilldown for the manager — the same layout as the `/try` preview,
 * driven by the live `/api/portal/org/members/:id` payload. Every section degrades
 * to a friendly empty note when its slice of data is null/empty (the backend
 * returns null per-section rather than failing the whole request).
 */

const emptyNote = (text: string) => (
  <div style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>{text}</div>
);

export default function CompanyMemberDrilldown({
  detail, roster, onBack,
}: { detail: OrgMemberDetail; roster?: OrgRosterMember; onBack: () => void }) {
  const level = detail.promotion?.level ?? roster?.level ?? 'builder';
  const rank = detail.promotion?.rank ?? roster?.rank ?? 0;
  const readinessPct = detail.readiness?.pct ?? roster?.readiness ?? 0;
  const nextLevel = detail.promotion?.next_level ?? detail.readiness?.next_level ?? null;
  const gaps = detail.promotion?.gaps ?? detail.readiness?.gaps ?? [];
  const streak = detail.engagement?.streak_days ?? roster?.streak ?? 0;
  const bxp = roster?.builder_xp_week ?? detail.skill_xp?.builder ?? 0;
  const team = detail.team ?? roster?.team ?? null;
  const tone = lvlTone(rank);

  const sp = detail.section_progress;
  const spBegin = sp?.beginning != null ? Math.round(sp.beginning * 100) : null;
  const spCurrent = sp?.current != null ? Math.round(sp.current * 100) : null;
  const spGrowth = sp?.growth != null ? Math.round(sp.growth * 100) : null;

  const layers = detail.skill_genome?.layers ?? [];

  // Weekly evaluation trend, chronological (backend returns newest-first).
  const evalScores = [...detail.evaluations].reverse()
    .map((e) => e.overall_score)
    .filter((s): s is number => typeof s === 'number');
  const lastEval = evalScores[evalScores.length - 1];
  const evalSlope = evalScores.length >= 2 ? (lastEval - evalScores[0]) / (evalScores.length - 1) : 0;
  const evalProjected = evalScores.length >= 2 ? [lastEval, lastEval + evalSlope, lastEval + 2 * evalSlope].map((v) => Math.round(v)) : [];
  const latestSummary = detail.evaluations.find((e) => e.progress_summary)?.progress_summary ?? null;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
      <button type="button" onClick={onBack} style={{ justifySelf: 'start', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-link)', fontWeight: 700, fontSize: 'var(--fs-body-sm)' }}>&larr; Back to your company</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 60, height: 60, borderRadius: '50%', background: `color-mix(in srgb, ${tone} 16%, white)`, color: 'var(--text-strong)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'var(--fs-h5)' }}>{initials(detail.name)}</span>
        <div>
          <h1 style={{ ...h2, fontSize: 'var(--fs-h2)', fontWeight: 900, margin: 0 }}>{detail.name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-caption)', color: '#fff', background: tone, padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>{prettyLevel(level)} · rank {rank}/8</span>
            <span style={muted}>{team || 'Unassigned'} · {readinessPct}% readiness · {streak}-day streak · <span style={{ color: '#5BA63C', fontWeight: 700 }}>+{bxp} builder XP/wk</span></span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--space-6)', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }} className="try-cols">
        {/* knowledge growth (pre -> post) */}
        <div style={{ ...card, borderTop: '4px solid #367895' }}>
          <div style={sub}>Knowledge growth · pre-check &rarr; evaluation</div>
          {sp ? (
            <>
              <Bar label="Entry knowledge check" pct={spBegin ?? 0} color="var(--border-strong)" right={spBegin != null ? `${spBegin}%` : '—'} />
              <Bar label="End-of-section evaluation" pct={spCurrent ?? 0} color="#5BA63C" right={spCurrent != null ? `${spCurrent}%` : '—'} />
              <p style={{ ...muted, fontSize: 'var(--fs-caption)', marginTop: 'var(--space-2)' }}>
                Week {sp.week}{spGrowth != null ? <> · <span style={{ color: '#5BA63C', fontWeight: 700 }}>+{spGrowth} pts</span> growth</> : ''}{sp.evaluation_passed === true ? ' · passed' : ''}
              </p>
              {sp.per_competency.length > 0 && (
                <div style={{ marginTop: 'var(--space-3)' }}>
                  {sp.per_competency.slice(0, 4).map((c) => (
                    <div key={c.domain} style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-body)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{prettySlug(c.domain)}</span>
                      <span style={{ fontWeight: 700, color: c.delta != null && c.delta > 0 ? '#5BA63C' : 'var(--text-muted)' }}>{c.delta != null ? `${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 100)}` : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : emptyNote('No pre/post assessment data yet.')}
        </div>

        {/* readiness + what's left */}
        <div style={{ ...card, borderTop: '4px solid #7A5AF0' }}>
          <div style={sub}>Architect readiness · {readinessPct}%{nextLevel ? ` → ${prettyLevel(nextLevel)}` : ''}</div>
          <div style={{ height: 10, borderRadius: 'var(--radius-pill)', background: 'var(--surface-sunken)', overflow: 'hidden', marginBottom: 'var(--space-4)' }}><div style={{ width: `${Math.max(2, Math.min(100, readinessPct))}%`, height: '100%', background: '#7A5AF0', borderRadius: 'var(--radius-pill)' }} /></div>
          <div style={{ fontSize: 'var(--fs-caption)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>What&rsquo;s left to promote</div>
          {gaps.length ? gaps.map((g) => (<div key={g} style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-body)', padding: '4px 8px', background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)', marginBottom: 4 }}>{g}</div>)) : <div style={{ fontSize: 'var(--fs-caption)', color: '#5BA63C', fontWeight: 700 }}>All gates cleared — top of the ladder.</div>}
        </div>

        {/* competency confidence (skill genome) */}
        <div style={card}>
          <div style={sub}>Competency confidence</div>
          {layers.length ? layers.slice(0, 6).map((l) => (
            <Bar key={l.id} label={prettySlug(l.name)} pct={Math.round((l.avg_proficiency / 5) * 100)} color="#367895" right={`Lv ${l.avg_proficiency.toFixed(1)}`} />
          )) : emptyNote('No skill-genome signal captured yet.')}
        </div>

        {/* building & evidence */}
        <div style={card}>
          <div style={sub}>Building &amp; evidence</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            {[['Projects', detail.project_count] as [string, number], ...detail.evidence_by_source.slice(0, 5).map((e) => [prettySlug(e.source_type), e.count] as [string, number])].map(([l, v]) => (
              <div key={l} style={{ background: 'var(--surface-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-2) var(--space-3)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text-strong)' }}>{v}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l}</div>
              </div>
            ))}
          </div>
          {detail.evidence_by_source.length === 0 && detail.project_count === 0 && emptyNote('No evidence or projects logged yet.')}
        </div>

        {/* XP by stream */}
        <div style={card}>
          <div style={sub}>Skill XP by stream</div>
          {detail.skill_xp ? (
            <>
              <Bar label="Learning" pct={Math.min(100, detail.skill_xp.learning / 4)} color="#367895" right={`${detail.skill_xp.learning} XP`} />
              <Bar label="Builder" pct={Math.min(100, detail.skill_xp.builder / 7)} color="#5BA63C" right={`${detail.skill_xp.builder} XP`} />
              <Bar label="Community" pct={Math.min(100, detail.skill_xp.community)} color="#2BA39A" right={`${detail.skill_xp.community} XP`} />
            </>
          ) : emptyNote('No XP earned yet.')}
        </div>

        {/* weekly eval + velocity */}
        <div style={{ ...card, borderTop: '4px solid #5BA63C' }}>
          <div style={sub}>Weekly evaluation &amp; velocity</div>
          {evalScores.length >= 2 ? (
            <>
              <Spark actual={evalScores} projected={evalProjected} />
              <p style={{ ...muted, marginTop: 'var(--space-3)' }}>Evaluation scores: {evalScores.join(' → ')}{latestSummary ? <> · {latestSummary}</> : ''}</p>
            </>
          ) : evalScores.length === 1 ? (
            <p style={muted}>One evaluation so far: <strong style={{ color: 'var(--text-strong)' }}>{evalScores[0]}</strong>. Velocity appears after the next one.{latestSummary ? <> {latestSummary}</> : ''}</p>
          ) : emptyNote('No weekly evaluations recorded yet.')}
        </div>
      </div>
    </div>
  );
}
