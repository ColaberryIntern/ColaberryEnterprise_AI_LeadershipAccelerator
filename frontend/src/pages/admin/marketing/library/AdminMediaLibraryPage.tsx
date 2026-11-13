import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  archiveAsset,
  editAsset,
  listLibrary,
  readableSize,
  linkBadge,
  rightsLabel,
  saveLink,
  uploadLibraryFile,
  type LibraryAsset,
  type LibraryFilters,
  type LibraryKind,
} from '../../../../services/libraryApi';
import { parseVideoUrl, videoThumbnail } from '../../../../utils/videoEmbed';
import VideoEmbed from '../../../../components/timeline/VideoEmbed';
// VideoEmbed styles itself with tlv-* classes that live in timeline.css and it does NOT import
// them, so every host has to. Same pattern as admin/orchestration/studio/StudentPreview.tsx.
// Without this the player renders unstyled: no poster frame, no play button.
import '../../../../components/timeline/timeline.css';
import { useMarketingBrand } from '../MarketingBrandContext';
import { ALL_BRANDS } from '../brandScope';

/**
 * The media library: everything this brand can post, in one place.
 *
 * WHY IT EXISTS. Ali, 2026-11-13: "I have a bunch of youtube links for all our videos we've been
 * collecting. I want that to be stored in our system and when creating post, able to use those
 * resources on demand. sohail has tons of ads he's created and they maybe stored on his computer
 * somewhere, but I want content stored with us in a way that's easy to manage."
 *
 * ONE LIBRARY, TWO KINDS. A file is bytes we hold; a link is a URL we do not. They live together
 * because the person looking for "the November ad" does not know or care which it is, and two
 * screens would mean checking both. What differs is what each can DO, and the tile says so: a
 * link tile is labelled a link post, because that is what attaching it produces, and discovering
 * that in the composer later would be a surprise.
 *
 * THUMBNAILS COME FROM `parseVideoUrl` (utils/videoEmbed.ts), the parser this app already has.
 * Writing a second one here would drift from it, and the backend deliberately stores no derived
 * id, so this is the only place that knows a YouTube URL has a thumbnail.
 *
 * RIGHTS WARN, NEVER BLOCK. Ali, same day. An expired asset is still listed, still selectable,
 * and wears a red chip. "No rights recorded" is grey rather than green: nobody decided anything
 * about it, which is not the same as fine.
 */

type MimeFamily = '' | 'image' | 'video' | 'application';

const MIME_FAMILIES: ReadonlyArray<{ value: MimeFamily; label: string }> = [
  { value: '', label: 'Any type' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'application', label: 'Documents' },
];

