import React from 'react';
import {
  createRollout, controlRefusal,
  ROLLOUT_CHANNELS, ROLLOUT_MODES, DAILY_LIMIT_MAX, COHORT_MAX,
} from '../../services/growthJourneyControlsApi';
import type {
  ControlRefusal, RolloutChannel, RolloutMode,
} from '../../services/growthJourneyControlsApi';
import { safeText } from './journeyText';
import ControlRefusalNotice from './ControlRefusalNotice';

/**
 * Roll a scope forward (Phase 6, T615).
 *
 * ── THE MOST CONSEQUENTIAL FORM IN THIS ENTIRE SURFACE ──────────────────────
 *
 * Everything else on the Growth Journey screens reads. This writes, and `limited`
 * is the only setting anywhere in the admin UI that moves the system toward
 * contacting a real person. So the guards are deliberate and each one is tested:
 *
 *   - `ali_outreach` is NOT in `ROLLOUT_CHANNELS`. Ali's personal outreach can be
 *     paused from the sibling form and cannot be started from this one. Copying the
 *     pause channel list over here would hand this UI a power the API refuses;
 *   - `review` and `limited` are the only modes, and the mode decides which fields
 *     exist. A `review` body carrying a cohort or a daily limit is a 400, so the
 *     cohort and limit inputs are not merely hidden on review - `rolloutBody`
 *     strips them, because an operator who types a limit and then switches to
 *     review is the likeliest way to send an illegal body;
 *   - the daily limit is capped at 25 and the cohort at 50, mirrored from the
 *     backend so the operator sees the refusal before the round trip rather than
 *     instead of it. The server stays the authority and its 400 renders verbatim;
 *   - `reason` is required. So is a brand and a programme - a rollout names exactly
 *     one brand x programme x channel, never a wildcard.
 *
 * Nothing fires on mount, there is no form element and no default-submit: the only
 * write is the click handler.
 */

interface Props {
  brandId?: string;
  programId?: string;
  onWritten: () => void;
}

export default function RolloutForm({ brandId, programId, onWritten }: Props) {
  const [brand, setBrand] = React.useState(brandId ?? '');
  const [program, setProgram] = React.useState(programId ?? '');
  const [channel, setChannel] = React.useState<RolloutChannel>('email');
  const [mode, setMode] = React.useState<RolloutMode>('review');
  const [cohort, setCohort] = React.useState('');
  const [limit, setLimit] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [refusal, setRefusal] = React.useState<ControlRefusal | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Split on commas or whitespace, keep only positive integers. A typo'd id is
  // dropped here and the count is shown, so "I pasted 12 and it says 11" is
  // visible rather than silent - the backend also refuses an id that does not
  // exist, which is the authoritative check.
  const cohortIds = cohort
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const cohortTyped = cohort.split(/[,\s]+/).filter(Boolean).length;
  const limitNum = limit === '' ? undefined : Number(limit);
  const limitValid = limitNum === undefined
    || (Number.isInteger(limitNum) && limitNum >= 1 && limitNum <= DAILY_LIMIT_MAX);
  const cohortValid = cohortIds.length <= COHORT_MAX;
  const limitedComplete = mode !== 'limited' || (cohortIds.length > 0 && limitNum !== undefined);
  const hasReason = reason.trim().length > 0;
  const ready = Boolean(brand) && Boolean(program) && hasReason
    && limitValid && cohortValid && limitedComplete && !busy;

  const submit = async () => {
    setRefusal(null); setError(null); setBusy(true);
    try {
      await createRollout({
        brand_id: brand,
        program_id: program,
        channel,
        mode,
        cohort_lead_ids: mode === 'limited' ? cohortIds : undefined,
        daily_limit: mode === 'limited' ? limitNum : undefined,
        reason: reason.trim(),
      });
      setReason(''); setCohort(''); setLimit('');
      onWritten();
    } catch (err) {
      const r = controlRefusal(err);
      if (r) setRefusal(r);
      else setError(err instanceof Error ? err.message : 'The rollout failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card border-0 shadow-sm h-100">
      <div className="card-header bg-white fw-semibold">Roll a scope forward</div>
      <div className="card-body">
        <p className="small text-muted">
          Raises one brand × programme × channel. <code>review</code> queues for a
          human; <code>limited</code> is the only setting that can reach a person, and
          it needs a named cohort and a daily cap of at most {DAILY_LIMIT_MAX}.
          Ali&rsquo;s personal outreach cannot be rolled out from here.
        </p>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-roll-brand">Brand id (required)</label>
          <input id="gj-roll-brand" className="form-control form-control-sm" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-roll-program">Programme id (required)</label>
          <input id="gj-roll-program" className="form-control form-control-sm" value={program} onChange={(e) => setProgram(e.target.value)} />
        </div>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-roll-channel">Channel</label>
          <select id="gj-roll-channel" className="form-select form-select-sm" value={channel} onChange={(e) => setChannel(e.target.value as RolloutChannel)}>
            {ROLLOUT_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-roll-mode">Mode</label>
          <select id="gj-roll-mode" className="form-select form-select-sm" value={mode} onChange={(e) => setMode(e.target.value as RolloutMode)}>
            {ROLLOUT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {mode === 'limited' && (
          <>
            <div className="mb-2">
              <label className="form-label small fw-medium" htmlFor="gj-roll-cohort">
                Cohort lead ids (required, at most {COHORT_MAX})
              </label>
              <input id="gj-roll-cohort" className="form-control form-control-sm" placeholder="4711, 4712" value={cohort} onChange={(e) => setCohort(e.target.value)} />
              <div className={`form-text${cohortValid ? '' : ' text-danger'}`}>
                {cohortIds.length} usable id{cohortIds.length === 1 ? '' : 's'}
                {cohortTyped !== cohortIds.length && ` (${cohortTyped - cohortIds.length} ignored)`}
                {!cohortValid && ` — the cap is ${COHORT_MAX}`}
              </div>
            </div>
            <div className="mb-2">
              <label className="form-label small fw-medium" htmlFor="gj-roll-limit">
                Daily limit (required, 1–{DAILY_LIMIT_MAX})
              </label>
              <input id="gj-roll-limit" className="form-control form-control-sm" value={limit} onChange={(e) => setLimit(e.target.value)} />
              {!limitValid && (
                <div className="form-text text-danger">
                  A daily limit must be a whole number from 1 to {DAILY_LIMIT_MAX}.
                </div>
              )}
            </div>
          </>
        )}
        <div className="mb-2">
          <label className="form-label small fw-medium" htmlFor="gj-roll-reason">Reason (required)</label>
          <input id="gj-roll-reason" className="form-control form-control-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={!ready} onClick={submit}>
          {busy ? 'Rolling…' : 'Roll forward'}
        </button>
        {!hasReason && <div className="form-text">A reason is required.</div>}
        {refusal && <ControlRefusalNotice refusal={refusal} />}
        {error && <div className="alert alert-danger mt-2" role="alert">{safeText(error)}</div>}
      </div>
    </div>
  );
}
