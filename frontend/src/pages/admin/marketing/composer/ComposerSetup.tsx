import React from 'react';
import type { Brand } from '../../../../services/adminBrandApi';
import type { ContentType, Poll, ProviderSummary } from '../../../../services/contentComposerApi';
import ComposerPollEditor, { EMPTY_POLL } from './ComposerPollEditor';
import { blockerSentence, canCreate } from './setupGate';
import { setupShape } from './setupShape';
import { checkVideoLink, excludedByContentType, linkPostNotice } from './videoSource';
import {
  applyDestination, destinationMode, externalUrlNote, pickerNote, selectablePages,
  type LandingPageOption,
} from './landingPageChoices';

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
  /** A landing page this platform built. Mutually exclusive with destination_url. */
  landing_page_id: string | null;
  destination_url: string;
  canonical_body: string;
  content_type: ContentType;
  is_paid: boolean;
  has_offer: boolean;
  /** Only meaningful when content_type is `poll`. */
  poll: Poll | null;
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
  /** Connected networks, so a link post can name which of them it would exclude. */
  providers?: readonly ProviderSummary[];
  /**
   * This brand's landing pages. Unfiltered on purpose: the picker shows the ones that can be
   * chosen AND names the ones it is withholding with a reason, which a pre-filtered list could
   * not do.
   */
  landingPages?: readonly LandingPageOption[];
  /** Send the operator off to build one. Absent when there is nowhere to send them yet. */
  onCreateLandingPage?: () => void;
  /** The inline landing-page builder, rendered in place of navigating away. */
  builderSlot?: React.ReactNode;
  /**
   * The upload control, rendered INSIDE the content-type column.
   *
   * It is a slot rather than a prop bundle because the upload needs the item id, the upload
   * progress and the attach/detach handlers - all of which live on the page. Passing the node
   * keeps that ownership where it is and still puts the control where the eye expects it:
   * directly under "video", not at the bottom of the form.
   */
  mediaSlot?: React.ReactNode;
}

const CONTENT_TYPES: ContentType[] = ['text', 'image', 'video', 'carousel', 'thread', 'link', 'poll', 'document'];

