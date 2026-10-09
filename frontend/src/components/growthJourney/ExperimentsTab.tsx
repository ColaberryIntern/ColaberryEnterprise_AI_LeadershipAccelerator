import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { listExperiments } from '../../services/growthJourneyQueueApi';
import type { ArmCount, ArmLift, BrandExperiment } from '../../services/growthJourneyQueueApi';
import { safeText } from './journeyText';
import { JourneyEmpty, JourneyFilterBar, JourneySelect } from './journeyPaging';

/**
 * Holdout lift: whether withholding content measurably changed anything
 * (Phase 6, T615).
 *
 * ── THE BACKEND MADE IT IMPOSSIBLE TO FAKE A NUMBER, AND THIS TAB KEEPS IT SO ─
 *
 * `lift` is a discriminated union, not a nullable number:
 *
 *     { known: true;  point, low, high }   |   { known: false; reason }
 *
 * The backend's own comment says why: "`number | null` invites `?? 0` and `|| 1`,
 * which is precisely how a fabricated benchmark gets created." An unknown lift
 * carries NO `point` field at all - there is nothing on the object to accidentally
 * render - and this tab renders the `reason` instead. A measured one always shows
 * its Wilson interval beside the estimate, because a point estimate without bounds
 * is a precision claim the sample does not support, and lift on small arms is
 * exactly where that claim misleads.
 *
 * ── FOUR REASONS THERE IS NOTHING TO MEASURE, AND NONE IS "ZERO LIFT" ───────
 *
 *   `no_policy`        nobody set up a holdout for this brand
 *   `not_active`       a policy exists and is switched off
 *   `settings_invalid` a policy exists and is malformed - someone needs to fix it
 *   `lookup_failed`    the read itself failed; the governor FAILS CLOSED and
 *                      assigns no arm, so the decision is the one it would have
 *                      made with no experiment at all
 *
 * Collapsing those into "no data" would hide the only one that needs a human
 * (`settings_invalid`) behind the three that do not.
 *
 * ── AND `converted: null` IS NOT ZERO CONVERSIONS ───────────────────────────
 *
 * An arm that was not counted reports `converted: null`. Rendering that as 0 would
 * say "nobody in the treatment arm converted", which is a finding, from a read that
 * declined to look. The arm also reports `capped`, and a capped arm's lift is
 * withheld entirely rather than computed from a numerator nobody counted.
 */

const WINDOWS: readonly { value: string; label: string }[] = [
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const ABSENCE: Record<string, string> = {
  no_policy: 'No holdout policy is configured for this brand, so nothing is being withheld and there is nothing to compare.',
  not_active: 'A holdout policy exists but is not active. No arm is being assigned.',
  settings_invalid: 'A holdout policy exists and is malformed. This one needs a human: until it is fixed no arm is assigned and no lift can be measured.',
  lookup_failed: 'The policy lookup failed. The governor fails closed, so no arm was assigned and decisions were made as if no experiment existed.',
};

function Arm({ name, arm, minN }: { name: string; arm: ArmCount; minN: number }) {
  return (
    <li>
      <strong>{name}:</strong> {arm.n} subject{arm.n === 1 ? '' : 's'}
      {arm.converted === null
        ? <span className="text-muted"> · conversions not counted</span>
        : <span> · {arm.converted} converted</span>}
      {arm.capped && <span className="badge bg-warning text-dark ms-1">arm hit its cap</span>}
      {arm.n < minN && !arm.capped && (
        <span className="small text-muted d-block">
          below the floor of {minN} — {minN - arm.n} short
        </span>
      )}
    </li>
  );
}

function Lift({ lift }: { lift: ArmLift }) {
  if (!lift.lift.known) {
    return (
      <div className="alert alert-light border mb-0" role="status">
        <strong>No lift is reported.</strong>{' '}
        {/* The API's own sentence, which names WHICH read hit its cap. */}
        <span className="text-break">{safeText(lift.lift.reason)}</span>
      </div>
    );
  }
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    <p className="mb-0">
      <span className="fs-5 fw-semibold">{pct(lift.lift.point)}</span>
      {' '}
      <span className="text-muted">
        lift, with a {pct(lift.lift.low)} to {pct(lift.lift.high)} interval
      </span>
      <span className="small text-muted d-block">
        The interval is the finding, not the point. On arms this size a single
        conversion moves the estimate several points.
      </span>
    </p>
  );
}

function BrandCard({ brand, policyType }: { brand: BrandExperiment; policyType: string }) {
  return (
    <div className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span className="fw-semibold">Brand <code>{safeText(brand.brand_id)}</code></span>
        <span className="small text-muted">
          {brand.status === 'active'
            ? <>experiment <code>{safeText(brand.policy?.experiment_key)}</code></>
            : <span className="badge bg-secondary">{safeText(brand.status)}</span>}
        </span>
      </div>
      <div className="card-body">
        {brand.status !== 'active' || brand.lift === null ? (
          <div className={`alert ${brand.status === 'settings_invalid' ? 'alert-warning' : 'alert-light border'} mb-0`} role="status">
            {ABSENCE[brand.status] ?? `Nothing to measure (${safeText(brand.status)}).`}
            <span className="small text-muted d-block mt-1">
              The policy row this reads is <code>{safeText(policyType)}</code>.
            </span>
          </div>
        ) : (
          <>
            <p className="small text-muted">
              {Math.round((brand.policy?.control_share ?? 0) * 100)}% of candidates are held
              back as a control over {brand.lift.window_days} days. This read counts at most{' '}
              {brand.lift.max_arm_decisions} per arm.
            </p>
            <ul className="list-unstyled">
              <Arm name="Treatment" arm={brand.lift.treatment} minN={brand.lift.min_arm_n} />
              <Arm name="Control" arm={brand.lift.control} minN={brand.lift.min_arm_n} />
            </ul>
            <Lift lift={brand.lift} />
          </>
        )}
      </div>
    </div>
  );
}

export default function ExperimentsTab({ brandId }: { brandId?: string }) {
  const [windowDays, setWindowDays] = React.useState('30');
  const state = useGrowthJourneyData(
    () => listExperiments({ brand_id: brandId || undefined, window_days: Number(windowDays) }),
    `experiments:${brandId ?? ''}:${windowDays}`,
  );

  return (
    <section>
      <h2 className="h5 mb-3">Did withholding content change anything?</h2>
      <JourneyFilterBar
        right={(
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={state.reload}>
            Reload
          </button>
        )}
      >
        <JourneySelect
          label="Window"
          value={windowDays}
          options={WINDOWS}
          onChange={setWindowDays}
        />
      </JourneyFilterBar>

      <AsyncPanel state={state} onRetry={state.reload}>
        {(data) => (
          data.brands.length === 0 ? (
            <JourneyEmpty
              noun="brands with a holdout experiment"
              scope={data.scope}
              hint="No brand in your scope has a holdout policy, which means nothing is being withheld from anyone."
            />
          ) : (
            <>
              <p className="small text-muted">
                Window applied by the server: {data.window_days} days. A conversion here
                means one of{' '}
                {data.conversion_outcomes.map((o) => safeText(o)).join(', ')}.
              </p>
              {data.brands.map((brand) => (
                <BrandCard key={brand.brand_id} brand={brand} policyType={data.policy_type} />
              ))}
            </>
          )
        )}
      </AsyncPanel>
    </section>
  );
}
