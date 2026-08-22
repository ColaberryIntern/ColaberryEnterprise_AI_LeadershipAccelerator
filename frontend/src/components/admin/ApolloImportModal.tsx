import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * "Pull in leads" — import contacts from the Apollo account into the lead queue.
 *
 * Safe for a sales rep to drive. The backend can only read contacts the account
 * already owns and paid for (apolloAccountClient's allowlist), so no click here
 * can spend Apollo credits, and the import is idempotent on the Apollo contact
 * id, so a double click cannot duplicate anyone.
 *
 * The flow is preview-then-import on purpose: a rep sees exactly how many are
 * new versus already in the queue before anything is written.
 */

interface ApolloList {
  id: string;
  name: string;
  count: number;
}

interface ImportResult {
  scanned: number;
  imported: number;
  skippedExisting: number;
  skippedNoEmail: number;
  failed: number;
  nextPage: number | null;
  totalAvailable: number | null;
  committed: boolean;
  errors: string[];
}

interface Props {
  show: boolean;
  onClose: () => void;
  /** Called after a committed import so the caller can refresh its list. */
  onImported: () => void;
}

function ApolloImportModal({ show, onClose, onImported }: Props) {
  const [lists, setLists] = useState<ApolloList[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loadingLists, setLoadingLists] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!show) return;
    let live = true;
    setLoadingLists(true);
    setError('');
    api.get('/api/admin/leads/apollo-lists')
      .then((res) => { if (live) setLists(res.data.lists || []); })
      .catch((err) => {
        if (live) setError(err.response?.data?.error || 'Could not reach Apollo. Try again shortly.');
      })
      .finally(() => { if (live) setLoadingLists(false); });
    return () => { live = false; };
  }, [show]);

  // Starting over whenever the target changes stops a stale preview from being
  // read as the count for a different list.
  useEffect(() => {
    setPreview(null);
    setImported(null);
  }, [selected]);

  if (!show) return null;

  const run = async (commit: boolean) => {
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = { commit };
      if (selected) body.labelIds = [selected];
      const res = await api.post('/api/admin/leads/apollo-import', body);
      const result: ImportResult = res.data.result;
      if (commit) {
        setImported(result);
        onImported();
      } else {
        setPreview(result);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'The import could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  const target = lists.find((l) => l.id === selected);
  const targetLabel = target ? target.name : 'every saved Apollo contact';

  const close = () => {
    setPreview(null);
    setImported(null);
    setError('');
    onClose();
  };

  return (
    <>
      <div className="modal-backdrop fade show" onClick={close} />
      <div className="modal fade show d-block" role="dialog" aria-modal="true" aria-labelledby="apolloImportTitle">
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="apolloImportTitle">Pull in leads from Apollo</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={close} />
            </div>

            <div className="modal-body">
              {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}

              {imported ? (
                <div>
                  <div className="alert alert-success py-2" role="status">
                    Added <strong>{imported.imported.toLocaleString()}</strong> new{' '}
                    {imported.imported === 1 ? 'lead' : 'leads'} to the queue.
                  </div>
                  <ul className="small text-muted mb-0" style={{ paddingLeft: 18 }}>
                    <li>{imported.skippedExisting.toLocaleString()} were already in the queue</li>
                    {imported.skippedNoEmail > 0 && (
                      <li>{imported.skippedNoEmail.toLocaleString()} had no email address</li>
                    )}
                    {imported.failed > 0 && (
                      <li className="text-danger">{imported.failed.toLocaleString()} could not be added</li>
                    )}
                    {imported.nextPage !== null && (
                      <li>More remain in this list. Run it again to continue where it stopped.</li>
                    )}
                  </ul>
                </div>
              ) : (
                <>
                  <label htmlFor="apolloList" className="form-label small text-muted">
                    Which Apollo list?
                  </label>
                  <select
                    id="apolloList"
                    className="form-select mb-3"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={loadingLists || busy}
                  >
                    <option value="">All saved contacts</option>
                    {lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.count.toLocaleString()})
                      </option>
                    ))}
                  </select>

                  {loadingLists && <p className="small text-muted">Loading your Apollo lists...</p>}

                  {preview && (
                    <div className="alert alert-info py-2 mb-3">
                      Of the {preview.scanned.toLocaleString()} checked in{' '}
                      <strong>{targetLabel}</strong>:{' '}
                      <strong>{preview.imported.toLocaleString()}</strong> would be added,{' '}
                      {preview.skippedExisting.toLocaleString()} are already in the queue
                      {preview.skippedNoEmail > 0 && `, ${preview.skippedNoEmail.toLocaleString()} have no email`}.
                    </div>
                  )}

                  <p className="small text-muted mb-0">
                    These are contacts already saved in your Apollo account, so pulling them in
                    costs nothing. Anyone already in the queue is left exactly as they are.
                    Leads that signed up on our websites stay above these in the list.
                  </p>
                </>
              )}
            </div>

            <div className="modal-footer">
              {imported ? (
                <button type="button" className="btn btn-primary" onClick={close}>Done</button>
              ) : (
                <>
                  <button type="button" className="btn btn-link text-muted" onClick={close} disabled={busy}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-primary"
                    onClick={() => run(false)}
                    disabled={busy || loadingLists}
                  >
                    {busy && !preview ? 'Checking...' : 'Preview'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => run(true)}
                    disabled={busy || loadingLists || !preview || preview.imported === 0}
                    title={!preview ? 'Preview first so you can see what would be added' : undefined}
                  >
                    {busy && preview ? 'Adding...' : `Add ${preview ? preview.imported.toLocaleString() : ''} to queue`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default ApolloImportModal;
