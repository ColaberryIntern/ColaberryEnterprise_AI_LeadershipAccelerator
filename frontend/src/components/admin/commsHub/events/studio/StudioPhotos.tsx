import React, { useCallback, useEffect, useRef, useState } from 'react';
import { addEventPhoto, apiErrorMessage, listEventPhotos, removeEventPhoto, type HubPhoto } from '../../../../../services/commsHubApi';

/**
 * Step 1, Pictures (CH4.1 routes, CH4.4 UI, design 02): square tiles and a dashed "+ Add" tile that
 * opens the file picker. A chosen file then asks what it shows (required, for people who cannot see
 * it) before it is saved. Up to 6 per event.
 */
export const MAX_PHOTOS = 6;

interface Props { eventId: string; disabled: boolean; onCount?: (n: number) => void }

export default function StudioPhotos({ eventId, disabled, onCount }: Props): React.ReactElement {
  const [photos, setPhotos] = useState<HubPhoto[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const altInput = useRef<HTMLInputElement>(null);

  const show = useCallback((list: HubPhoto[]) => { setPhotos(list); onCount?.(list.length); }, [onCount]);
  useEffect(() => {
    listEventPhotos(eventId).then(show, (err) => setError(apiErrorMessage(err, 'The pictures did not load.')));
  }, [eventId, show]);
  useEffect(() => { if (file) altInput.current?.focus(); }, [file]);

  const reset = (): void => { setFile(null); setAlt(''); if (input.current) input.current.value = ''; };
  const add = async (): Promise<void> => {
    if (!file) return;
    if (alt.trim().length < 3) { setError('Describe the picture for people who cannot see it (3 characters or more).'); return; }
    setBusy(true); setError(null);
    try { show(await addEventPhoto(eventId, file, alt.trim())); reset(); } catch (err) { setError(apiErrorMessage(err, 'The picture was not added. Try again.')); } finally { setBusy(false); }
  };
  const remove = async (p: HubPhoto): Promise<void> => {
    setBusy(true); setError(null);
    try { show(await removeEventPhoto(eventId, p.id)); } catch (err) { setError(apiErrorMessage(err, 'The picture was not removed. Try again.')); } finally { setBusy(false); }
  };

  const full = photos.length >= MAX_PHOTOS;
  const off = disabled || busy;
  return (
    <section aria-labelledby="ch-studio-photos" className="ch-studio-step">
      <h3 id="ch-studio-photos" className="ch-studio-h">1. Pictures</h3>
      <ul className="ch-studio-photos list-unstyled">
        {photos.map((p) => (
          <li key={p.id} className="ch-studio-photo">
            {p.url ? <img src={p.url} alt={p.alt_text ?? ''} /> : <span className="ch-studio-photo-missing">{p.alt_text}</span>}
            <button type="button" className="ch-studio-photo-remove" onClick={() => void remove(p)} disabled={off} aria-label={`Remove picture: ${p.alt_text ?? 'untitled'}`}>
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </li>
        ))}
        {!full && (
          <li className={`ch-studio-photo ch-studio-add${off ? ' is-disabled' : ''}`}>
            <input ref={input} id="ch-photo-file" type="file" accept="image/png,image/jpeg" className="visually-hidden" disabled={off} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <label htmlFor="ch-photo-file">+ Add<span className="visually-hidden"> a photo, screenshot or logo</span></label>
          </li>
        )}
      </ul>
      {file && (
        <div className="ch-studio-photo-form">
          <label className="form-label" htmlFor="ch-photo-alt">What does {file.name} show?</label>
          <div className="d-flex gap-2">
            <input ref={altInput} id="ch-photo-alt" className="form-control" value={alt} maxLength={300} disabled={off} onChange={(e) => setAlt(e.target.value)} placeholder="Aleem at the whiteboard" />
            <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={() => void add()} disabled={off}>{busy ? 'Adding...' : 'Save'}</button>
            <button type="button" className="btn btn-link comms-hub-action" onClick={reset} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {error && <div className="alert alert-warning py-2 mt-2 mb-0" role="alert">{error}</div>}
      <p className="ch-studio-hint mt-2 mb-0">{full ? `This event has ${MAX_PHOTOS} pictures, the most it can have. Remove one to add another.` : `Add photos, screenshots or a logo. Up to ${MAX_PHOTOS}.`}</p>
    </section>
  );
}
