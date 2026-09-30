import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CaseStudyMeasuredMetricsPanel from '../CaseStudyMeasuredMetricsPanel';
import type { MeasuredMetric, MetricRunReport } from '../../../../services/caseStudyMetricApi';

/**
 * The measurement panel.
 *
 * The assertions this file exists for:
 *
 *   A REFUSAL MUST NOT RENDER AS A FAILURE. When a run finds a figure a human
 *   published and leaves it alone, it did the right thing. Showing that as an
 *   error teaches an operator to read a working safeguard as a fault.
 *
 *   A FIGURE MUST BE JUDGEABLE BEFORE IT CAN BE APPROVED. The methodology and
 *   the limitations have to be reachable from the same card as the control, or
 *   the panel is asking someone to approve a number they cannot evaluate.
 *
 *   THE DECISION SENT MUST BE THE DECISION ON SCREEN. The controls are
 *   controlled inputs; an earlier version read them back out of the DOM at click
 *   time, which lets the two drift apart on any re-render.
 */

const metric = (over: Partial<MeasuredMetric> = {}): MeasuredMetric => ({
  metricKey: 'delivery_elapsed_days',
  label: 'Delivery elapsed time',
  valueDisplay: '181 days',
  numericValue: 181,
  unit: 'days',
  metricType: 'delivery',
  verificationClass: 'pending',
  verificationMethod: 'repo',
  publishable: false,
  isHeadline: false,
  verifiedBy: null,
  verifiedAt: null,
  hasEvidence: true,
  sample: '1 of 1 attached repositories.',
  methodology: 'Calendar days from the earliest repository creation date to the pinned commit.',
  baseline: null,
  limitations: ['Repository creation is not project start.'],
  ...over,
});

let container: HTMLDivElement;
let root: Root;
const onRun = jest.fn();
const onPromote = jest.fn();

function render(props: Partial<React.ComponentProps<typeof CaseStudyMeasuredMetricsPanel>> = {}): void {
  act(() => {
    root.render(
      <CaseStudyMeasuredMetricsPanel
        metrics={[metric()]}
        definitionKeys={['delivery_elapsed_days']}
        busy={false}
        lastRun={null}
        error={null}
        onRun={onRun}
        onPromote={onPromote}
        {...props}
      />
    );
  });
}

const byId = (id: string): HTMLElement =>
  container.querySelector(`[data-testid="${id}"]`) as HTMLElement;

