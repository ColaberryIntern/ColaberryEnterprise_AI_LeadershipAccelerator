import React, { useCallback, useEffect, useState } from 'react';
import { EmptyState, SectionCard, StatusBadge } from '../shell';
import {
  applyRoute, listNumbers, listRoutes, statusOf, studioErrorMessage, validateRoute, type NumberRow, type RouteChange, type RouteRow, type RouteValidation,
} from '../../../services/voiceStudioApi';
import { ENGINE_LABEL } from './voiceStudioFormat';

/**
 * Numbers & Routing (VS3.4). Numbers are shown by reference, never as a phone number. A route change
 * is validated first (which shows its impact) and applied second; the server refuses to apply a
 * change that was not validated exactly as sent. Nothing here buys, ports or releases a number.
 */
const MODES = ['legacy', 'shadow', 'test', 'canary', 'live', 'disabled'] as const;

const toChange = (r: RouteRow): RouteChange => ({
  pathKey: r.path_key, callType: r.call_type, brandSlug: r.brand_slug, mode: r.mode, canaryPercent: r.canary_percent, versionId: r.version_id,
  fallback: { kind: r.fallback?.kind ?? 'legacy', ...(r.fallback?.ref ? { ref: r.fallback.ref } : {}) },
});

const NEW_ROUTE: RouteChange = { pathKey: '', callType: 'interest', brandSlug: 'colaberry', mode: 'shadow', canaryPercent: 0, versionId: null, fallback: { kind: 'legacy' } };