export default function ComposerSetup({
  values, brands, campaigns, locked, busy, onChange, onSubmit, onAssignSlug, onDraftMessage, draftNotes,
  providers = [], mediaSlot = null, landingPages = [], onCreateLandingPage, builderSlot = null,
}: ComposerSetupProps) {
  const [topic, setTopic] = React.useState('');
  /** 'upload' or 'link', for a video. Local: choosing it is not yet a change to the post. */
  const [videoSource, setVideoSource] = React.useState<'upload' | 'link'>('upload');
  const [videoLink, setVideoLink] = React.useState('');
  const [videoLinkError, setVideoLinkError] = React.useState<string | null>(null);

  const set = <K extends keyof SetupValues>(k: K, v: SetupValues[K]) => onChange({ ...values, [k]: v });
  const note = pickerNote(landingPages, values.brand_id);
  const visibleCampaigns = campaigns.filter((c) => !values.brand_id || !c.brand_id || c.brand_id === values.brand_id);
  const chosen = campaigns.find((c) => c.id === values.campaign_id);
  // What THIS content type needs. Drives the labels and which fields render at all.
  const shape = setupShape(values.content_type);
  const canSubmit = canCreate(values, busy);
  const blocker = blockerSentence(values);

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
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {/* The option labels used to carry "(attach a file under Channels)" and the warning
              below pointed there too. Both are gone because the upload now sits in this section,
              under this field - which is what Ali asked for: "the video should be uploaded at the
              time you select that you want a video." */}
          {shape.mediaHint && (
            <div className="form-text" data-testid="media-type-hint">{shape.mediaHint}</div>
          )}

          {values.content_type === 'video' && (
            // A video can be a file OR a link. The link is not a video file, so saying what it
            // BECOMES - and what that costs - has to happen before the choice applies.
            <div className="mt-2" data-testid="video-source">
              <div className="btn-group btn-group-sm w-100" role="group" aria-label="Video source">
                <button type="button" className={`btn btn-outline-secondary ${videoSource === 'upload' ? 'active' : ''}`}
                  aria-pressed={videoSource === 'upload'} disabled={busy}
                  onClick={() => { setVideoSource('upload'); setVideoLinkError(null); }}>Upload a file</button>
                <button type="button" className={`btn btn-outline-secondary ${videoSource === 'link' ? 'active' : ''}`}
                  aria-pressed={videoSource === 'link'} disabled={busy}
                  onClick={() => setVideoSource('link')} data-testid="video-source-link">Link to a video</button>
              </div>
              {videoSource === 'link' && (
                <div className="mt-2">
                  <div className="form-text text-warning-emphasis mb-1" data-testid="link-post-notice">
                    {linkPostNotice(excludedByContentType(providers, 'link'))}
                  </div>
                  <div className="d-flex gap-1">
                    <input
                      className="form-control form-control-sm"
                      placeholder="https://vimeo.com/... or https://youtube.com/watch?v=..."
                      value={videoLink}
                      disabled={busy}
                      onChange={(e) => { setVideoLink(e.target.value); setVideoLinkError(null); }}
                      data-testid="video-link-input"
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary text-nowrap"
                      disabled={busy}
                      data-testid="video-link-apply"
                      onClick={() => {
                        const check = checkVideoLink(videoLink);
                        // A refused link changes NOTHING - the content type stays `video`, so a
                        // typo cannot silently turn the post into something else.
                        if (!check.ok) { setVideoLinkError(check.reason); return; }
                        setVideoLinkError(null);
                        onChange(applyDestination({ ...values, content_type: 'link' }, { kind: 'url', url: videoLink.trim() }));
                      }}
                    >
                      Use this link
                    </button>
                  </div>
                  {videoLinkError && <div className="form-text text-danger" data-testid="video-link-error">{videoLinkError}</div>}
                </div>
              )}
            </div>
          )}
          {mediaSlot}
        </div>
        <div className="col-md-6">
          <label className="form-label small mb-1" htmlFor="composer-title">
            Title (internal) <span className="text-danger" aria-hidden="true">*</span>
            <span className="text-muted ms-1">required</span>
          </label>
          {/* Internal only - it never appears in a post, which is exactly why it gets left
              blank and why the button has to say it is waiting on this. */}
          <input id="composer-title" className="form-control form-control-sm" value={values.title} disabled={busy} maxLength={200} required aria-required="true" onChange={(e) => set('title', e.target.value)} />
          <div className="form-text small">Names the post in the queue and the calendar. Not published.</div>
        </div>
        {shape.showLandingPage && (
        <div className="col-md-6">
          <label className="form-label small mb-1" htmlFor="composer-destination">Landing page (destination for tracked links)</label>
          {/* A picker, not a text box. The text box was the whole problem: it could point a
              tracked campaign anywhere, including at a page this platform cannot measure, and
              what was typed was never stored. Only this brand's published, platform-built pages
              are offered; a plain URL is still possible and says what it costs. */}
          <select
            id="composer-destination"
            className="form-select form-select-sm"
            value={destinationMode(values) === 'url' ? '__url__' : (values.landing_page_id ?? '')}
            disabled={busy}
            data-testid="landing-page-picker"
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__url__') return onChange(applyDestination(values, { kind: 'url', url: values.destination_url || 'https://' }));
              if (v === '') return onChange(applyDestination(values, { kind: 'none' }));
              onChange(applyDestination(values, { kind: 'page', id: v }));
            }}
          >
            <option value="">No landing page</option>
            {selectablePages(landingPages, values.brand_id).map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.path ?? `/lp/.../${p.slug}`})</option>
            ))}
            <option value="__url__">A URL we did not build...</option>
          </select>
          {note && <div className="form-text small text-warning-emphasis" data-testid="landing-page-note">{note}</div>}
          {destinationMode(values) === 'url' && (
            <>
              <input
                className="form-control form-control-sm mt-2" type="url" placeholder="https://"
                value={values.destination_url} disabled={busy} aria-label="Destination URL"
                data-testid="landing-page-url"
                onChange={(e) => onChange(applyDestination(values, { kind: 'url', url: e.target.value }))}
              />
              <div className="form-text small text-warning-emphasis" data-testid="external-url-note">{externalUrlNote('url')}</div>
            </>
          )}
          {/*
            The builder opens HERE rather than navigating. This button used to call
            `navigate('/admin/marketing/landing-pages')`, which abandoned the composer and took
            anything unsaved with it. `builderSlot` is the panel; the button only offers to open
            it, and disappears while it is open so there is one way back out (its own Close).
          */}
          {onCreateLandingPage && !builderSlot && (
            <button type="button" className="btn btn-link btn-sm px-0 mt-1" disabled={busy} onClick={onCreateLandingPage} data-testid="build-landing-page">
              + Build a new landing page here
            </button>
          )}
          {builderSlot}
        </div>
        )}
        <div className="col-12">
          <div className="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-1">
            <label className="form-label small mb-0" htmlFor="composer-body" data-testid="message-label">{shape.messageLabel}</label>
            {onDraftMessage && shape.offerDraft && (
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
          {values.content_type === 'poll' && (
            <div className="mt-2">
              <ComposerPollEditor value={values.poll ?? EMPTY_POLL} busy={busy} onChange={(poll) => onChange({ ...values, poll })} />
            </div>
          )}
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
          {/* A disabled button has to say what would enable it. Same source as `canSubmit`,
              so the sentence and the button can never disagree. */}
          {blocker && !busy && (
            <span className="small text-warning-emphasis ms-auto" data-testid="setup-blocker">{blocker}</span>
          )}
          <button type="submit" className={`btn btn-sm btn-primary ${blocker && !busy ? '' : 'ms-auto'}`} disabled={!canSubmit} title={blocker ?? undefined}>{locked ? 'Save changes' : 'Create draft'}</button>
        </div>
      </div>
    </form>
  );
}
