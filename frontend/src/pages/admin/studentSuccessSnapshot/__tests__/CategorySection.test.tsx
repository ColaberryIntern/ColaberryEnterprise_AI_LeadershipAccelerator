import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CategorySection from '../fieldStatus';
import { SnapshotField } from '../../../../services/studentSuccessSnapshotApi';

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactElement) {
  await act(async () => { root.render(node); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

function field<T>(overrides: Partial<SnapshotField<T>>): SnapshotField<T> {
  return {
    value: null, status: 'known', sourceSystem: 'x', sourceRecordIds: [], observedAt: null,
    freshnessPolicy: 'n/a', reliabilityState: 'healthy', ...overrides,
  };
}

describe('CategorySection', () => {
  it('happy path: a known field renders via renderKnown, not the honest-message fallback', async () => {
    await render(
      <CategorySection
        title="Attendance"
        icon="calendar-check-line"
        field={field<{ pct: number }>({ status: 'known', value: { pct: 80 } })}
        renderKnown={(v) => <div data-testid="known">{v.pct}%</div>}
      />,
    );
    expect(container.textContent).toContain('80%');
    expect(container.textContent).not.toContain('could not be read');
  });

  it('honesty boundary: an unknown field never calls renderKnown, shows the honest message instead', async () => {
    let called = false;
    await render(
      <CategorySection
        title="Attendance"
        icon="calendar-check-line"
        field={field<{ pct: number }>({ status: 'unknown', value: null, reliabilityReason: 'Query timed out.' })}
        renderKnown={() => { called = true; return null; }}
      />,
    );
    expect(called).toBe(false);
    expect(container.textContent).toContain('could not be read');
    expect(container.textContent).toContain('Query timed out.');
  });

  it('honesty boundary: a quarantined field shows the quarantine message, not a stale real value', async () => {
    await render(
      <CategorySection
        title="Attendance"
        icon="calendar-check-line"
        field={field<{ pct: number }>({ status: 'quarantined', value: null, reliabilityReason: 'Attendance is broken.' })}
        renderKnown={() => <div>should not render</div>}
      />,
    );
    expect(container.textContent).toContain('quarantined');
    expect(container.textContent).not.toContain('should not render');
  });
});