export default function AdminMediaLibraryPage(): JSX.Element {
  const { brandId: scopeBrandId } = useMarketingBrand();
  /**
   * ALL_BRANDS is the switcher's "everything" option and is explicitly never sent to an API
   * (brandScope.ts). So it becomes null here: listing with no brand means every brand in scope,
   * which is the right reading, while UPLOADING with no brand is impossible - an asset belongs to
   * exactly one brand, and the upload control says so rather than failing at the server.
   */
  const brandId = scopeBrandId && scopeBrandId !== ALL_BRANDS ? scopeBrandId : null;

  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<LibraryKind | ''>('');
  const [mimeFamily, setMimeFamily] = useState<MimeFamily>('');
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [linkUrl, setLinkUrl] = useState('');
  const [linkAlt, setLinkAlt] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const filters: LibraryFilters = useMemo(() => ({
    brandId: brandId ?? undefined,
    kind: kind || undefined,
    mimeFamily: mimeFamily || undefined,
    tag: tag.trim() || undefined,
    q: q.trim() || undefined,
    includeArchived: showArchived,
    limit: 100,
  }), [brandId, kind, mimeFamily, tag, q, showArchived]);

  const reload = useCallback(async () => {
    try {
      const page = await listLibrary(filters);
      setAssets(page.assets);
      setTotal(page.total);
      setError(null);
    } catch {
      setAssets([]);
      setError('The library could not be loaded. Reload the page to try again.');
    }
  }, [filters]);

  /**
   * Debounced. `filters` changes on every keystroke, and without this each letter typed into the
   * search box fired its own request - the last one to return wins, which is also a race.
   */
  useEffect(() => {
    const t = setTimeout(() => { void reload(); }, 250);
    return () => clearTimeout(t);
  }, [reload]);

  const describeFailure = (err: unknown, fallback: string): string => {
    const detail = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
    return typeof detail === 'string' && detail.trim() !== '' ? detail : fallback;
  };

  const addLink = useCallback(async () => {
    if (!linkUrl.trim() || !linkAlt.trim()) return;
    setBusy(true);
    try {
      await saveLink({ brandId: brandId ?? null, url: linkUrl.trim(), altText: linkAlt.trim() });
      setLinkUrl('');
      setLinkAlt('');
      setNotice({ tone: 'success', text: 'Link saved to the library.' });
      await reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: describeFailure(err, 'That link could not be saved.') });
    } finally {
      setBusy(false);
    }
  }, [brandId, linkUrl, linkAlt, reload]);

  const upload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!brandId) {
      setNotice({ tone: 'danger', text: 'Choose a brand first: an asset belongs to one brand.' });
      return;
    }
    setBusy(true);
    let added = 0;
    let reusedCount = 0;
    try {
      for (const file of Array.from(files)) {
        // The filename is a starting description, not a good one. The operator edits it inline,
        // and the field is presented as required rather than optional.
        const { reused } = await uploadLibraryFile({ brandId, file, altText: file.name.slice(0, 300) });
        if (reused) reusedCount += 1; else added += 1;
      }
      const parts: string[] = [];
      if (added) parts.push(`${added} added`);
      // Said out loud: re-uploading the same bytes looks like nothing happened otherwise.
      if (reusedCount) parts.push(`${reusedCount} already in the library`);
      setNotice({ tone: 'success', text: `${parts.join(', ')}. Add a description to each so it can be found again.` });
      await reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: describeFailure(err, 'That upload did not complete.') });
    } finally {
      setBusy(false);
    }
  }, [brandId, reload]);

  const saveEdit = useCallback(async (asset: LibraryAsset, patch: { altText?: string; tags?: string[]; rightsHolder?: string | null; rightsExpiresAt?: string | null }) => {
    setBusy(true);
    try {
      await editAsset(asset.id, patch);
      setEditing(null);
      await reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: describeFailure(err, 'That change could not be saved.') });
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const archive = useCallback(async (asset: LibraryAsset) => {
    setBusy(true);
    try {
      await archiveAsset(asset.id);
      setNotice({ tone: 'success', text: 'Archived. Posts that already used it are unaffected.' });
      await reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: describeFailure(err, 'That asset could not be archived.') });
    } finally {
      setBusy(false);
    }
  }, [reload]);

  return (
    <div data-testid="media-library">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <div>
          <h1 className="h4 mb-1">Library</h1>
          <p className="text-muted small mb-0">
            Everything this brand can post: files we hold, and links we do not.
          </p>
        </div>
        <div className="ms-auto text-muted small" aria-live="polite">
          {assets === null ? 'Loading…' : `${total} item${total === 1 ? '' : 's'}`}
        </div>
      </div>

      {notice && (
        <div className={`alert alert-${notice.tone === 'success' ? 'success' : 'danger'} py-2 small`} role="status">
          {notice.text}
        </div>
      )}
      {error && <div className="alert alert-danger py-2 small" role="alert">{error}</div>}

      {/* ── Add ───────────────────────────────────────────────────────────────────────── */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold">Add to the library</div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-lg-6">
              <label className="form-label small fw-medium" htmlFor="lib-url">Paste a link</label>
              <input
                id="lib-url"
                className="form-control form-control-sm"
                placeholder="https://youtu.be/…"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
              />
              <label className="form-label small fw-medium mt-2" htmlFor="lib-url-alt">
                Description <span className="text-danger" aria-hidden="true">*</span>
              </label>
              <input
                id="lib-url-alt"
                className="form-control form-control-sm"
                placeholder="What is in it, for someone who cannot see it"
                value={linkAlt}
                onChange={(e) => setLinkAlt(e.target.value)}
                aria-describedby="lib-url-alt-help"
              />
              <div className="form-text" id="lib-url-alt-help">
                Required. It is how this is found again, and how it is described to people using a screen reader.
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm mt-2"
                onClick={() => void addLink()}
                disabled={busy || !linkUrl.trim() || linkAlt.trim().length < 3}
              >
                Save link
              </button>
            </div>

            <div className="col-12 col-lg-6">
              <span className="form-label small fw-medium d-block">Upload files</span>
              {/*
                KEYBOARD-REACHABLE UPLOAD. The drop zone is a real <button>, not a div with a
                click handler: dragging is the shortcut, and the button is the way that works
                without a mouse, and it carries the describedby.

                The <input type="file"> below is aria-hidden and tabIndex -1 ON PURPOSE: it is a
                mechanism, not a control. The button above is the control, and exposing both
                would put two upload affordances in the tab order where there is one job. (An
                earlier version of this comment claimed the input was kept visible to assistive
                tech, which was simply untrue of code marked aria-hidden.)
              */}
              <button
                type="button"
                className={`btn w-100 border-2 border-dashed p-4 text-center ${dragging ? 'border-primary bg-light' : 'border-secondary-subtle'}`}
                style={{ borderStyle: 'dashed' }}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files); }}
                disabled={busy || !brandId}
                aria-describedby="lib-upload-help"
              >
                <i className="ri-upload-cloud-2-line fs-4 d-block mb-1 text-primary" aria-hidden="true" />
                <span className="small fw-semibold d-block">Choose files, or drop them here</span>
                <span className="small text-muted">Images, MP4 video, or PDF</span>
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="d-none"
                aria-hidden="true"
                tabIndex={-1}
                onChange={(e) => { void upload(e.target.files); e.target.value = ''; }}
              />
              <div className="form-text" id="lib-upload-help">
                {brandId
                  ? 'Uploading the same file twice reuses what is already here rather than adding a copy.'
                  : 'Choose a brand first: an asset belongs to one brand.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────────────── */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 250 }}
          placeholder="Search descriptions and filenames"
          aria-label="Search the library"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 150 }}
          aria-label="Filter by kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as LibraryKind | '')}
        >
          <option value="">Files and links</option>
          <option value="file">Files only</option>
          <option value="link">Links only</option>
        </select>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 150 }}
          aria-label="Filter by type"
          value={mimeFamily}
          onChange={(e) => setMimeFamily(e.target.value as MimeFamily)}
        >
          {MIME_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 160 }}
          placeholder="Tag"
          aria-label="Filter by tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
        <div className="form-check form-switch ms-auto">
          <input
            className="form-check-input"
            type="checkbox"
            id="lib-archived"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <label className="form-check-label small" htmlFor="lib-archived">Show archived</label>
        </div>
      </div>

      {/* ── Grid ──────────────────────────────────────────────────────────────────────── */}
      {assets !== null && assets.length === 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            <i className="ri-folder-image-line fs-2 d-block mb-2" aria-hidden="true" />
            <p className="mb-0 small">
              {q || tag || kind || mimeFamily
                ? 'Nothing matches those filters.'
                : 'Nothing here yet. Paste a link or upload a file above.'}
            </p>
          </div>
        </div>
      )}

      <div className="row g-3">
        {(assets ?? []).map((asset) => (
          <div className="col-12 col-sm-6 col-lg-4 col-xxl-3" key={asset.id}>
            <AssetTile
              asset={asset}
              busy={busy}
              editing={editing === asset.id}
              onEdit={() => setEditing(editing === asset.id ? null : asset.id)}
              onSave={(patch) => void saveEdit(asset, patch)}
              onArchive={() => void archive(asset)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * What an asset looks like, and how it plays.
 *
 * Ali, 2026-11-13: "I should be able to click on it and play the video directly in the app" and
 * "also viewers for mp4 also". Four cases, and they are genuinely different:
 *
 *   a LINK that parses as a video -> the app's OWN player (components/timeline/VideoEmbed). It
 *     already draws a poster with a play button and swaps in the provider iframe on click, so
 *     there is nothing to build. `onWatchBeat` is deliberately NOT passed: that reports student
 *     watch progress, and an admin previewing the library is not studying.
 *   an MP4 FILE -> a native <video controls>, pointed at the signed URL the list now returns.
 *     `preload="metadata"` so a grid of twenty does not pull twenty videos.
 *   an IMAGE FILE -> the image itself, which is its own preview.
 *   a PDF or anything else -> an icon and the type, because there is nothing to play. Honest
 *     beats a broken frame.
 *
 * A file with no signed URL falls back to the icon rather than rendering a dead player: signing
 * can fail, and a control that does nothing is worse than no control.
 */
export function AssetViewer({ asset, video, poster }: {
  asset: LibraryAsset;
  video: ReturnType<typeof parseVideoUrl>;
  poster: string | null;
}): JSX.Element {
  const isPlayableLink = asset.kind === 'link' && video && video.kind !== 'link';
  const isVideoFile = asset.kind === 'file' && asset.mimeType.startsWith('video/') && Boolean(asset.url);
  const isImageFile = asset.kind === 'file' && asset.mimeType.startsWith('image/') && Boolean(asset.url);

  if (isPlayableLink) {
    return (
      <div className="rounded-top overflow-hidden" data-testid={`viewer-link-${asset.id}`}>
        <VideoEmbed source={video} title={asset.altText ?? undefined} poster={poster} />
      </div>
    );
  }

  if (isVideoFile) {
    return (
      <video
        className="w-100 rounded-top bg-dark"
        style={{ maxHeight: 260 }}
        controls
        preload="metadata"
        src={asset.url ?? undefined}
        data-testid={`viewer-video-${asset.id}`}
      >
        <track kind="captions" />
      </video>
    );
  }

  if (isImageFile) {
    return (
      <a
        href={asset.url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="d-block bg-light rounded-top overflow-hidden"
        style={{ maxHeight: 260 }}
        data-testid={`viewer-image-${asset.id}`}
      >
        <img
          src={asset.url ?? undefined}
          alt={asset.altText ?? ''}
          className="w-100"
          style={{ maxHeight: 260, objectFit: 'contain' }}
          loading="lazy"
        />
      </a>
    );
  }

  const icon = asset.kind === 'link'
    ? 'link'
    : asset.mimeType.startsWith('image/') ? 'image-line'
      : asset.mimeType.startsWith('video/') ? 'film-line'
        : 'file-text-line';
  return (
    <div
      className="d-flex align-items-center justify-content-center bg-light rounded-top"
      style={{ height: 150, overflow: 'hidden' }}
      data-testid={`viewer-none-${asset.id}`}
    >
      <div className="text-center text-muted">
        <i className={`ri-${icon} fs-2 d-block`} aria-hidden="true" />
        <span className="small text-uppercase">{asset.kind === 'link' ? 'link' : asset.mimeType.split('/')[1] ?? 'file'}</span>
        {asset.kind === 'file' && !asset.url && (
          <span className="small d-block text-danger">Preview unavailable</span>
        )}
      </div>
    </div>
  );
}

/** One asset. Separated so the grid stays readable and the tile can be reused by the picker. */
export function AssetTile(props: {
  asset: LibraryAsset;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onSave: (patch: { altText?: string; tags?: string[]; rightsHolder?: string | null; rightsExpiresAt?: string | null }) => void;
  onArchive: () => void;
}): JSX.Element {
  const { asset, busy, editing, onEdit, onSave, onArchive } = props;
  const [alt, setAlt] = useState(asset.altText ?? '');
  const [tagText, setTagText] = useState(asset.tags.join(', '));
  const [holder, setHolder] = useState(asset.rightsHolder ?? '');
  const [expires, setExpires] = useState(asset.rightsExpiresAt ? asset.rightsExpiresAt.slice(0, 10) : '');

  /**
   * Re-seed when the row changes. These start from props, and a reload that returns new values -
   * including the save this component just made - would otherwise leave the form showing what was
   * typed before, which reads as the save not having worked.
   */
  useEffect(() => {
    setAlt(asset.altText ?? '');
    setTagText(asset.tags.join(', '));
    setHolder(asset.rightsHolder ?? '');
    setExpires(asset.rightsExpiresAt ? asset.rightsExpiresAt.slice(0, 10) : '');
  }, [asset.id, asset.altText, asset.tags, asset.rightsHolder, asset.rightsExpiresAt]);

  const rights = rightsLabel(asset.rightsStatus);
  const video = asset.kind === 'link' ? parseVideoUrl(asset.sourceUrl) : null;
  const thumb = video ? videoThumbnail(video) : null;
  const size = readableSize(asset.byteSize);

  return (
    <div className={`card h-100 border-0 shadow-sm ${asset.archivedAt ? 'opacity-75' : ''}`} data-testid={`asset-${asset.id}`}>
      <AssetViewer asset={asset} video={video} poster={thumb} />

      <div className="card-body p-3">
        <div className="d-flex gap-1 flex-wrap mb-2">
          {/*
            A LINK TILE SAYS WHAT IT WILL DO. Attaching a link turns the post into a link post -
            it is not an attachment any network uploads - and learning that in the composer
            afterwards would be a surprise rather than a choice.
          */}
          {asset.kind === 'link'
            ? <span className="badge bg-info text-dark">{linkBadge(video ? video.provider : null)}</span>
            : <span className="badge bg-light text-dark border">{asset.mimeType.replace(/^(image|video|application)\//, '')}</span>}
          <span className={`badge ${rights.className}`}>{rights.text}</span>
          {asset.archivedAt && <span className="badge bg-dark">Archived</span>}
        </div>

        {editing ? (
          <div className="d-flex flex-column gap-2">
            <label className="form-label small fw-medium mb-0" htmlFor={`alt-${asset.id}`}>
              Description <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input id={`alt-${asset.id}`} className="form-control form-control-sm" value={alt} onChange={(e) => setAlt(e.target.value)} />
            <label className="form-label small fw-medium mb-0" htmlFor={`tags-${asset.id}`}>Tags, comma separated</label>
            <input id={`tags-${asset.id}`} className="form-control form-control-sm" value={tagText} onChange={(e) => setTagText(e.target.value)} />
            <label className="form-label small fw-medium mb-0" htmlFor={`holder-${asset.id}`}>Rights held by</label>
            <input id={`holder-${asset.id}`} className="form-control form-control-sm" value={holder} onChange={(e) => setHolder(e.target.value)} />
            <label className="form-label small fw-medium mb-0" htmlFor={`exp-${asset.id}`}>Rights expire</label>
            <input id={`exp-${asset.id}`} type="date" className="form-control form-control-sm" value={expires} onChange={(e) => setExpires(e.target.value)} />
            <div className="d-flex gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || alt.trim().length < 3}
                onClick={() => onSave({
                  altText: alt.trim(),
                  tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
                  rightsHolder: holder.trim() || null,
                  // Cleared by sending null, which the route distinguishes from "not mentioned".
                  rightsExpiresAt: expires ? new Date(`${expires}T00:00:00Z`).toISOString() : null,
                })}
              >
                Save
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onEdit} disabled={busy}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <p className="small fw-semibold mb-1" style={{ overflowWrap: 'anywhere' }}>
              {asset.altText || <span className="text-danger">No description yet</span>}
            </p>
            <p className="small text-muted mb-2" style={{ overflowWrap: 'anywhere' }}>
              {asset.kind === 'link' ? asset.sourceUrl : [asset.originalFilename, size].filter(Boolean).join(' · ')}
            </p>
            {asset.tags.length > 0 && (
              <div className="d-flex gap-1 flex-wrap mb-2">
                {asset.tags.map((t) => <span className="badge bg-light text-dark border" key={t}>{t}</span>)}
              </div>
            )}
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-primary btn-sm" onClick={onEdit} disabled={busy}>Edit</button>
              {!asset.archivedAt && (
                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onArchive} disabled={busy}>Archive</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
