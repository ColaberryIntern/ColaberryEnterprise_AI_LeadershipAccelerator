import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ExperimentsTab from '../ExperimentsTab';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type {
  BrandExperiment, ExperimentsResponse, ArmLift,
} from '../../../services/growthJourneyQueueApi';

/**
 * Holdout lift (Phase 6, T615).
 *
 * ── THE TYPE MAKES A FABRICATED NUMBER IMPOSSIBLE; THESE CELLS KEEP IT SO ───
 *
 * `lift` is `{ known: true; point; low; high } | { known: false; reason }`. The
 * backend chose that over `number | null` for a stated reason: "`number | null`
 * invites `?? 0` and `|| 1`, which is precisely how a fabricated benchmark gets
 * created." An unknown lift has no `point` property to render by accident.
 *
 * So the mutations worth guarding are the ones that would reintroduce the number:
 * rendering `0%` for an unknown lift, showing a point without its interval, or
 * collapsing the four reasons-there-is-nothing-to-measure into one.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyQueueApi', () => ({
  listExperiments: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyQueueApi') as { listExperiments: jest.Mock };

const lift = (over: Partial<ArmLift> = {}): ArmLift => ({
  experiment_key: 'capability_education_holdout',
  window_days: 30,
  treatment: { n: 120, converted: 18, capped: false },
  control: { n: 40, converted: 4, capped: false },
  lift: { known: true, point: 0.05, low: -0.01, high: 0.12 },
  min_arm_n: 30,
  capped: false,
  max_arm_decisions: 5000,
  ...over,
});

const active = (over: Partial<BrandExperiment> = {}): BrandExperiment => ({
  brand_id: 'b-1',
  status: 'active',
  policy: { experiment_key: 'capability_education_holdout', control_share: 0.25, candidate_types: ['capability_education'] },
  lift: lift(),
  ...over,
});

const page = (over: Partial<ExperimentsResponse> = {}): ExperimentsResponse => ({
  brands: [active()],
  window_days: 30,
  policy_type: 'holdout',
  conversion_outcomes: ['enrolled', 'meeting_booked'],
  scope: { tenant_id: 't-1', brand_id: 'b-1', program_id: null },
  ...over,
});

let container: HTMLDivElement;
let root: Root;
const render = async (props: { brandId?: string } = {}) => {
  await act(async () => { root.render(<ExperimentsTab {...props} />); });
};
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.listExperiments.mockResolvedValue(page());
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('a known lift always shows its interval', () => {
  // KILLS: rendering `point` alone. On arms of 40 a single conversion moves the
  // estimate several points, so a bare 5.0% is a precision claim the sample cannot
  // support.
  it('renders the point and the low-high bounds', async () => {
    await render();
    expect(text()).toContain('5.0%');
    expect(text()).toContain('-1.0%');
    expect(text()).toContain('12.0%');
    expect(text()).toContain('interval is the finding, not the point');
  });

  it('a different lift proves the numbers are read, not printed', async () => {
    api.listExperiments.mockResolvedValue(page({
      brands: [active({ lift: lift({ lift: { known: true, point: 0.2, low: 0.11, high: 0.29 } }) })],
    }));
    await render();
    expect(text()).toContain('20.0%');
    expect(text()).toContain('11.0%');
    expect(text()).toContain('29.0%');
  });
});

describe('an UNKNOWN lift is never a number', () => {
  // KILLS: `lift.point ?? 0`, or any `0%` on an unknown. The union has no `point`
  // when unknown, so this is about not inventing one.
  it('renders the API reason and no percentage at all', async () => {
    api.listExperiments.mockResolvedValue(page({
      brands: [active({
        lift: lift({
          capped: true,
          treatment: { n: 5000, converted: null, capped: true },
          lift: { known: false, reason: 'arm_capped:treatment: treatment n=5000, control n=400, this read counts at most 5000 per arm - narrow the window' },
        }),
      })],
    }));
    await render();
    expect(text()).toContain('No lift is reported');
    expect(text()).toContain('narrow the window');
    expect(text()).toContain('arm_capped:treatment');
    // the only percentages on screen are the control share, never a lift
    expect(text()).not.toContain('0.0%');
  });

  it('says an uncounted arm was NOT counted rather than showing zero conversions', async () => {
    // "nobody in the treatment arm converted" is a finding. This read declined to
    // look, which is not that.
    api.listExperiments.mockResolvedValue(page({
      brands: [active({
        lift: lift({
          treatment: { n: 5000, converted: null, capped: true },
          lift: { known: false, reason: 'conversions_over_cap: narrow the window' },
        }),
      })],
    }));
    await render();
    expect(text()).toContain('conversions not counted');
    expect(text()).toContain('arm hit its cap');
  });

  it('says how far an arm is below the floor when it is simply too small', async () => {
    api.listExperiments.mockResolvedValue(page({
      brands: [active({
        lift: lift({
          control: { n: 11, converted: 1, capped: false },
          lift: { known: false, reason: 'control arm below the minimum' },
        }),
      })],
    }));
    await render();
    expect(text()).toContain('below the floor of 30');
    expect(text()).toContain('19 short');
  });
});

describe('the four reasons there is nothing to measure stay distinct', () => {
  // KILLS: collapsing them into "no data". Only ONE of the four needs a human, and
  // collapsing hides it behind the three that do not.
  it.each([
    ['no_policy', 'nothing is being withheld'],
    ['not_active', 'is not active'],
    ['settings_invalid', 'needs a human'],
    ['lookup_failed', 'fails closed'],
  ])('%s says something specific', async (status, phrase) => {
    api.listExperiments.mockResolvedValue(page({
      brands: [{ brand_id: 'b-1', status: status as BrandExperiment['status'], policy: null, lift: null }],
    }));
    await render();
    expect(text()).toContain(phrase);
  });

  it('flags settings_invalid as a warning, unlike the other three', async () => {
    api.listExperiments.mockResolvedValue(page({
      brands: [{ brand_id: 'b-1', status: 'settings_invalid', policy: null, lift: null }],
    }));
    await render();
    expect(container.querySelector('.alert-warning')).not.toBeNull();
  });

  it('does not flag no_policy as a warning, because nothing is wrong', async () => {
    api.listExperiments.mockResolvedValue(page({
      brands: [{ brand_id: 'b-1', status: 'no_policy', policy: null, lift: null }],
    }));
    await render();
    expect(container.querySelector('.alert-warning')).toBeNull();
  });
});

describe('the context an operator needs to read the number', () => {
  it('states the control share, the window the server applied and what counts as a conversion', async () => {
    await render();
    expect(text()).toContain('25% of candidates are held');
    expect(text()).toContain('Window applied by the server: 30 days');
    expect(text()).toContain('enrolled, meeting_booked');
  });

  it('reports a DIFFERENT server window rather than the request', async () => {
    api.listExperiments.mockResolvedValue(page({ window_days: 90 }));
    await render();
    expect(text()).toContain('Window applied by the server: 90 days');
  });

  it('says an empty brand list means nothing is being withheld from anyone', async () => {
    api.listExperiments.mockResolvedValue(page({ brands: [] }));
    await render();
    expect(text()).toContain('No brands with a holdout experiment in scope');
    expect(text()).toContain('nothing is being withheld from anyone');
  });

  it('a failed read says so rather than rendering an empty experiment', async () => {
    api.listExperiments.mockRejectedValue(new Error('experiments exploded'));
    await render();
    expect(text()).toContain('experiments exploded');
  });

  /*
   * The brand boundary on THIS tab's read. The attempt-3 verifier dropped `brand_id`
   * from `listExperiments` and every cell here stayed green, so the tab would have gone
   * on showing another brand's holdout results with the brand selector set - and lift
   * numbers from the wrong brand are worse than no numbers, because they are plausible.
   * The sibling gap on `getRates`/`getMetrics` is closed in PerformanceTab.test.tsx.
   */
  it('scopes the read to the brand it was given', async () => {
    await render({ brandId: 'b-9' });
    expect(api.listExperiments).toHaveBeenCalledWith(
      expect.objectContaining({ brand_id: 'b-9' }),
    );
  });

  it('and sends no brand at all when given none, rather than a literal "undefined"', async () => {
    await render();
    expect(api.listExperiments).toHaveBeenCalledWith(
      expect.objectContaining({ brand_id: undefined }),
    );
  });
});

describe('the mechanical accessibility rules', () => {
  it('pass with a measured lift', async () => {
    await render();
    expectNoA11yViolations(container);
  });

  it('pass with every absence state', async () => {
    api.listExperiments.mockResolvedValue(page({
      brands: [
        { brand_id: 'b-1', status: 'no_policy', policy: null, lift: null },
        { brand_id: 'b-2', status: 'settings_invalid', policy: null, lift: null },
      ],
    }));
    await render();
    expectNoA11yViolations(container);
  });
});
