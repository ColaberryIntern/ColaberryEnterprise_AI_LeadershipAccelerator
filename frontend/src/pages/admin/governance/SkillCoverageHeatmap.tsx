import React, { useEffect, useMemo, useState } from 'react';
import { SectionCard, StatusBadge } from '../../../components/admin/shell';
import { fetchSkillCoverageHeatmap, SkillCoverageHeatmap as HeatmapData, HeatmapCell } from '../../../services/capeApi';

/**
 * SkillCoverageHeatmap — CAPE Phase 6 (design doc §12 "Skill coverage
 * heatmap"). Read-only: 50 registered curriculum types x 10 Architecture
 * Skills, sourced from Phase 3's `curriculum_skill_maps` via the T006 bulk
 * resolver. Highlights cells where a type claims/teaches a skill (weight>0)
 * but never proves it (bands are claim/knowledge only, no application/
 * judgment) — the design doc's "special warning" case.
 */

const CREDIT_COLORS: Record<string, string> = {
  none: '#f7fafc',
  low: '#ebf8ff',
  medium: '#bee3f8',
  high: '#63b3ed',
  capstone: '#2b6cb0',
};

function cellStyle(cell: HeatmapCell | undefined): React.CSSProperties {
  if (!cell || cell.weight <= 0) return { background: '#fafafa', color: '#a0aec0' };
  const bg = CREDIT_COLORS[cell.credit_strength || 'none'] ?? '#f7fafc';
  const dark = cell.credit_strength === 'high' || cell.credit_strength === 'capstone';
  return { background: bg, color: dark ? '#fff' : '#2d3748', fontWeight: 600 };
}

function cellTitle(cell: HeatmapCell | undefined): string {
  if (!cell || cell.weight <= 0) return 'no mapping for this skill';
  return `weight ${cell.weight} · ${cell.credit_strength || 'none'} · bands: ${cell.bands.length ? cell.bands.join(', ') : 'none'}${cell.has_proof_task ? '' : ' · NO PROOF TASK'}`;
}

const SkillCoverageHeatmap: React.FC = () => {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchSkillCoverageHeatmap();
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setError('Could not load the skill coverage heatmap right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const cellByKey = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    (data?.cells || []).forEach((c) => map.set(`${c.type_slug}::${c.skill_id}`, c));
    return map;
  }, [data]);

  const gapKeys = useMemo(() => new Set((data?.gaps || []).map((g) => `${g.type_slug}::${g.skill_id}`)), [data]);

  if (loading) return <SectionCard title="Skill Coverage Heatmap" icon="grid-line"><div className="text-muted">Loading…</div></SectionCard>;
  if (error) return <SectionCard title="Skill Coverage Heatmap" icon="grid-line"><div className="alert alert-danger">{error}</div></SectionCard>;
  if (!data) return null;

  return (
    <SectionCard
      title="Skill Coverage Heatmap"
      subtitle={`${data.types.length} curriculum types x ${data.skills.length} Architecture Skills — sourced live from curriculum_skill_maps. Read-only.`}
      icon="grid-line"
      actions={
        <StatusBadge
          label={data.gaps.length === 0 ? 'NO GAPS FLAGGED' : `${data.gaps.length} PASSIVE-ONLY GAP${data.gaps.length === 1 ? '' : 'S'}`}
          tone={data.gaps.length === 0 ? 'success' : 'warning'}
        />
      }
    >
      <p className="text-muted small mb-3">
        A gap (⚠, amber outline) means a type claims or teaches a skill (weight &gt; 0) but its
        declared evidence bands are only Claim/Knowledge — no Application or Judgment proof task.
      </p>
      <div className="d-flex gap-3 align-items-center mb-3 small">
        <span className="text-muted">Credit strength:</span>
        {Object.entries(CREDIT_COLORS).map(([k, color]) => (
          <span key={k} className="d-inline-flex align-items-center gap-1">
            <span style={{ width: 14, height: 14, background: color, display: 'inline-block', borderRadius: 3, border: '1px solid #e2e8f0' }} />
            {k}
          </span>
        ))}
      </div>
      <div className="table-responsive" style={{ maxHeight: 640 }}>
        <table className="table table-sm table-bordered align-middle" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 2, minWidth: 160 }}>Type</th>
              {data.skills.map((s) => (
                <th key={s.skill_id} title={s.skill_id} style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', minWidth: 36, maxHeight: 120 }}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.types.map((t) => (
              <tr key={t.slug}>
                <th scope="row" style={{ position: 'sticky', left: 0, background: '#fff', zIndex: 1, fontWeight: 500 }}>
                  {t.label}
                </th>
                {data.skills.map((s) => {
                  const key = `${t.slug}::${s.skill_id}`;
                  const cell = cellByKey.get(key);
                  const isGap = gapKeys.has(key);
                  return (
                    <td
                      key={s.skill_id}
                      title={cellTitle(cell)}
                      style={{
                        ...cellStyle(cell),
                        textAlign: 'center',
                        outline: isGap ? '2px solid #dd6b20' : undefined,
                        outlineOffset: isGap ? '-2px' : undefined,
                      }}
                    >
                      {isGap ? '⚠' : (cell && cell.weight > 0 ? cell.weight.toFixed(1) : '')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.gaps.length > 0 && (
        <div className="mt-3">
          <h3 className="h6">Gap detail</h3>
          <ul className="small">
            {data.gaps.slice(0, 25).map((g) => (
              <li key={`${g.type_slug}-${g.skill_id}`}>{g.reason}</li>
            ))}
          </ul>
          {data.gaps.length > 25 && <div className="text-muted small">…and {data.gaps.length - 25} more.</div>}
        </div>
      )}
    </SectionCard>
  );
};

export default SkillCoverageHeatmap;
