import React, { useEffect, useState } from 'react';
import {
  addShortLink, getManaged, removeShort, reorderShorts, tvError, updateShort, type ManagedShort, type TvAudience,
} from '../../../services/colaberryTvApi';
import { thumbOf } from './tvPlaylist';

/**
 * Manage the TV (Campus v20 N3, Basecamp C134; the prototype's manager in docs/design/campus/colaberry-campus-v20.html, screenshot
 * 05_manage_tv): the Colaberry TV playlist in play order, for staff with Campaigns. Add a link (its title comes from YouTube),
 * rename (saved when you leave the box), reorder, who sees it, on air, and remove (asks first). Every change is saved on the server
 * with an audit row and answered with the whole playlist; onChanged lets the open TV follow at once.
 */
const AUDIENCE_LABEL: Record<TvAudience, string> = { all: 'Everyone', explorers: 'Explorers', members: 'Members' };

export default function TvManager({ playingId, onChanged, onClose }: { playingId: string | null; onChanged: () => void; onClose: () => void }): React.ReactElement {
  const [rows, setRows] = useState<ManagedShort[] | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => { getManaged().then((d) => setRows(d.videos)).catch((e) => setError(tvError(e, 'We can’t load the playlist right now.'))); }, []);

  const apply = async (fn: () => Promise<{ videos: ManagedShort[] }>) => {
    setBusy(true); setError('');
    try { const d = await fn(); setRows(d.videos); onChanged(); return true; } catch (e) { setError(tvError(e)); return false; } finally { setBusy(false); }
  };
  const add = async () => { if (link.trim() && await apply(() => addShortLink(link.trim()))) setLink(''); };
  const move = (i: number, d: -1 | 1) => {
    if (!rows) return;
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const ids = rows.map((r) => r.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void apply(() => reorderShorts(ids));
  };
  const saveTitle = (r: ManagedShort) => {
    const t = (titles[r.id] ?? '').trim();
    if (!t || t === (r.title ?? '')) return;
    void apply(() => updateShort(r.id, { title: t }));
  };

  return (
    <div className="cn-mgr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cn-mgr" role="dialog" aria-modal="true" aria-labelledby="cn-mgr-h" data-testid="cn-manager">
        <div className="cn-mgr-hd">
          <div>
            <small className="cn-kicker">COLABERRY NOW · COLABERRY TV · STAFF</small>
            <h3 id="cn-mgr-h">Manage the TV</h3>
            <p>This is the Colaberry TV playlist on Colaberry Now, in play order. Changes show right away for everyone watching.</p>
          </div>
          <button type="button" className="cn-x" onClick={onClose} aria-label="Close the manager" data-testid="cn-mgr-close">✕</button>
        </div>
        <form className="cn-mgr-add" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Paste a YouTube or YouTube Shorts link…" aria-label="YouTube link" data-testid="cn-mgr-link" />
          <button type="submit" className="cn-mgr-addbtn" disabled={busy || !link.trim()} data-testid="cn-mgr-add">＋ Add to the playlist</button>
        </form>
        {error && <p className="cn-msg" role="alert" data-testid="cn-mgr-error">{error}</p>}
        <div className="cn-mgr-tbl" role="table" aria-label="The playlist">
          <div className="cn-mgr-th" role="row"><span /><span role="columnheader">TITLE · LINK</span><span role="columnheader">WHO SEES IT</span><span role="columnheader">ON AIR</span><span /></div>
          {rows === null && !error && <p className="cn-more">Loading the playlist…</p>}
          {rows && !rows.length && <p className="cn-more">The playlist is empty. Paste a link above to add the first short.</p>}
          {rows?.map((r, i) => (
            <div key={r.id} role="row" className={`cn-mgr-row${r.youtube_id === playingId ? ' playing' : ''}`} data-testid="cn-mgr-row">
              <span className="cn-mgr-mv">
                <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`Move ${r.title ?? 'this short'} up`} data-testid="cn-mgr-up">▲</button>
                <button type="button" onClick={() => move(i, 1)} disabled={busy || i === rows.length - 1} aria-label={`Move ${r.title ?? 'this short'} down`} data-testid="cn-mgr-down">▼</button>
              </span>
              <span className="cn-mgr-tl">
                <img src={thumbOf(r.youtube_id)} alt="" loading="lazy" />
                <span>
                  <input value={titles[r.id] ?? r.title ?? ''} placeholder="Colaberry short" aria-label="Title" maxLength={120} data-testid="cn-mgr-title"
                    onChange={(e) => setTitles((t) => ({ ...t, [r.id]: e.target.value }))} onBlur={() => saveTitle(r)} />
                  <small>youtube.com/shorts/{r.youtube_id}{r.youtube_id === playingId ? ' · ▶ playing now' : ''}</small>
                </span>
              </span>
              <select value={r.audience} aria-label="Who sees it" disabled={busy} data-testid="cn-mgr-aud"
                onChange={(e) => void apply(() => updateShort(r.id, { audience: e.target.value as TvAudience }))}>
                {(Object.keys(AUDIENCE_LABEL) as TvAudience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
              </select>
              <label className="cn-mgr-air">
                <input type="checkbox" checked={r.on_air} disabled={busy} data-testid="cn-mgr-air"
                  onChange={(e) => void apply(() => updateShort(r.id, { on_air: e.target.checked }))} /> {r.on_air ? 'On' : 'Off'}
              </label>
              {confirming === r.id ? (
                <span className="cn-mgr-confirm">
                  <button type="button" className="cn-mgr-del yes" disabled={busy} data-testid="cn-mgr-del-yes"
                    onClick={() => { setConfirming(null); void apply(() => removeShort(r.id)); }}>Remove</button>
                  <button type="button" className="cn-mgr-keep" onClick={() => setConfirming(null)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="cn-mgr-del" onClick={() => setConfirming(r.id)} aria-label={`Remove ${r.title ?? 'this short'}`} data-testid="cn-mgr-del">🗑</button>
              )}
            </div>
          ))}
        </div>
        <p className="cn-mgr-ft">Colaberry TV starts when someone opens Colaberry Now and plays these in order, then loops. People can mute it or skip. Nothing plays anywhere else on campus.</p>
      </div>
    </div>
  );
}
