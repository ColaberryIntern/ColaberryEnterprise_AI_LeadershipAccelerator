import React, { useState } from 'react';
import { SectionCard } from '../../../shell';
import type { HubEvent, StudioStyle } from '../../../../../services/commsHubApi';
import StudioPhotos from './StudioPhotos';
import { OptionGrid, SizePreview } from './StudioOptions';
import { isAiStyle, STYLE_OPTIONS } from './studioDisplay';
import { useThumbnailStudio } from './useThumbnailStudio';

/**
 * The thumbnail studio (design 02, CH4.4): its own card beside the event details. 1. Pictures and
 * 2. What it should say side by side, Generate / Try 3 more, 3. Pick one, 4. Ask for a change, the
 * sizes, then Use for this event, Download, or Upload my own instead. Nothing is used until the
 * organizer chooses "Use for this event"; AI pictures are shown with the prompt that made them.
 */
interface Props { event: HubEvent; locked: boolean; onThumbnailChosen?: (thumbnailId: string) => void }

function UploadOwn({ disabled, onUpload }: { disabled: boolean; onUpload: (f: File, alt: string) => Promise<boolean> }): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (): Promise<void> => {
    if (!file) { setError('Choose a picture first.'); return; }
    if (alt.trim().length < 3) { setError('Describe the picture for people who cannot see it (3 characters or more).'); return; }
    setError(null);
    if (await onUpload(file, alt.trim())) { setFile(null); setAlt(''); }
  };
  return (
    <div className="ch-studio-upload row g-2 align-items-end mt-2">
      {error && <div className="col-12"><div className="alert alert-warning py-2 mb-0" role="alert">{error}</div></div>}
      <div className="col-12 col-xl-5">
        <label className="form-label" htmlFor="ch-own-file">Your thumbnail picture</label>
        <input id="ch-own-file" type="file" accept="image/png,image/jpeg" className="form-control" disabled={disabled} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div className="col-12 col-xl-5">
        <label className="form-label" htmlFor="ch-own-alt">What it shows</label>
        <input id="ch-own-alt" className="form-control" value={alt} maxLength={300} disabled={disabled} onChange={(e) => setAlt(e.target.value)} />
      </div>
      <div className="col-12 col-xl-2">
        <button type="button" className="btn btn-outline-primary w-100 comms-hub-action" disabled={disabled} onClick={() => void submit()}>Upload</button>
      </div>
    </div>
  );
}

