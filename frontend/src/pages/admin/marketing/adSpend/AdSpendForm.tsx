import React, { useState } from 'react';
import { addSpend, apiErrorMessage, type KnownCampaign, type Platform } from '../../../../services/adSpendApi';
import { centralTodayIso, dollarsToCents } from './adSpendFormat';
import { sourceLabel } from '../performance/performanceMetrics';

/**
 * Type spend by hand: a day, or a range ("$700 for Oct 1-7"). A range is spread evenly across its
 * days in the report, and a Meta sync or an import of the same days replaces it for those days.
 *
 * The campaign field suggests the utm_campaign values signups actually arrived with, because spend
 * typed against an id nobody signed up through matches nothing in the report.
 */

interface Props {
  knownCampaigns: KnownCampaign[];
  onSaved: () => void;
}

const PLATFORM_OPTIONS: Array<{ value: Platform; label: string }> = [
  { value: 'meta', label: 'Meta (Facebook / Instagram)' },
  { value: 'google', label: 'Google' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'other', label: 'Other' },
];

export default function AdSpendForm({ knownCampaigns, onSaved }: Props) {
  const today = centralTodayIso();
  const [platform, setPlatform] = useState<Platform>('meta');
  const [campaignRef, setCampaignRef] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const known = knownCampaigns.some((k) => k.utmCampaign.trim().toLowerCase() === campaignRef.trim().toLowerCase());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = dollarsToCents(amount);
    if (amountCents === null) { setMessage({ kind: 'error', text: 'Amount must be dollars and cents, like 250 or 1,234.56.' }); return; }
    if (end < start) { setMessage({ kind: 'error', text: 'End date is before start date.' }); return; }
    setSaving(true);
    setMessage(null);
    try {
      await addSpend({ platform, campaignRef: campaignRef.trim(), campaignName: campaignName.trim() || null, periodStart: start, periodEnd: end, amountCents, note: note.trim() || null });
      setMessage({ kind: 'ok', text: `Saved $${(amountCents / 100).toFixed(2)} for ${campaignRef.trim()}.` });
      setAmount('');
      setNote('');
      onSaved();
    } catch (err) {
      setMessage({ kind: 'error', text: apiErrorMessage(err, 'Could not save. Nothing was recorded.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="row g-3" aria-label="Add ad spend">
      <div className="col-md-4">
        <label className="form-label small fw-semibold" htmlFor="as-platform">Platform</label>
        <select id="as-platform" className="form-select" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
          {PLATFORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="col-md-4">
        <label className="form-label small fw-semibold" htmlFor="as-campaign">Campaign id or name</label>
        <input
          id="as-campaign" className="form-control" required maxLength={120} list="as-known-campaigns"
          value={campaignRef} onChange={(e) => setCampaignRef(e.target.value)} placeholder="e.g. 52708443249234"
          aria-describedby="as-campaign-help"
        />
        <datalist id="as-known-campaigns">
          {knownCampaigns.map((k) => (
            <option key={`${k.utmSource}-${k.utmCampaign}`} value={k.utmCampaign}>
              {`${sourceLabel(k.utmSource)} · ${k.signups} signups`}
            </option>
          ))}
        </datalist>
        <div id="as-campaign-help" className={`form-text ${campaignRef && !known ? 'text-warning' : ''}`}>
          {campaignRef && !known
            ? 'No signup carries this value in utm_campaign yet, so the report cannot match it to anyone.'
            : 'Exactly what the ad URL puts in utm_campaign.'}
        </div>
      </div>
      <div className="col-md-4">
        <label className="form-label small fw-semibold" htmlFor="as-name">Campaign name <span className="text-muted fw-normal">(optional)</span></label>
        <input id="as-name" className="form-control" maxLength={255} value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
      </div>
      <div className="col-6 col-md-3">
        <label className="form-label small fw-semibold" htmlFor="as-start">From</label>
        <input id="as-start" type="date" className="form-control" required max={today} value={start}
          onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} />
      </div>
      <div className="col-6 col-md-3">
        <label className="form-label small fw-semibold" htmlFor="as-end">To</label>
        <input id="as-end" type="date" className="form-control" required min={start} max={today} value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <div className="col-md-3">
        <label className="form-label small fw-semibold" htmlFor="as-amount">Amount spent (USD)</label>
        <div className="input-group">
          <span className="input-group-text">$</span>
          <input id="as-amount" className="form-control" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
        </div>
      </div>
      <div className="col-md-3">
        <label className="form-label small fw-semibold" htmlFor="as-note">Note <span className="text-muted fw-normal">(optional)</span></label>
        <input id="as-note" className="form-control" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="col-12 d-flex align-items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save spend'}</button>
        {message && (
          <span role={message.kind === 'error' ? 'alert' : 'status'} className={`small ${message.kind === 'error' ? 'text-danger' : 'text-success'}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
