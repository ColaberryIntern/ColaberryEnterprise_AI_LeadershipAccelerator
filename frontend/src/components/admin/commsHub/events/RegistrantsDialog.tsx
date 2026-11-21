import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getRegistrants, downloadRegistrantsCsv, apiErrorMessage, type EventbriteEvent, type RegistrantList } from '../../../../services/commsHubApi';

/**
 * Who registered for one Eventbrite event (CH9.3): the count, a search, the list, and Download CSV.
 * The server logs every view and download. Search filters the rows already loaded, so no name or
 * email is ever put in a URL. Phone numbers are in the download only.
 *
 * A partial list says it is partial: when Eventbrite could not be read, the people who registered
 * on our own site still show, under a banner.
 */
const TZ = 'America/Chicago';
const when = (iso: string | null): string => (iso
  ? new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso))
  : 'Not recorded');
const SOURCE: Record<string, string> = { eventbrite: 'Eventbrite', site: 'Our site' };

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; list: RegistrantList };

export default function RegistrantsDialog({ ev, onClose }: { ev: EventbriteEvent; onClose: () => void }): React.ReactElement {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [query, setQuery] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
    getRegistrants(ev.ccpp_event_id)
      .then((list) => setLoad({ state: 'ready', list }))
      .catch((err) => setLoad({ state: 'error', message: apiErrorMessage(err, 'The registrants did not load.') }));
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ev.ccpp_event_id, onClose]);

  const rows = useMemo(() => {
    if (load.state !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return q ? load.list.rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.includes(q)) : load.list.rows;
  }, [load, query]);

  const download = async (): Promise<void> => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadRegistrantsCsv(ev.ccpp_event_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(apiErrorMessage(err, 'The download did not start. Try again.'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="ch-dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ch-dialog" role="dialog" aria-modal="true" aria-labelledby="ch-registrants-title">
        <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
          <h2 className="h5 mb-0" id="ch-registrants-title" tabIndex={-1} ref={heading}>Registrants: {ev.title}</h2>
          <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={onClose}>Close</button>
        </div>
        {load.state === 'loading' && <p className="text-muted mb-0" role="status">Loading...</p>}
        {load.state === 'error' && <div className="alert alert-warning mb-0" role="alert">{load.message}</div>}
        {load.state === 'ready' && (
          <>
            {load.list.eventbrite !== 'ok' && (
              <div className="alert alert-warning py-2" role="alert" data-testid="registrants-partial">
                Eventbrite could not be read just now, so this shows only the people who registered on our site.
              </div>
            )}
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              <strong data-testid="registrants-count">{load.list.count === 1 ? '1 person' : `${load.list.count} people`}</strong>
              <label className="visually-hidden" htmlFor="ch-registrants-search">Search by name or email</label>
              <input id="ch-registrants-search" type="search" className="form-control ch-registrants-search" placeholder="Search by name or email"
                value={query} onChange={(e) => setQuery(e.target.value)} />
              <button type="button" className="btn btn-primary comms-hub-action ms-auto" onClick={() => { void download(); }} disabled={downloading || load.list.count === 0}>
                <i className="ri-download-2-line me-1" aria-hidden="true" />{downloading ? 'Preparing...' : 'Download CSV'}
              </button>
            </div>
            {downloadError && <div className="alert alert-danger py-2" role="alert">{downloadError}</div>}
            {load.list.count === 0 && <p className="text-muted mb-0">Nobody has registered yet.</p>}
            {load.list.count > 0 && rows.length === 0 && <p className="text-muted mb-0" role="status">No one matches that search.</p>}
            {rows.length > 0 && (
              <div className="table-responsive ch-registrants-table">
                <table className="table table-sm align-middle mb-0">
                  <caption className="visually-hidden">People registered for {ev.title}</caption>
                  <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Registered</th><th scope="col">Where</th><th scope="col">Platform account</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.email}>
                        <td>{r.name || <span className="text-muted">No name given</span>}</td>
                        <td className="text-break">{r.email}</td>
                        <td>{when(r.registered_at)}</td>
                        <td>{r.sources.map((s) => SOURCE[s] ?? s).join(' + ')}</td>
                        <td>{r.has_account ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
