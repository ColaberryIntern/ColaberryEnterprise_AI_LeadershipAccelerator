import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchGovManagement, markGovSubmitted, adminAssembleGovPackage, errorMessage,
  type GovManagementView,
} from '../../services/adminGovContractsApi';

/**
 * GovManagementPanel (M5) - Ali's live management window for ONE gov proposal, rendered on the ADMIN cockpit page
 * only (never inside the shared StudioShell, so no admin control reaches the intern portal). It reads the composed
 * GET .../management view and offers the two management actions: export the package (reuses package/assemble) and
 * record the external submission (full-admin; the bid then becomes a potential-win in the Revenue Room).
 *
 * Honesty rails mirrored from the backend: R2 is shown PARKED (gated, not hidden, so management knows it exists but
 * is held until the bid is won); a submitted bid shows its close date with the human-priced value OR "Value pending"
 * - never a fabricated amount.
 */

const fmtUsd = (cents: number): string =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const fmtDate = (d: string | null): string => {
  if (!d) return 'no close date recorded';
  const ms = Date.parse(d);
  return Number.isNaN(ms) ? d : new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

type State =
  | { k: 'loading' }
  | { k: 'ready'; view: GovManagementView }
  | { k: 'error'; message: string };

const GovManagementPanel: React.FC<{ projectId: string }> = ({ projectId }) => {
  const [state, setState] = useState<State>({ k: 'loading' });
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState<'export' | 'submit' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(() => {
    let live = true;
    setState({ k: 'loading' });
    fetchGovManagement(projectId)
      .then((view) => { if (live) setState({ k: 'ready', view }); })
      .catch((e: unknown) => { if (live) setState({ k: 'error', message: errorMessage(e, 'Could not load the management view.') }); });
    return () => { live = false; };
  }, [projectId]);

  useEffect(() => load(), [load]);

  const onExport = useCallback(async () => {
    setBusy('export'); setNotice(null);
    try {
      const r = await adminAssembleGovPackage(projectId);
      setNotice(r.ok ? { tone: 'ok', text: 'Package assembled. You can now record the submission.' }
        : { tone: 'err', text: `Not ready to export: ${(r.blocking ?? []).join(', ') || 'responses are not all approved yet.'}` });
      load();
    } catch (e) { setNotice({ tone: 'err', text: errorMessage(e, 'Could not assemble the package.') }); }
    finally { setBusy(null); }
  }, [projectId, load]);

  const onMarkSubmitted = useCallback(async () => {
    const trimmed = ref.trim();
    if (!trimmed) { setNotice({ tone: 'err', text: 'A submission receipt reference is required.' }); return; }
    setBusy('submit'); setNotice(null);
    try {
      const view = await markGovSubmitted(projectId, trimmed);
      setState({ k: 'ready', view });
      setRef('');
      setNotice({ tone: 'ok', text: 'Submission recorded. It is now a potential-win in the Revenue Room.' });
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setNotice({ tone: 'err', text: status === 403
        ? 'Recording a submission requires a full administrator.'
        : errorMessage(e, 'Could not record the submission.') });
    } finally { setBusy(null); }
  }, [projectId, ref]);

  if (state.k === 'loading') return <div className="card mb-3"><div className="card-body text-muted">Loading the management view…</div></div>;
  if (state.k === 'error') {
    return (
      <div className="card mb-3"><div className="card-body">
        <p className="text-danger mb-2">{state.message}</p>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={load}>Try again</button>
      </div></div>
    );
  }

  const v = state.view;
  const pw = v.potentialWin;

  return (
    <div className="card mb-3" data-testid="gov-management-panel">
      <div className="card-header d-flex align-items-center justify-content-between">
        <span className="fw-semibold"><i className="ri-focus-3-line me-2" aria-hidden="true" />Proposal management</span>
        <button type="button" className="btn btn-link btn-sm p-0" onClick={load} title="Refresh">
          <i className="ri-refresh-line" aria-hidden="true" /> Refresh
        </button>
      </div>
      <div className="card-body">
        {notice && (
          <div className={`alert ${notice.tone === 'ok' ? 'alert-success' : 'alert-danger'} py-2 px-3`} role="status">{notice.text}</div>
        )}

        {/* Revenue Room / potential-win */}
        <div className="mb-3">
          <div className="text-uppercase text-muted small fw-bold mb-1">Revenue Room</div>
          {pw.submitted ? (
            <div data-testid="potential-win">
              <span className="badge bg-success-subtle text-success-emphasis me-2">Potential win</span>
              <span className="me-3">Closes {fmtDate(pw.closeDate)}</span>
              {pw.priced
                ? <span className="fw-semibold" data-testid="pw-value">{fmtUsd(pw.valueCents as number)}</span>
                : <span className="text-muted fst-italic" data-testid="pw-value">Value pending, nobody has priced this bid yet</span>}
            </div>
          ) : (
            <div className="text-muted">Not yet submitted. Export the package, then record the submission to make this a potential-win.</div>
          )}
        </div>

        {/* Releases with parked state */}
        <div className="mb-3">
          <div className="text-uppercase text-muted small fw-bold mb-1">Releases</div>
          {v.releases.length === 0 ? (
            <div className="text-muted small">No build is linked yet.</div>
          ) : (
            <ul className="list-group list-group-flush">
              {v.releases.map((r) => (
                <li key={r.key} className={`list-group-item d-flex align-items-center justify-content-between px-0 ${r.parked ? 'opacity-50' : ''}`}>
                  <span>{r.name} <span className="text-muted small">({r.stories.length} {r.stories.length === 1 ? 'story' : 'stories'})</span></span>
                  {r.parked
                    ? <span className="badge bg-secondary-subtle text-secondary-emphasis" title="Full build-out is parked until the bid is won">Parked</span>
                    : <span className="badge bg-primary-subtle text-primary-emphasis text-capitalize">{r.status.replace(/_/g, ' ')}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Dossier + needs */}
        <div className="mb-3 d-flex flex-wrap gap-2">
          <span className="badge bg-light text-dark border">Dossier: {v.dossier.factCount} facts</span>
          <span className="badge bg-light text-dark border">{v.dossier.referenceCount} references</span>
          <span className="badge bg-light text-dark border">{v.dossier.personnelCount} personnel</span>
          <span className="badge bg-light text-dark border">{v.openNeedCount} open {v.openNeedCount === 1 ? 'need' : 'needs'} for the collection form</span>
        </div>

        {/* Controls */}
        <div className="d-flex flex-wrap align-items-center gap-2 pt-2 border-top">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onExport} disabled={busy !== null}>
            {busy === 'export' ? 'Assembling…' : 'Export package'}
          </button>
          <div className="input-group input-group-sm" style={{ maxWidth: 360 }}>
            <input
              type="text"
              className="form-control"
              placeholder="Submission receipt / confirmation ref"
              aria-label="Submission receipt reference"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              disabled={busy !== null || !v.exportReady}
            />
            <button type="button" className="btn btn-primary" onClick={onMarkSubmitted} disabled={busy !== null || !v.exportReady}>
              {busy === 'submit' ? 'Recording…' : 'Mark submitted'}
            </button>
          </div>
          {!v.exportReady && <span className="text-muted small">Export the package before recording a submission.</span>}
        </div>
      </div>
    </div>
  );
};

export default GovManagementPanel;