export default function NumbersRoutingTab(): React.ReactElement {
  const [numbers, setNumbers] = useState<NumberRow[] | null>(null);
  const [routes, setRoutes] = useState<RouteRow[] | null>(null);
  const [off, setOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; change: RouteChange } | null>(null);
  const [check, setCheck] = useState<RouteValidation | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([listNumbers(), listRoutes()])
      .then(([n, r]) => { setNumbers(n); setRoutes(r); setOff(false); })
      .catch((e) => { if (statusOf(e) === 404) setOff(true); else setError(studioErrorMessage(e, 'Numbers and routes could not be loaded.')); });
  }, []);
  useEffect(() => { load(); }, [load]);

  if (off) return <EmptyState icon="toggle-line" title="Voice Studio is switched off on this server" description="An administrator turns it on with VOICE_STUDIO_UI_ENABLED. Calls are not affected either way." />;
  if (error) return <div className="alert alert-danger" role="alert">{error}</div>;
  if (!numbers || !routes) return <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading</span></div></div>;

  const change = <K extends keyof RouteChange>(k: K, v: RouteChange[K]) => { setCheck(null); setEdit((e) => (e ? { ...e, change: { ...e.change, [k]: v } } : e)); };
  const act = async (fn: () => Promise<void>, fallback: string) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ tone: 'danger', text: studioErrorMessage(e, fallback) }); } finally { setBusy(false); } };
  const validate = () => act(async () => { setCheck(await validateRoute(edit!.id, edit!.change)); }, 'Validation could not run.');
  const apply = () => act(async () => {
    if (!check || !check.ok) return;
    await applyRoute(edit!.id, edit!.change, check.validationToken);
    setMsg({ tone: 'success', text: 'Route change applied.' });
    setEdit(null); setCheck(null); load();
  }, 'The change was not applied. Validate it again.');

  return (
    <div className="row g-3">
      <div className="col-lg-5">
        <SectionCard title="Numbers" icon="sim-card-line" subtitle="Owned numbers can be pointed at our engines. Nothing here buys or ports a number.">
          {numbers.length === 0 ? <p className="text-muted small mb-0">No numbers registered.</p> : (
            <ul className="list-unstyled mb-0 d-grid gap-2" data-testid="numbers">
              {numbers.map((n) => (
                <li key={n.id} className="d-flex justify-content-between align-items-start gap-2">
                  <span><strong>{n.number_ref}</strong><br /><span className="small text-muted">{n.provider}, {n.ownership === 'owned' ? 'owned by us' : `held by ${n.ownership}`}{n.brand_slug ? `, ${n.brand_slug}` : ''}</span></span>
                  <StatusBadge label={n.status} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      <div className="col-lg-7">
        <SectionCard title="Routes" icon="route-line" actions={<button type="button" className="btn btn-sm btn-outline-primary" onClick={() => { setEdit({ id: null, change: { ...NEW_ROUTE } }); setCheck(null); }}>New route</button>}>
          {routes.length === 0 ? <p className="text-muted small mb-0" data-testid="routes-empty">No routes yet. Today every call uses Synthflow.</p> : (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light"><tr><th scope="col">Path</th><th scope="col">Mode</th><th scope="col">Engine</th><th scope="col" className="text-end">Calls 7d</th><th scope="col" /></tr></thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.id}>
                      <td>{r.path_key}<div className="small text-muted">{r.brand_slug}, {r.call_type}</div></td>
                      <td><StatusBadge label={r.mode === 'canary' ? `canary ${r.canary_percent}%` : r.mode} tone={r.mode === 'live' || r.mode === 'canary' ? 'warning' : 'neutral'} /></td>
                      <td className="small">{ENGINE_LABEL[r.engine] ?? r.engine}</td>
                      <td className="text-end">{r.calls_7d}</td>
                      <td className="text-end"><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => { setEdit({ id: r.id, change: toChange(r) }); setCheck(null); }}>Change</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
        {edit && (
          <div className="mt-3">
            <SectionCard title={edit.id ? `Change ${edit.change.pathKey}` : 'New route'} icon="edit-2-line">
              <div className="row g-2 mb-2">
                <div className="col-md-4"><label className="form-label small" htmlFor="vr-path">Path key</label><input id="vr-path" className="form-control form-control-sm" value={edit.change.pathKey} disabled={!!edit.id} onChange={(e) => change('pathKey', e.target.value)} /></div>
                <div className="col-md-4"><label className="form-label small" htmlFor="vr-mode">Mode</label><select id="vr-mode" className="form-select form-select-sm" value={edit.change.mode} onChange={(e) => { change('mode', e.target.value); if (e.target.value !== 'canary') change('canaryPercent', 0); }}>{MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
                <div className="col-md-4"><label className="form-label small" htmlFor="vr-canary">Canary percent</label><input id="vr-canary" type="number" min={0} max={50} className="form-control form-control-sm" value={edit.change.canaryPercent} disabled={edit.change.mode !== 'canary'} onChange={(e) => change('canaryPercent', Number(e.target.value))} /></div>
                <div className="col-md-6"><label className="form-label small" htmlFor="vr-version">Agent version id</label><input id="vr-version" className="form-control form-control-sm" value={edit.change.versionId ?? ''} onChange={(e) => change('versionId', e.target.value || null)} /></div>
                <div className="col-md-6"><label className="form-label small" htmlFor="vr-fallback">Fallback</label><select id="vr-fallback" className="form-select form-select-sm" value={edit.change.fallback.kind} onChange={(e) => change('fallback', { kind: e.target.value })}>{['legacy', 'human_line', 'voicemail', 'none'].map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
                {edit.change.mode === 'live' && <div className="col-12"><label className="form-label small" htmlFor="vr-confirm">Type MOVE REAL CALLERS to confirm</label><input id="vr-confirm" className="form-control form-control-sm" value={edit.change.confirm ?? ''} onChange={(e) => change('confirm', e.target.value)} /></div>}
              </div>
              <div className="d-flex gap-2 mb-2">
                <button type="button" className="btn btn-sm btn-outline-primary" disabled={busy} onClick={() => { void validate(); }}>Validate and show impact</button>
                <button type="button" className="btn btn-sm btn-danger" disabled={busy || !check || !check.ok} onClick={() => { void apply(); }}>Apply change</button>
                <button type="button" className="btn btn-sm btn-link" onClick={() => { setEdit(null); setCheck(null); }}>Cancel</button>
              </div>
              <div role="status" aria-live="polite">
                {check && !check.ok && <div className="alert alert-warning small mb-0" data-testid="route-issues"><ul className="mb-0">{check.issues.map((i) => <li key={i}>{i}</li>)}</ul></div>}
                {check && check.ok && <div className={`alert small mb-0 ${check.impact.movesRealCallers ? 'alert-danger' : 'alert-info'}`} data-testid="route-impact">{check.impact.summary}{check.impact.movesRealCallers && ' This moves real callers.'}</div>}
              </div>
            </SectionCard>
          </div>
        )}
      </div>
      <div className="col-12">{msg && <div className={`alert alert-${msg.tone} small`} data-testid="route-msg">{msg.text}</div>}</div>
    </div>
  );
}
