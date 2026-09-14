import React from 'react';
import type { Brand } from '../../../../services/adminBrandApi';
import type { ContentType } from '../../../../services/contentComposerApi';

/**
 * Steps 1, 3 and 4: the choices that fix WHAT is being said and FOR WHOM.
 *
 * Brand and campaign are locked once the draft exists. The brand fixes the tenant and the
 * campaign fixes the UTM slug every tracked link reports under; changing either after links
 * are minted would leave clicks attributed to the wrong thing. Start a new post instead.
 */

export interface CampaignOption {
  id: string;
  name: string;
  brand_id: string | null;
  utm_campaign_slug: string | null;
}

export interface SetupValues {
  brand_id: string;
  campaign_id: string;
  title: string;
  destination_url: string;
  canonical_body: string;
  content_type: ContentType;
  is_paid: boolean;
  has_offer: boolean;
}

export interface ComposerSetupProps {
  values: SetupValues;
  brands: Brand[];
  campaigns: CampaignOption[];
  /** True once the item exists - brand and campaign can no longer change. */
  locked: boolean;
  busy: boolean;
  onChange: (next: SetupValues) => void;
  onSubmit: () => void;
  /** Assign the chosen campaign its UTM slug (the composer cannot mint links without one). */
  onAssignSlug?: (campaignId: string) => void;
  /** Draft the canonical message from a topic. Absent when drafting is not available. */
  onDraftMessage?: (topic: string) => void;
  /** Holes and unsupported specifics in the last draft, surfaced beside the message box. */
  draftNotes?: { placeholders: string[]; unverifiedClaims: string[] } | null;
}

const CONTENT_TYPES: ContentType[] = ['text', 'image', 'video', 'carousel', 'thread', 'link'];
/** Types the validator refuses without at least one media item. There is no upload yet. */
const MEDIA_TYPES: ReadonlySet<ContentType> = new Set<ContentType>(['image', 'video', 'carousel']);

