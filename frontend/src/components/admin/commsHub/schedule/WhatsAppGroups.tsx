import React, { useCallback, useEffect, useState } from 'react';
import {
  apiErrorMessage, listWhatsAppGroups, setWhatsAppGroupEnabled, syncWhatsAppGroups, type WhatsAppGroup,
} from '../../../../services/commsHubApi';

/**
 * CH10.2 The number's WhatsApp groups, inside the WhatsApp card: Sync groups (only when connected),
 * then one switch per group. Every group starts off; nothing is sent to a group nobody switched on.
 * A group the number cannot post in shows why and its switch cannot be turned on.
 */
export function syncSummary(r: { listed: number; added: number; left: number }): string {
  const parts = [`${r.listed} ${r.listed === 1 ? 'group' : 'groups'} found`];
  if (r.added) parts.push(`${r.added} new`);
  if (r.left) parts.push(`${r.left} no longer include the hub number`);
  return `${parts.join(', ')}.`;
}

export default function WhatsAppGroups({ connected }: { connected: boolean }): React.ReactElement {
  const [groups, setGroups] = useState<WhatsAppGroup[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(() => {
    setLoadFailed(false);
    Promise.resolve(listWhatsAppGroups()).then((g) => setGroups(Array.isArray(g) ? g : []), () => setLoadFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async (): Promise<void> => {
    setBusy('sync'); setProblem(null); setNotice(null);
    try { setNotice(syncSummary(await syncWhatsAppGroups())); load(); } catch (err) { setProblem(apiErrorMessage(err, 'The groups could not be synced.')); } finally { setBusy(null); }
  };
  const toggle = async (g: WhatsAppGroup, enabled: boolean): Promise<void> => {
    setBusy(g.id); setProblem(null); setNotice(null);
    try {
      const next = await setWhatsAppGroupEnabled(g.id, enabled);
      setGroups((list) => (list ?? []).map((x) => (x.id === next.id ? next : x)));
      setNotice(enabled ? `WhatsApp sending to ${g.name} is on.` : `WhatsApp sending to ${g.name} is off.`);
    } catch (err) { setProblem(apiErrorMessage(err, 'The group could not be changed.')); } finally { setBusy(null); }
  };

  return (
    <div className="ch-wa-groups mt-3">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <h3 className="h6 mb-0">Groups</h3>
        {connected && (
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={sync} disabled={busy !== null}>
            <i className="ri-refresh-line me-1" aria-hidden="true" />{busy === 'sync' ? 'Syncing...' : 'Sync groups'}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {notice && <p className="small mb-2" role="status">{notice}</p>}
        {problem && <div className="alert alert-warning py-2 mb-2" role="alert">{problem}</div>}
      </div>
      {loadFailed && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between mb-0" role="alert">
          <span>The groups did not load.</span>
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={load}>Try again</button>
        </div>
      )}
      {!loadFailed && groups === null && <p className="text-muted small mb-0" role="status">Loading...</p>}
      {groups && groups.length === 0 && (
        <p className="small text-muted mb-0">{connected ? 'No groups yet. Use Sync groups to list the groups the hub number is in.' : 'Groups appear here once WhatsApp is connected and synced.'}</p>
      )}
      {groups && groups.length > 0 && (
        <ul className="list-unstyled mb-0" aria-label="WhatsApp groups">
          {groups.map((g) => {
            const inputId = `ch-wa-${g.id}`;
            return (
              <li key={g.id} className="ch-wa-group border-top pt-2 mt-2">
                <div className="form-check form-switch">
                  <input
                    id={inputId} className="form-check-input" type="checkbox" role="switch" checked={g.enabled}
                    disabled={busy !== null || (!g.sendable && !g.enabled)} aria-describedby={`${inputId}-about`}
                    onChange={(e) => { void toggle(g, e.target.checked); }}
                  />
                  <label className="form-check-label" htmlFor={inputId}>{g.name}</label>
                </div>
                <p id={`${inputId}-about`} className="small text-muted mb-0">
                  {g.participants_count} {g.participants_count === 1 ? 'member' : 'members'}.{' '}
                  {g.sendable ? (g.enabled ? 'Sending is on.' : 'Sending is off.') : `Can't send here: ${g.cant_send_reason ?? 'not available.'}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
