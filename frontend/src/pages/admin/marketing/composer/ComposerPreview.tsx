import React, { useState } from 'react';
import type { ItemMedia, Poll, ContentVariant, ItemLink, ProviderKey, ProviderSummary } from '../../../../services/contentComposerApi';
import { acceptedRatios, chooseFrame, cropNote, frameBox, type Frame } from './previewFraming';

/**
 * Step 8: how the post will look on each network, at desktop and phone width.
 *
 * This is a presentation of the DATA, not a pixel copy of each network's UI - those change
 * monthly and a replica that drifts is worse than a neutral card, because it teaches the eye
 * to trust a layout the network no longer uses. What it does show faithfully is what matters
 * for the decision: the text as it will read, where it will be truncated, whether the link is
 * clickable there, the character budget, and the media count.
 */

export interface ComposerPreviewProps {
  variants: ContentVariant[];
  providers: ProviderSummary[];
  links: ItemLink[];
  mediaCount: number;
  /** The attachments themselves, so the preview shows the file and not a grey box. */
  media?: readonly ItemMedia[];
  brandName: string;
  /** Drawn under the text as an un-voted poll when present. */
  poll?: Poll | null;
}

type Device = 'desktop' | 'mobile';

/**
 * The attachments, as the file rather than as a grey rectangle.
 *
 * This drew `mediaCount` empty boxes until 2026-10-01, which meant the preview could not answer
 * the one question a preview of a video post exists to answer: is that the right video? Reported
 * in production as "the preview does not show my video" - and it never had, by construction,
 * because nothing passed it the media.
 *
 * `url` is a short-lived signed link to the same `/m/` route the publisher fetches from. When it
 * is absent - no public base URL on this server - the placeholder returns, captioned, rather
 * than a broken image icon.
 *
 * SHOWING IT IN THE RIGHT SHAPE (2026-10-15). Showing the file was only half the question. Every
 * attachment was drawn in the same 360px-tall `contain` box, so a 9:16 reel and a 16:9 landscape
 * previewed identically - and neither matched what the network would publish, because a network
 * crops an upload into the nearest shape it supports rather than letterboxing it. The frame below
 * comes from that network's own registry entry, and `object-fit: cover` means what you see is
 * what survives the crop. "Whole file" puts it back, for checking the parts being cut.
 */
function PreviewMedia({
  media, count, provider, networkName, maxWidth,
}: {
  media: readonly ItemMedia[];
  count: number;
  provider: ProviderSummary | undefined;
  networkName: string;
  maxWidth: number;
}) {
  const [whole, setWhole] = useState(false);
  const shown = media.slice(0, 4);
  // No media rows but a non-zero count means the confirmation knows about assets this component
  // was not given; show the old placeholder rather than claiming there is nothing attached.
  if (shown.length === 0) {
    if (count === 0) return null;
    return (
      <div className="mt-2 d-flex gap-1" data-testid="preview-media-placeholder">
        {Array.from({ length: Math.min(count, 4) }).map((_, i) => (
          <div key={i} className="bg-light border rounded" style={{ width: count === 1 ? '100%' : 96, height: 96 }} aria-label={`media ${i + 1}`} />
        ))}
        {count > 4 && <div className="small text-muted align-self-center">+{count - 4}</div>}
      </div>
    );
  }

  const single = shown.length === 1;

  // Resolved once per render so the notes below and the boxes above cannot disagree.
  const frames = shown.map((m) => chooseFrame(m, acceptedRatios(m.mimeType, provider)));
  const notes = shown
    .map((m, i) => (frames[i] ? cropNote(m, frames[i] as Frame, networkName) : null))
    .filter((n): n is string => n !== null);
  const framable = frames.some((f) => f !== null);

  return (
    <>
    <div className="mt-2 d-flex flex-wrap gap-1 align-items-start" data-testid="preview-media">
      {shown.map((m, i) => {
        const frame = whole ? null : frames[i];
        // The frame the network will use, at a size that fits the card. Falls back to the old
        // plain box whenever the shape is unknown - a file with no recorded dimensions, or a
        // provider whose registry entry carries no ratios for this media type.
        const box: React.CSSProperties = frame
          ? { ...frameBox(frame.value, single ? maxWidth : 112, single ? 420 : 112), objectFit: 'cover' }
          : single
            ? { width: '100%', maxHeight: 360, objectFit: 'contain' }
            : { width: 96, height: 96, objectFit: 'cover' };
        if (m.url && m.mimeType.startsWith('video/')) {
          return (
            <video
              key={m.mediaAssetId}
              src={m.url}
              controls
              preload="metadata"
              className="border rounded bg-dark"
              style={box}
              data-testid={`preview-video-${m.mediaAssetId}`}
            />
          );
        }
        if (m.url && m.mimeType.startsWith('image/')) {
          return (
            <img
              key={m.mediaAssetId}
              src={m.url}
              // The alt text is the operator's own, and it is required at upload - so the preview
              // is also where they see whether it reads well.
              alt={m.altText ?? ''}
              className="border rounded"
              style={box}
              data-testid={`preview-image-${m.mediaAssetId}`}
            />
          );
        }
        // PDFs and anything unrenderable: a tile that states what it is, not an empty box.
        return (
          <div
            key={m.mediaAssetId}
            className="border rounded bg-light d-flex flex-column justify-content-center align-items-center text-muted p-2"
            style={single ? { width: '100%', minHeight: 96 } : { width: 96, height: 96 }}
            data-testid={`preview-file-${m.mediaAssetId}`}
          >
            <span className="small fw-semibold text-uppercase">{m.mimeType.split('/')[1] ?? 'file'}</span>
            {m.pages !== null && <span style={{ fontSize: '0.7rem' }}>{m.pages} page{m.pages === 1 ? '' : 's'}</span>}
          </div>
        );
      })}
      {media.length > 4 && <div className="small text-muted align-self-center">+{media.length - 4}</div>}
    </div>

    {/* Only what is being cut, and only when something is. A note on every attachment teaches
        the eye to skip the notes, which costs exactly the ones that mattered. */}
    {!whole && notes.map((n) => (
      <div key={n} className="small text-warning mt-1" data-testid="preview-crop-note">{n}</div>
    ))}

    {framable && (
      <button
        type="button"
        className="btn btn-link btn-sm p-0 mt-1 text-decoration-none"
        onClick={() => setWhole((w) => !w)}
        data-testid="preview-frame-toggle"
      >
        {whole ? `Show as ${networkName} will crop it` : 'Show the whole file'}
      </button>
    )}
    </>
  );
}

