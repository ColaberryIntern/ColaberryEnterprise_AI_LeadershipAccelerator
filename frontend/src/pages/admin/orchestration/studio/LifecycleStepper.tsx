import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../../utils/api';
import { Lab, Btn } from './studioKit';

/**
 * LifecycleStepper — visualizes the explicit 10-state Runtime Lifecycle of an AI
 * Component (draft → generated → validated → published → student_opened →
 * generated_runtime → completed → evaluated → archived → version_locked).
 * Authoring states are settable with transition validation; runtime states are
 * observed from analytics. Backed by /api/admin/components/:slug/lifecycle.
 */

const NICE: Record<string, string> = {
  draft: 'Draft', generated: 'Generated', validated: 'Validated', published: 'Published',
  student_opened: 'Opened', generated_runtime: 'Runtime', completed: 'Completed',
  evaluated: 'Evaluated', archived: 'Archived', version_locked: 'Locked',
};

interface Life { states: string[]; current: string; reached_index: number; allowed_transitions: string[]; status: string; version_locked: boolean }

const LifecycleStepper: React.FC<{ slug: string; onChanged?: () => void }> = ({ slug, onChanged }) => {
  const [life, setLife] = useState<Life | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try { const r = await api.get(`/api/admin/components/${slug}/lifecycle`); setLife(r.data); }
    catch { setErr('Could not load lifecycle'); }
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const transition = async (to: string) => {
    setBusy(to); setErr('');
    try { const r = await api.put(`/api/admin/components/${slug}/lifecycle`, { state: to }); setLife(r.data); onChanged?.(); }
    catch (e: any) { setErr(e?.response?.data?.error || 'Transition blocked'); } finally { setBusy(''); }
  };

  if (!life) return <div className="es-muted">Loading lifecycle…</div>;

  return (
    <div>
      <Lab>Runtime lifecycle</Lab>
      <div className="es-life">
        {life.states.map((s, i) => {
          const done = i < life.reached_index, cur = i === life.reached_index;
          return (
            <React.Fragment key={s}>
              {i > 0 && <div className={`es-lifebar ${i <= life.reached_index ? 'done' : ''}`} />}
              <div className="es-lifenode">
                <div className={`es-lifedot ${done ? 'done' : ''} ${cur ? 'cur' : ''}`}>{cur ? '●' : done ? '✓' : i + 1}</div>
                <div className={`es-lifelabel ${cur ? 'cur' : ''}`}>{NICE[s] || s}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
        <span className="es-muted">Set state:</span>
        {life.allowed_transitions.length === 0 ? <span className="es-muted">— terminal —</span> : life.allowed_transitions.map((t) => (
          <Btn key={t} disabled={!!busy} onClick={() => transition(t)}>{busy === t ? '…' : `→ ${NICE[t] || t}`}</Btn>
        ))}
        {!life.version_locked && <Btn onClick={() => transition('version_locked')} disabled={!!busy}>🔒 Lock version</Btn>}
      </div>
      {err && <div className="es-err" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
};

export default LifecycleStepper;
