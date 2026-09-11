import React, { useState } from 'react';
import type { ContentVariant, ItemLink, ProviderKey, ProviderSummary } from '../../../../services/contentComposerApi';

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
  brandName: string;
}

type Device = 'desktop' | 'mobile';

/** Rough fold heuristics per network: how many characters show before "…more". */
const FOLD_CHARS: Partial<Record<ProviderKey, number>> = {
  linkedin_organization: 210,
  linkedin_member: 210,
  meta_facebook_page: 480,
  meta_instagram: 125,
};

export default function ComposerPreview({ variants, providers, links, mediaCount, brandName }: ComposerPreviewProps) {
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

        {mediaCount > 0 && (
          <div className="mt-2 d-flex gap-1">
            {Array.from({ length: Math.min(mediaCount, 4) }).map((_, i) => (
              <div key={i} className="bg-light border rounded" style={{ width: mediaCount === 1 ? '100%' : 96, height: 96 }} aria-label={`media ${i + 1}`} />
            ))}
            {mediaCount > 4 && <div className="small text-muted align-self-center">+{mediaCount - 4}</div>}
          </div>
        )}

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
