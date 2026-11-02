import React, { useState } from 'react';
import { apiErrorMessage, importSpendCsv, type ImportResult } from '../../../../services/adSpendApi';
import { centsToUsd } from './adSpendFormat';

/**
 * Import an Ads Manager export in two steps: read it (nothing written, every problem line shown),
 * then confirm. Importing the same file twice changes nothing; an import of days the Meta sync
 * already pulled is kept but not counted for those days (the sync wins).
 */

interface Props {
  onImported: () => void;
}

const MAX_BYTES = 2_000_000;

export default function AdSpendImport({ onImported }: Props) {
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const read = async (file: File | undefined) => {
    setPreview(null);
    setMessage(null);
    if (!file) return;
    if (file.size > MAX_BYTES) { setMessage({ kind: 'error', text: 'That file is over 2 MB. Export one month at a time.' }); return; }
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setBusy(true);
    try {
      setPreview(await importSpendCsv(text, true));
    } catch (err) {
      setMessage({ kind: 'error', text: apiErrorMessage(err, 'Could not read that file.') });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!csv) return;
    setBusy(true);
    try {
      const r = await importSpendCsv(csv, false);
      setMessage({ kind: 'ok', text: `Imported ${r.written} row${r.written === 1 ? '' : 's'} (${centsToUsd(r.totalCents)}).` });
      setPreview(null);
      setCsv(null);
      onImported();
    } catch (err) {
      setMessage({ kind: 'error', text: apiErrorMessage(err, 'Import failed. Nothing was written.') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="small text-muted">
        In Ads Manager: Campaigns tab → Breakdown → By time → <b>Day</b> (and By delivery → <b>Platform</b> for the
        Facebook / Instagram split) → Reports → Export table data → CSV. A sheet with Date, Campaign and Spend columns works too.
      </p>
      <label className="form-label small fw-semibold" htmlFor="as-file">Spend export (.csv)</label>
      <input id="as-file" type="file" accept=".csv,text/csv" className="form-control" disabled={busy}
        onChange={(e) => read(e.target.files?.[0])} />

      {preview && (
        <div className="mt-3" data-testid="import-preview">
          <p className="mb-2">
            <b>{fileName}</b>: {preview.rows} row{preview.rows === 1 ? '' : 's'} ready, {centsToUsd(preview.totalCents)} in total.
            {preview.skippedTotals > 0 && ` ${preview.skippedTotals} totals row${preview.skippedTotals === 1 ? '' : 's'} skipped.`}
          </p>
          {preview.errors.length > 0 && (
            <div className="alert alert-warning py-2 small">
              <b>{preview.errors.length} line{preview.errors.length === 1 ? '' : 's'} will not be imported:</b>
              <ul className="mb-0 mt-1">
                {preview.errors.slice(0, 10).map((e) => <li key={`${e.line}-${e.message}`}>{e.line > 0 ? `Line ${e.line}: ` : ''}{e.message}</li>)}
                {preview.errors.length > 10 && <li>…and {preview.errors.length - 10} more</li>}
              </ul>
            </div>
          )}
          {preview.rows > 0 && (
            <>
              <div className="table-responsive">
                <table className="table table-sm small mb-2" aria-label="Import preview">
                  <thead><tr><th>Day</th><th>Campaign</th><th>Placement</th><th className="text-end">Amount</th></tr></thead>
                  <tbody>
                    {preview.preview.map((r, i) => (
                      <tr key={i}>
                        <td>{r.periodStart}{r.periodEnd !== r.periodStart ? ` – ${r.periodEnd}` : ''}</td>
                        <td>{r.campaignName || r.campaignRef}{r.campaignName && <span className="text-muted"> · {r.campaignRef}</span>}</td>
                        <td>{r.placement || '—'}</td>
                        <td className="text-end">{centsToUsd(r.amountCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows > preview.preview.length && <p className="small text-muted">Showing the first {preview.preview.length}.</p>}
              <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
                {busy ? 'Importing…' : `Import ${preview.rows} row${preview.rows === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>
      )}
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`small mt-2 mb-0 ${message.kind === 'error' ? 'text-danger' : 'text-success'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