/** Rough fold heuristics per network: how many characters show before "…more". */
const FOLD_CHARS: Partial<Record<ProviderKey, number>> = {
  linkedin_organization: 210,
  linkedin_member: 210,
  meta_facebook_page: 480,
  meta_instagram: 125,
};

export default function ComposerPreview({ variants, providers, links, mediaCount, media = [], brandName, poll = null }: ComposerPreviewProps) {
  const [device, setDevice] = useState<Device>('desktop');
  const [active, setActive] = useState<ProviderKey | null>(variants[0]?.provider ?? null);

  const current = variants.find((v) => v.provider === active) ?? variants[0] ?? null;
  const caps = current ? providers.find((p) => p.provider === current.provider) : undefined;
  const link = current ? links.find((l) => l.provider === current.provider) : undefined;

  if (!current) return <p className="text-muted mb-0">Generate variants to preview them.</p>;

  const text = current.body ?? '';
  const fold = FOLD_CHARS[current.provider];
  const folded = device === 'mobile' && fold !== undefined && text.length > fold;
  const shown = folded ? `${text.slice(0, fold).trimEnd()}` : text;
  const over = caps ? text.length - caps.maxChars : 0;

  return (
    <div className="composer-preview">
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Network">
          {variants.map((v) => {
            const p = providers.find((x) => x.provider === v.provider);
            return (
              <button key={v.provider} type="button" className={`btn ${v.provider === current.provider ? 'btn-dark' : 'btn-outline-dark'}`} onClick={() => setActive(v.provider)}>
                {p?.displayName ?? v.provider}
              </button>
            );
          })}
        </div>
        <div className="btn-group btn-group-sm ms-auto" role="group" aria-label="Device">
          <button type="button" className={`btn ${device === 'desktop' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setDevice('desktop')}>Desktop</button>
          <button type="button" className={`btn ${device === 'mobile' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => setDevice('mobile')}>Mobile</button>
        </div>
      </div>

      <div className="border rounded bg-white p-3" style={{ maxWidth: device === 'mobile' ? 360 : 552 }} data-testid="preview-card" data-device={device}>
        <div className="d-flex align-items-center gap-2 mb-2">
          <div className="rounded-circle bg-secondary" style={{ width: 36, height: 36 }} aria-hidden="true" />
          <div>
            <div className="fw-semibold">{brandName}</div>
            <div className="small text-muted">{caps?.displayName ?? current.provider} · just now</div>
          </div>
        </div>

        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} data-testid="preview-text">
          {shown}
          {folded && <span className="text-muted"> …more</span>}
        </div>

        {poll && (
          <div className="mt-2 border rounded p-2" data-testid="preview-poll">
            <div className="fw-semibold small mb-1">{poll.question}</div>
            {poll.options.filter((o) => o.trim() !== '').map((o, i) => (
              <div key={i} className="border rounded px-2 py-1 mb-1 small bg-light">{o}</div>
            ))}
            <div className="text-muted" style={{ fontSize: '0.75rem' }}>0 votes · {poll.durationDays} day{poll.durationDays === 1 ? '' : 's'} left</div>
          </div>
        )}

        <PreviewMedia
          media={media}
          count={mediaCount}
          provider={caps}
          networkName={caps?.displayName ?? 'This network'}
          // The card's inner width at this device, so a framed box never overflows it.
          maxWidth={device === 'mobile' ? 328 : 520}
        />

        {link && caps?.linkBehavior !== 'no_clickable_links' && (
          <div className="mt-2 border rounded p-2 bg-light small" data-testid="preview-link-card">
            <div className="text-muted">{new URL(link.finalUrl).hostname}</div>
            <div className="fw-semibold">{link.shortUrl}</div>
          </div>
        )}
        {link && caps?.linkBehavior === 'no_clickable_links' && (
          <div className="mt-2 small text-warning" data-testid="preview-link-warning">Links are not clickable in {caps.displayName} captions. Put it in the bio or a first comment.</div>
        )}
      </div>

      {caps && (
        <div className={`small mt-2 ${over > 0 ? 'text-danger' : 'text-muted'}`} data-testid="preview-budget">
          {text.length.toLocaleString()} / {caps.maxChars.toLocaleString()} characters{over > 0 ? ` - ${over.toLocaleString()} over` : ''}
          {' · '}limits verified {caps.asOf}
        </div>
      )}
    </div>
  );
}
