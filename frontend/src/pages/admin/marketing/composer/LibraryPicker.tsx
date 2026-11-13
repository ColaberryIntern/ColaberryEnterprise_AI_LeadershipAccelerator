import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  attachExistingAsset,
  listLibrary,
  readableSize,
  rightsLabel,
  type LibraryAsset,
} from '../../../../services/libraryApi';
import { parseVideoUrl, providerLabel, videoThumbnail } from '../../../../utils/videoEmbed';
import { applyDestination } from './landingPageChoices';
import type { SetupValues } from './ComposerSetup';

/**
 * "Choose from library" - use something already saved instead of uploading it again.
 *
 * TWO DESTINATIONS, NOT ONE, and that is the whole design. A library holds two kinds of thing and
 * they go to different places:
 *
 *   a FILE  -> `content_item_media`, a join row and nothing else. No new `media_assets` row, no
 *              re-upload. The server enforces that; this just calls it.
 *   a LINK  -> the post's DESTINATION. A link is not an attachment any network uploads; attaching
 *              one would produce a post whose attachment the publishing worker then skips. So it
 *              sets `content_type: 'link'` and `destination_url`, exactly the way the video-link
 *              field already does (`ComposerSetup.tsx:250`), and never touches
 *              `content_item_media`.
 *
 * MULTI-SELECT FOR FILES, SINGLE FOR LINKS. A post can carry several attachments. It has one
 * destination.
 *
 * WHY THIS COMPONENT HOLDS NO STATE OF THE POST. `values` and `onChange` are the composer page's.
 * An earlier plan lifted the composer's `videoSource` mode up to here; that was aimed at the
 * wrong thing, because `videoSource` is pre-commit UI state ("choosing it is not yet a change to
 * the post", `ComposerSetup.tsx:103`) and the whole block is gated on `content_type === 'video'`,
 * so a link picked for an image or text draft had nowhere to land. Calling `applyDestination`
 * directly needs no lifted state and works from ANY content type.
 */

export interface LibraryPickerProps {
  /** Null until the draft is saved: a file attaches to an item, so files need one. */
  contentItemId: string | null;
  brandId: string | null;
  values: SetupValues;
  onChange: (next: SetupValues) => void;
  /**
   * Only what is needed to NAME the page a link would replace. Deliberately narrower than
   * LandingPageOption or LandingPageSummary: this component has no business knowing a page's
   * slug, status or brand, and a wider type would tie it to whichever of those two the composer
   * happens to hold today.
   */
  landingPages: readonly { id: string; name: string }[];
  /** Called after a file is attached, so the composer re-reads its media list. */
  onAttached: () => void;
  busy: boolean;
}

