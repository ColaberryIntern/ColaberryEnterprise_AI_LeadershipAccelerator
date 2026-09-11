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
}

const CONTENT_TYPES: ContentType[] = ['text', 'image', 'video', 'carousel', 'thread', 'link'];

export default function ComposerSetup({ values, brands, campaigns, locked, busy, onChange, onSubmit }: ComposerSetupProps) {
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
          {chosen && !chosen.utm_campaign_slug && <div className="form-text text-warning">This campaign has no UTM slug; tracked links will be refused until it does.</div>}
        </div>
        <div className="col-md-4">
          <label className="form-label small mb-1" htmlFor="composer-type">Content type</label>
          <select id="composer-type" className="form-select form-select-sm" value={values.content_type} disabled={busy} onChange={(e) => set('content_type', e.target.value as ContentType)}>
            {CONTENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
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
          <label className="form-label small mb-1" htmlFor="composer-body">Canonical message</label>
          <textarea id="composer-body" className="form-control form-control-sm" rows={5} value={values.canonical_body} disabled={busy} maxLength={20000} onChange={(e) => set('canonical_body', e.target.value)} />
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