export default function ThumbnailStudio({ event, locked, onThumbnailChosen }: Props): React.ReactElement {
  const st = useThumbnailStudio(event);
  const { s, patch } = st;
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const working = s.busy !== null;
  const off = locked || working;
  const options = s.view?.options ?? [];
  const ai = s.view?.ai;
  const aiStyle = isAiStyle(s.style);
  const hasAiOptions = options.some((o) => o.source === 'ai' && o.style === s.style);
  const selected = options.find((o) => o.id === s.selectedId) ?? null;
  const canChange = selected !== null && selected.source !== 'upload';
  const needsPhoto = aiStyle && /needs a photo/.test(STYLE_OPTIONS.find((o) => o.value === s.style)!.label) && photoCount === 0;
  const hint = aiStyle
    ? (ai?.enabled === false ? 'AI pictures are switched off on this server; you will get the branded templates.' : `Makes ${ai?.batch ?? 3} AI pictures. Today: ${ai?.used_today ?? 0} of ${ai?.daily_limit ?? 12}.${needsPhoto ? ' Add a photo of the person first.' : ''}`)
    : 'Uses Colaberry colors and fonts automatically.';

  return (
    <SectionCard className="ch-studio" title="AI thumbnail studio" subtitle="Add a few pictures and say what the meeting is about. AI builds on-brand options for the video, the feed and WhatsApp. Nothing is used until you choose it.">
      {locked && <div className="alert alert-secondary">This event is {event.status}, so its thumbnail cannot change.</div>}
      <div role="status" aria-live="polite" className="ch-studio-status">
        {s.progress && <div className="alert alert-info py-2 mb-2"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />{s.progress}</div>}
        {s.notice && <div className="alert alert-success py-2 mb-2">{s.notice}</div>}
      </div>
      {s.error && <div className="alert alert-danger py-2" role="alert">{s.error}</div>}
      {s.loadError && <div className="alert alert-warning py-2" role="alert">{s.loadError}</div>}

      <div className="ch-studio-top">
        <StudioPhotos eventId={event.id} disabled={off} onCount={setPhotoCount} />
        <section aria-labelledby="ch-studio-say" className="ch-studio-step">
          <h3 id="ch-studio-say" className="ch-studio-h">2. What it should say</h3>
          <label className="form-label" htmlFor="ch-studio-headline">Headline</label>
          <input id="ch-studio-headline" className="form-control mb-2" value={s.headline} maxLength={80} disabled={off} onChange={(e) => patch({ headline: e.target.value })} />
          <label className="form-label" htmlFor="ch-studio-supporting">Supporting line</label>
          <input id="ch-studio-supporting" className="form-control mb-2" value={s.supporting} maxLength={120} disabled={off} onChange={(e) => patch({ supporting: e.target.value })} />
          <div className="form-check mb-2">
            <input id="ch-studio-when" type="checkbox" className="form-check-input" checked={s.showWhen} disabled={off} onChange={(e) => patch({ showWhen: e.target.checked })} />
            <label className="form-check-label" htmlFor="ch-studio-when">Show date and time from the event</label>
          </div>
          <label className="form-label" htmlFor="ch-studio-style">Style</label>
          <select id="ch-studio-style" className="form-select" value={s.style} disabled={off} onChange={(e) => patch({ style: e.target.value as StudioStyle })} aria-describedby="ch-studio-style-help">
            {(['Branded templates', 'AI pictures'] as const).map((g) => (
              <optgroup key={g} label={g}>
                {STYLE_OPTIONS.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </optgroup>
            ))}
          </select>
        </section>
      </div>

      <div className="ch-studio-generate">
        <button type="button" className="btn ch-btn-berry comms-hub-action" disabled={off} onClick={() => void st.generate()}>{s.busy === 'generate' ? 'Generating...' : 'Generate thumbnails'}</button>
        {aiStyle && hasAiOptions && (
          <button type="button" className="btn btn-outline-secondary comms-hub-action" disabled={off} onClick={() => void st.generate()}>Try {ai?.batch ?? 3} more</button>
        )}
        <span id="ch-studio-style-help" className="ch-studio-hint">{hint}</span>
      </div>

      <section aria-labelledby="ch-studio-pick" className="ch-studio-step">
        <h3 id="ch-studio-pick" className="ch-studio-h">3. Pick one</h3>
        {s.view === null && !s.loadError ? <p className="text-muted mb-0">Loading options...</p> : (
          <OptionGrid options={options} selectedId={s.selectedId} disabled={off} onSelect={(id) => patch({ selectedId: id })} />
        )}
      </section>

      {canChange && (
        <section aria-labelledby="ch-studio-change" className="ch-studio-step">
          <h3 id="ch-studio-change" className="ch-studio-h">4. Ask for a change <span className="fw-normal text-muted">(optional)</span></h3>
          <label className="visually-hidden" htmlFor="ch-studio-change-text">What should change on the picked option?</label>
          <div className="d-flex gap-2">
            <input id="ch-studio-change-text" className="form-control" value={s.changeText} maxLength={300} disabled={off} placeholder="e.g. Make the headline shorter, or use the white template" onChange={(e) => patch({ changeText: e.target.value })} />
            <button type="button" className="btn btn-outline-secondary comms-hub-action" disabled={off} onClick={() => void st.askForChange()}>{s.busy === 'change' ? 'Updating...' : 'Update'}</button>
          </div>
        </section>
      )}

      <SizePreview options={options} selectedId={s.selectedId} size={s.size} disabled={off} onSize={(size) => patch({ size })} />

      <div className="d-flex flex-wrap gap-2 mt-3">
        <button type="button" className="btn btn-primary comms-hub-action" disabled={off || !selected || selected.chosen} onClick={() => void st.chooseSelected(onThumbnailChosen)}>
          {s.busy === 'use' ? 'Saving...' : selected?.chosen ? 'In use for this event' : 'Use for this event'}
        </button>
        <button type="button" className="btn btn-outline-secondary comms-hub-action" disabled={working || !selected} onClick={() => void st.download()}>{s.busy === 'download' ? 'Downloading...' : 'Download'}</button>
        <button type="button" className="btn btn-outline-secondary comms-hub-action" disabled={off} aria-expanded={uploading} aria-controls="ch-studio-upload" onClick={() => setUploading((u) => !u)}>Upload my own instead</button>
      </div>
      {uploading && <div id="ch-studio-upload"><UploadOwn disabled={off} onUpload={async (f, alt) => { const ok = await st.upload(f, alt); if (ok) setUploading(false); return ok; }} /></div>}
    </SectionCard>
  );
}