export default function LibraryPicker(props: LibraryPickerProps): JSX.Element {
  const { contentItemId, brandId, values, onChange, landingPages, onAttached, busy } = props;

  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<'' | 'file' | 'link'>('');
  const [chosenFiles, setChosenFiles] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** A link waiting on the operator's answer about the landing page it would replace. */
  const [pendingLink, setPendingLink] = useState<LibraryAsset | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listLibrary({ brandId: brandId ?? undefined, kind: kindFilter || undefined, q: q.trim() || undefined, limit: 100 })
      .then((page) => { if (!cancelled) { setAssets(page.assets); setError(null); } })
      .catch(() => { if (!cancelled) { setAssets([]); setError('The library could not be loaded.'); } });
    return () => { cancelled = true; };
  }, [open, brandId, kindFilter, q]);

  /** The page a link would drop, by name, or null when there is nothing to drop. */
  const pageAtRisk = useMemo(() => {
    if (!values.landing_page_id) return null;
    const page = landingPages.find((p) => p.id === values.landing_page_id);
    return page?.name ?? 'the landing page currently set';
  }, [values.landing_page_id, landingPages]);

  /**
   * Set the post's destination to this link.
   *
   * `applyDestination` with a url sets `landing_page_id: null` - the two are mutually exclusive
   * (`ComposerSetup.tsx:33`) - so a draft pointing at a landing page would lose it SILENTLY.
   * Ali, 2026-11-13: warn and confirm. The page is named before anything is applied, and
   * declining leaves the draft exactly as it was.
   */
  const applyLink = useCallback((asset: LibraryAsset) => {
    if (!asset.sourceUrl) return;
    onChange(applyDestination({ ...values, content_type: 'link' }, { kind: 'url', url: asset.sourceUrl }));
    setPendingLink(null);
    setNotice('This post now points at that link. It will publish as a link post.');
  }, [values, onChange]);

  const chooseLink = useCallback((asset: LibraryAsset) => {
    if (pageAtRisk) { setPendingLink(asset); return; }
    applyLink(asset);
  }, [pageAtRisk, applyLink]);

  const attachFiles = useCallback(async () => {
    if (!contentItemId || chosenFiles.length === 0) return;
    setWorking(true);
    try {
      let added = 0;
      let already = 0;
      // Sequential, not Promise.all: `position` is derived from the current count, so parallel
      // attaches would race for the same position.
      for (const id of chosenFiles) {
        const res = await attachExistingAsset(contentItemId, id);
        if (res.alreadyAttached) already += 1; else added += 1;
      }
      const parts = [];
      if (added) parts.push(`${added} attached`);
      if (already) parts.push(`${already} already on this post`);
      setNotice(parts.join(', ') + '.');
      setChosenFiles([]);
      onAttached();
    } catch (err) {
      const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(typeof detail === 'string' ? detail : 'Those files could not be attached.');
    } finally {
      setWorking(false);
    }
  }, [contentItemId, chosenFiles, onAttached]);

  const toggleFile = (id: string) => setChosenFiles((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ));

  if (!open) {
    return (
      <div className="mt-2">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm"
          onClick={() => setOpen(true)}
          disabled={busy}
          data-testid="open-library-picker"
        >
          <i className="ri-folder-image-line me-1" aria-hidden="true" />
          Choose from library
        </button>
        {notice && <div className="form-text text-success">{notice}</div>}
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm mt-2" data-testid="library-picker">
      <div className="card-header bg-white d-flex align-items-center gap-2">
        <span className="fw-semibold">Choose from library</span>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary ms-auto"
          onClick={() => { setOpen(false); setChosenFiles([]); setPendingLink(null); }}
        >
          Close
        </button>
      </div>

      <div className="card-body">
        {error && <div className="alert alert-danger py-2 small" role="alert">{error}</div>}
        {notice && <div className="alert alert-success py-2 small" role="status">{notice}</div>}

        {/* The landing-page collision: named, and asked once, before anything is applied. */}
        {pendingLink && (
          <div className="alert alert-warning py-2 small" role="alertdialog" aria-labelledby="lib-collide">
            <p className="fw-semibold mb-1" id="lib-collide">This post currently points at {pageAtRisk}.</p>
            <p className="mb-2">
              A post has one destination, so using this link will stop it pointing at that page.
              The page itself is not changed or deleted.
            </p>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm btn-warning" onClick={() => applyLink(pendingLink)}>
                Use the link instead
              </button>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPendingLink(null)}>
                Keep the page
              </button>
            </div>
          </div>
        )}

        <div className="d-flex gap-2 mb-3 flex-wrap">
          <input
            className="form-control form-control-sm"
            style={{ maxWidth: 240 }}
            placeholder="Search the library"
            aria-label="Search the library"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 160 }}
            aria-label="Filter by kind"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as '' | 'file' | 'link')}
          >
            <option value="">Files and links</option>
            <option value="file">Files only</option>
            <option value="link">Links only</option>
          </select>
          {chosenFiles.length > 0 && (
            <button
              type="button"
              className="btn btn-primary btn-sm ms-auto"
              onClick={() => void attachFiles()}
              disabled={working || !contentItemId}
            >
              {`Attach ${chosenFiles.length} file${chosenFiles.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>

        {!contentItemId && (
          <div className="form-text mb-2">
            Save the draft first to attach files. A link can be chosen at any time.
          </div>
        )}

        {assets !== null && assets.length === 0 && (
          <p className="text-muted small mb-0">Nothing in the library matches. Add something on the Library screen.</p>
        )}

        <div className="row g-2">
          {(assets ?? []).map((asset) => {
            const rights = rightsLabel(asset.rightsStatus);
            const video = asset.kind === 'link' ? parseVideoUrl(asset.sourceUrl) : null;
            const thumb = video ? videoThumbnail(video) : null;
            const picked = chosenFiles.includes(asset.id);
            return (
              <div className="col-6 col-lg-4" key={asset.id}>
                <button
                  type="button"
                  className={`btn w-100 h-100 text-start border p-2 ${picked ? 'border-primary bg-light' : ''}`}
                  onClick={() => (asset.kind === 'link' ? chooseLink(asset) : toggleFile(asset.id))}
                  disabled={working || (asset.kind === 'file' && !contentItemId)}
                  aria-pressed={asset.kind === 'file' ? picked : undefined}
                  data-testid={`pick-${asset.id}`}
                >
                  <span className="d-flex align-items-center justify-content-center bg-light rounded mb-2" style={{ height: 76, overflow: 'hidden' }}>
                    {thumb
                      ? <img src={thumb} alt="" className="w-100 h-100" style={{ objectFit: 'cover' }} loading="lazy" />
                      : <i className={`ri-${asset.kind === 'link' ? 'link' : 'image-line'} fs-4 text-muted`} aria-hidden="true" />}
                  </span>
                  <span className="d-block small fw-semibold text-truncate">{asset.altText || 'No description'}</span>
                  <span className="d-block small text-muted text-truncate">
                    {asset.kind === 'link'
                      ? `Link post${video ? ` · ${providerLabel(video.provider)}` : ''}`
                      : [asset.mimeType.split('/')[1], readableSize(asset.byteSize)].filter(Boolean).join(' · ')}
                  </span>
                  {/*
                    Expired rights are SELECTABLE and warn. Ali, 2026-11-13: recorded and warned
                    on, never hard-blocked. A renewed licence nobody has typed in yet is far more
                    likely than wilful infringement, and blocking would punish the record-keeping
                    rather than the risk.
                  */}
                  {asset.rightsStatus !== 'ok' && (
                    <span className={`badge mt-1 ${rights.className}`}>{rights.text}</span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