export default function ComposerSetup({
  values, brands, campaigns, locked, busy, onChange, onSubmit, onAssignSlug, onDraftMessage, draftNotes,
}: ComposerSetupProps) {
  const [topic, setTopic] = React.useState('');
  const set = <K extends keyof SetupValues>(k: K, v: SetupValues[K]) => onChange({ ...values, [k]: v });
  const visibleCampaigns = campaigns.filter((c) => !values.brand_id || !c.brand_id || c.brand_id === values.brand_id);
  const chosen = campaigns.find((c) => c.id === values.campaign_id);
  const canSubmit = values.brand_id !== '' && values.title.trim() !== '' && !busy;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) onSubmit(); }}>
      <div className="row g-3">
        <div className="col-md-4">
          <label className="form-label small mb-1" htmlFor="composer-brand">Brand</label>
          <select id="composer-brand" className="form-select form-select-sm" value={values.brand_id} disabled={locked || busy} onChange={(e) => set('brand_id', e.target.value)}>
            <option value="">Choose a brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label small mb-1" htmlFor="composer-campaign">Campaign</label>
          <select id="composer-campaign" className="form-select form-select-sm" value={values.campaign_id} disabled={locked || busy} onChange={(e) => set('campaign_id', e.target.value)}>
            <option value="">No campaign (links cannot be tracked)</option>
            {visibleCampaigns.map((c) => <option key={c.id} value={c.id}>{c.name}{c.utm_campaign_slug ? '' : ' - no UTM slug'}</option>)}
          </select>
          {chosen && !chosen.utm_campaign_slug && (
            <div className="form-text text-warning d-flex align-items-center gap-2">
              <span>This campaign has no UTM slug; tracked links will be refused until it does.</span>
              {onAssignSlug && (
                <button type="button" className="btn btn-sm btn-outline-warning py-0" disabled={busy} onClick={() => onAssignSlug(chosen.id)} data-testid="assign-slug">
                  Assign UTM slug
                </button>
              )}
            </div>
          )}
        </div>
        <div className="col-md-4">
          <label className="form-label small mb-1" htmlFor="composer-type">Content type</label>
          <select id="composer-type" className="form-select form-select-sm" value={values.content_type} disabled={busy} onChange={(e) => set('content_type', e.target.value as ContentType)}>
            {CONTENT_TYPES.map((t) => (
              <option key={t} value={t}>{MEDIA_TYPES.has(t) ? `${t} (needs an upload, not available yet)` : t}</option>
            ))}
          </select>
          {MEDIA_TYPES.has(values.content_type) && (
            // The content type is a DECLARATION the validator holds each network to, not a
            // generator. Declaring an image post with no way to attach an image fails at
            // validation with "needs at least one media item" - a trap Ali walked into on the
            // first run. Said here, at the moment of choosing, not two steps later.
            <div className="form-text text-warning" data-testid="media-type-warning">
              This declares what you will attach; it does not create one. Attaching media is not
              available yet, so validation will block this post. Use <strong>text</strong> for now.
            </div>
          )}
        </div>
        <div className="col-md-6">
          <label className="form-label small mb-1" htmlFor="composer-title">Title (internal)</label>
          <input id="composer-title" className="form-control form-control-sm" value={values.title} disabled={busy} maxLength={200} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div className="col-md-6">
          <label className="form-label small mb-1" htmlFor="composer-destination">Landing page (destination for tracked links)</label>
          <input id="composer-destination" className="form-control form-control-sm" type="url" placeholder="https://" value={values.destination_url} disabled={busy} onChange={(e) => set('destination_url', e.target.value)} />
        </div>
        <div className="col-12">
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-1">
            <label className="form-label small mb-0" htmlFor="composer-body">Canonical message</label>
            {onDraftMessage && (
              // Starting from a topic instead of an empty box. The draft lands in the SAME
              // field and goes through the same validation and approval as anything typed,
              // so this is a faster start, not a shortcut past anything.
              <div className="d-flex align-items-center gap-2">
                <input
                  id="composer-topic"
                  className="form-control form-control-sm"
                  style={{ minWidth: '15rem' }}
                  placeholder="Topic, e.g. free AI class for working analysts"
                  value={topic}
                  disabled={busy || !values.brand_id}
                  maxLength={500}
                  onChange={(e) => setTopic(e.target.value)}
                  data-testid="draft-topic"
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary text-nowrap"
                  disabled={busy || topic.trim().length < 3 || !values.brand_id}
                  onClick={() => onDraftMessage(topic.trim())}
                  data-testid="draft-message"
                >
                  Write a first draft
                </button>
              </div>
            )}
          </div>
          <textarea id="composer-body" className="form-control form-control-sm" rows={5} value={values.canonical_body} disabled={busy} maxLength={20000} onChange={(e) => set('canonical_body', e.target.value)} />
          {onDraftMessage && !values.brand_id && (
            <div className="form-text">Choose a brand first, so the draft knows who is speaking.</div>
          )}
          {draftNotes && draftNotes.placeholders.length > 0 && (
            // Named rather than left to be spotted: a bracketed hole published as-is is worse
            // than an empty box, because it looks finished.
            <div className="form-text text-warning" data-testid="draft-placeholders">
              Fill these in before publishing: {draftNotes.placeholders.join(', ')}
            </div>
          )}
          {draftNotes && draftNotes.unverifiedClaims.length > 0 && (
            // The model was told not to invent specifics. This is the check on that, shown to
            // the person whose name goes on the post rather than quietly stripped.
            <div className="form-text text-danger" data-testid="draft-unverified">
              Check these against something real, nothing in the brief supports them: {draftNotes.unverifiedClaims.join(', ')}
            </div>
          )}
        </div>
        <div className="col-12 d-flex flex-wrap gap-3 align-items-center">
          <label className="form-check small">
            <input className="form-check-input" type="checkbox" checked={values.is_paid} disabled={busy} onChange={(e) => set('is_paid', e.target.checked)} />
            <span className="form-check-label ms-1">Paid placement (disclosure required)</span>
          </label>
          <label className="form-check small">
            <input className="form-check-input" type="checkbox" checked={values.has_offer} disabled={busy} onChange={(e) => set('has_offer', e.target.checked)} />
            <span className="form-check-label ms-1">Contains an offer or price</span>
          </label>
          <button type="submit" className="btn btn-sm btn-primary ms-auto" disabled={!canSubmit}>{locked ? 'Save changes' : 'Create draft'}</button>
        </div>
      </div>
    </form>
  );
}
