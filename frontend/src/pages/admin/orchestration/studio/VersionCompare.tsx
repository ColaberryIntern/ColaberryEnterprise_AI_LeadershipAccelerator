import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../../utils/api';
import { Cmp, Lab, Btn } from './studioKit';

/**
 * VersionCompare — side-by-side diff of any two AI Component versions (or a
 * version vs. current). Highlights changed / added / removed fields across the
 * full prompt bundle + metadata. Backed by /api/admin/components/:slug/compare/:a/:b.
 */

interface Diff { field: string; changed: boolean; a: any; b: any }
const fmt = (v: any) => (v == null ? '—' : typeof v === 'string' ? v : JSON.stringify(v, null, 2));

const VersionCompare: React.FC<{ sel: Cmp; versions: any[]; onRestore: (v: number) => void }> = ({ sel, versions, onRestore }) => {
  const opts = ['current', ...versions.map((v) => String(v.version))];
  const [a, setA] = useState<string>(versions[0] ? String(versions[0].version) : 'current');
  const [b, setB] = useState<string>('current');
  const [res, setRes] = useState<{ diffs: Diff[]; changed_count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState('');

  const compare = useCallback(async () => {
    if (!versions.length) return;
    setBusy(true); setErr('');
    try { const r = await api.get(`/api/admin/components/${sel.slug}/compare/${a}/${b}`); setRes(r.data); }
    catch (e: any) { setErr(e?.response?.data?.error || 'Compare failed'); } finally { setBusy(false); }
  }, [sel.slug, a, b, versions.length]);
  useEffect(() => { compare(); }, [compare]);

  const label = (o: string) => (o === 'current' ? `current (v${sel.component_version})` : `v${o}`);

  if (versions.length === 0) return <div className="es-muted">No saved versions yet — save an edit to build history, then compare.</div>;
  const rows = res ? res.diffs.filter((d) => showAll || d.changed) : [];

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <Lab style={{ margin: 0 }}>Compare</Lab>
        <select className="es-in" style={{ width: 'auto' }} value={a} onChange={(e) => setA(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>
        <span className="es-muted">vs</span>
        <select className="es-in" style={{ width: 'auto' }} value={b} onChange={(e) => setB(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>
        <Btn pri disabled={busy} onClick={compare}>{busy ? '…' : 'Compare'}</Btn>
        {res && <span className="es-muted">{res.changed_count} changed field{res.changed_count === 1 ? '' : 's'}</span>}
        {res && <label className="es-muted" style={{ marginLeft: 'auto', cursor: 'pointer' }}><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show unchanged</label>}
        {a !== 'current' && <Btn onClick={() => onRestore(Number(a))}>Restore {label(a)}</Btn>}
      </div>
      {err && <div className="es-err">{err}</div>}
      {res && (
        <div className="es-cmp">
          <div className="h k">Field</div><div className="h">{label(a)}</div><div className="h">{label(b)}</div>
          {rows.length === 0 ? <div style={{ gridColumn: '1 / 4' }} className="es-muted">No differences.</div> : rows.map((d) => {
            const cls = !d.changed ? '' : d.a == null ? 'add' : d.b == null ? 'del' : 'chg';
            return (
              <React.Fragment key={d.field}>
                <div className="k">{d.field}</div>
                <div className={cls}><div className="es-cmpval">{fmt(d.a)}</div></div>
                <div className={cls}><div className="es-cmpval">{fmt(d.b)}</div></div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VersionCompare;