const click = (el: Element | null): void => {
  act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onRun.mockClear();
  onPromote.mockClear();
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('CaseStudyMeasuredMetricsPanel', () => {
  it('shows the measured figure with its state', () => {
    render();
    const card = byId('cs-measured-delivery_elapsed_days');
    expect(card.textContent).toContain('181 days');
    expect(card.textContent).toContain('pending');
    expect(card.textContent).toContain('not publishable');
  });

  it('says plainly that nobody has verified it, and what that means', () => {
    render();
    // The panel's job is to make the gate legible, not just to show a flag.
    expect(byId('cs-measured-delivery_elapsed_days-who').textContent)
      .toContain('Nobody has verified this figure');
    expect(byId('cs-measured-delivery_elapsed_days-who').textContent)
      .toContain('no surface will show it');
  });

  it('names the missing evidence when a figure cannot be verified', () => {
    render({ metrics: [metric({ hasEvidence: false })] });
    expect(byId('cs-measured-delivery_elapsed_days-who').textContent)
      .toContain('cannot be marked verified');
  });

  it('credits the person once a figure has been verified', () => {
    render({
      metrics: [metric({
        verificationClass: 'verified', publishable: true,
        verifiedBy: 'ali@colaberry.com', verifiedAt: '2026-08-31T10:00:00Z',
      })],
    });
    const who = byId('cs-measured-delivery_elapsed_days-who').textContent ?? '';
    expect(who).toContain('ali@colaberry.com');
    expect(who).toContain('2026-08-31');
  });

  describe('making the figure judgeable', () => {
    it('hides the methodology until asked, then shows it with the limitations', () => {
      render();
      expect(container.querySelector('[data-testid="cs-measured-delivery_elapsed_days-detail"]'))
        .toBeNull();
      click(byId('cs-measured-delivery_elapsed_days-toggle'));
      const detail = byId('cs-measured-delivery_elapsed_days-detail').textContent ?? '';
      expect(detail).toContain('Calendar days');
      expect(detail).toContain('Repository creation is not project start');
      expect(detail).toContain('1 of 1 attached repositories');
    });

    it('explains an absent baseline rather than leaving a blank', () => {
      render();
      click(byId('cs-measured-delivery_elapsed_days-toggle'));
      // Null is a real answer for a level metric, and saying so beats an empty
      // field a reader has to interpret.
      expect(byId('cs-measured-delivery_elapsed_days-detail').textContent)
        .toContain('level metric with nothing to compare');
    });
  });

  describe('recording a decision', () => {
    it('sends exactly what the controls show', () => {
      render();
      const cls = byId('cs-measured-delivery_elapsed_days-class') as HTMLSelectElement;
      const pub = byId('cs-measured-delivery_elapsed_days-publishable') as HTMLInputElement;
      act(() => {
        cls.value = 'verified';
        cls.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // Click the checkbox rather than assigning `.checked` first: on a
      // controlled input, presetting it and then clicking toggles it straight
      // back off, which is how this assertion caught nothing on its first run.
      click(pub);
      click(byId('cs-measured-delivery_elapsed_days-save'));
      expect(onPromote).toHaveBeenCalledWith('delivery_elapsed_days', {
        verificationClass: 'verified',
        publishable: true,
        isHeadline: false,
      });
    });

    it('follows the server when the row comes back unchanged after a refusal', () => {
      render();
      const cls = byId('cs-measured-delivery_elapsed_days-class') as HTMLSelectElement;
      act(() => {
        cls.value = 'verified';
        cls.dispatchEvent(new Event('change', { bubbles: true }));
      });
      // The server refused, so the row is re-rendered with its original values.
      // The control must not keep showing a choice that was not accepted.
      render({ metrics: [metric()] });
      expect((byId('cs-measured-delivery_elapsed_days-class') as HTMLSelectElement).value)
        .toBe('pending');
    });

    it('tells the operator their name is recorded', () => {
      render();
      expect(byId('cs-measured-delivery_elapsed_days').textContent)
        .toContain('Your name is recorded');
    });
  });

  describe('the run report', () => {
    const report = (over: Partial<MetricRunReport> = {}): MetricRunReport => ({
      status: 'written',
      write: { status: 'written', created: true },
      repoStats: { attempted: 1, analysed: 1, unreadable: 0, pinnedDatesFetched: 0 },
      ...over,
    });

    it('reports a measurement, and how much it could read', () => {
      render({ lastRun: report({ repoStats: { attempted: 4, analysed: 3, unreadable: 1, pinnedDatesFetched: 0 } }) });
      const el = byId('cs-measured-runreport');
      expect(el.textContent).toContain('3 of 4');
      // The denominator has to disclose what was excluded, or the figure reads
      // as measured over everything.
      expect(el.textContent).toContain('1 unreadable and excluded');
      expect(el.className).toContain('alert-success');
    });

    it('renders a REFUSAL as a warning, never as an error', () => {
      render({
        lastRun: report({
          status: 'refused',
          write: { status: 'refused', reason: 'published_row', diverged: true, message: 'published at 11 and this run computed 40' },
        }),
      });
      const el = byId('cs-measured-runreport');
      expect(el.className).toContain('alert-warning');
      expect(el.className).not.toContain('alert-danger');
      expect(el.textContent).toContain('Left the published figure alone');
      expect(el.textContent).toContain('published at 11');
    });

    it('distinguishes a real error from a refusal', () => {
      render({ error: 'A self-report is not third-party verification.' });
      const el = byId('cs-measured-error');
      expect(el.className).toContain('alert-danger');
      expect(el.textContent).toContain('third-party verification');
    });
  });

  describe('running', () => {
    it('passes the chosen definition', () => {
      render({ definitionKeys: ['delivery_elapsed_days', 'automated_test_files'] });
      const sel = byId('cs-measured-definition') as HTMLSelectElement;
      act(() => {
        sel.value = 'automated_test_files';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      });
      click(byId('cs-measured-run'));
      expect(onRun).toHaveBeenCalledWith('automated_test_files');
    });

    it('disables the controls while a run is in flight', () => {
      render({ busy: true });
      expect((byId('cs-measured-run') as HTMLButtonElement).disabled).toBe(true);
      expect((byId('cs-measured-delivery_elapsed_days-save') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it('explains an empty record rather than showing a bare heading', () => {
    render({ metrics: [] });
    // An empty state and a failed load must not read the same; this one says
    // what a measurement would do.
    const empty = byId('cs-measured-empty').textContent ?? '';
    expect(empty).toContain('Nothing has been measured');
    expect(empty).toContain('unpublishable until someone verifies it');
  });
});
