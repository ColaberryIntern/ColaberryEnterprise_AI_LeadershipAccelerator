import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AsyncPanel, { type AsyncState } from '../AsyncPanel';
import SettingsTab from '../SettingsTab';
import type { ExplorerSummary } from '../../../services/explorerGrowthApi';

/**
 * The three states, and the tab that got them wrong.
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * `AsyncPanel` carries a non-negotiable — loading, empty and error must render
 * as three different things — and until now it shipped with no regression
 * protection at all. Verification flagged that, and flagged a live instance of
 * the very bug: `SettingsTab` took `summary.data` rather than the state, so
 * `null` meant both "loading" and "failed", and it rendered "No run has
 * recorded a mode yet" for all three cases.
 *
 * That is the failure this programme has shipped twice — an outage and an empty
 * result looking identical, with the calm reading the one that sticks. It landed
 * on the tab whose only job is saying whether the system is running.
 *
 * So these assertions are about DISTINGUISHABILITY, not appearance. Each state
 * must produce markup the others do not.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

interface Row {
  rows: number[];
}
const child = (d: Row) => <div>rendered {d.rows.length} rows</div>;

const state = (over: Partial<AsyncState<Row>>): AsyncState<Row> => ({
  loading: false,
  error: null,
  data: null,
  ...over,
});

describe('the three states are genuinely different markup', () => {
  const loading = html(<AsyncPanel state={state({ loading: true })}>{child}</AsyncPanel>);
  const failed = html(
    <AsyncPanel state={state({ error: new Error('connect ETIMEDOUT') })}>{child}</AsyncPanel>,
  );
  const empty = html(
    <AsyncPanel state={state({ data: { rows: [] } })} isEmpty={(d) => d.rows.length === 0} emptyMessage="No rows match.">
      {child}
    </AsyncPanel>,
  );
  const ok = html(
    <AsyncPanel state={state({ data: { rows: [1, 2, 3] } })} isEmpty={(d) => d.rows.length === 0}>
      {child}
    </AsyncPanel>,
  );

  it('renders four distinct outputs', () => {
    // The load-bearing assertion. If any two of these coincide, a reader cannot
    // tell the two situations apart — which is the whole defect.
    const all = [loading, failed, empty, ok];
    expect(new Set(all).size).toBe(4);
  });

  it('loading says it is loading and shows no data', () => {
    expect(loading).toContain('Loading');
    expect(loading).not.toContain('rendered');
  });

  it('a failure says the data is UNKNOWN rather than absent, and names the cause', () => {
    // "not missing, it is unknown" is the sentence that stops a reader
    // concluding the calm thing. The error's own message is included because a
    // generic "something went wrong" sends them looking for a missing record.
    expect(failed).toContain('not missing, it is unknown');
    expect(failed).toContain('connect ETIMEDOUT');
    expect(failed).toContain('alert-danger');
  });

  it('empty says it is empty, and does NOT look like a failure', () => {
    expect(empty).toContain('No rows match.');
    expect(empty).not.toContain('alert-danger');
    expect(empty).not.toContain('unknown');
  });

  it('success renders the child and none of the three notices', () => {
    expect(ok).toContain('rendered 3 rows');
    expect(ok).not.toContain('Loading');
    expect(ok).not.toContain('alert-danger');
  });

  it('treats an impossible state as a bug rather than an empty success', () => {
    // Not loading, no error, no data. Should be unreachable — and if it happens,
    // saying so beats rendering nothing, which would read as a clean empty.
    const impossible = html(<AsyncPanel state={state({})}>{child}</AsyncPanel>);
    expect(impossible).toContain('That is a bug, not an empty result');
  });

  it('offers a retry only when one was supplied', () => {
    const withRetry = html(
      <AsyncPanel state={state({ error: new Error('x') })} onRetry={() => {}}>
        {child}
      </AsyncPanel>,
    );
    expect(withRetry).toContain('Try again');
    expect(failed).not.toContain('Try again');
  });
});

describe('SettingsTab distinguishes the three states — the defect that was found', () => {
  const summary: ExplorerSummary = {
    decision_date: '2026-09-02',
    modes: ['shadow'],
    total: 153,
    waited: 11,
    actionable: 142,
    with_content: 130,
    executed: 0,
    gaps: 12,
    learners_with_profile: 153,
  };

  const at = (over: Partial<AsyncState<ExplorerSummary>>) =>
    html(<SettingsTab state={{ loading: false, error: null, data: null, ...over }} />);

  it('does not claim "no run yet" while the request is still in flight', () => {
    // The original bug, asserted directly. This is what shipped before
    // verification caught it.
    const loading = at({ loading: true });
    expect(loading).not.toContain('No run has recorded a mode yet');
    expect(loading).toContain('Loading');
  });

  it('does not claim "no run yet" when the request FAILED', () => {
    const failed = at({ error: new Error('Command Center read failed') });
    expect(failed).not.toContain('No run has recorded a mode yet');
    expect(failed).toContain('not missing, it is unknown');
    expect(failed).toContain('Command Center read failed');
  });

  it('says "no run yet" only for a genuine empty', () => {
    const empty = at({ data: { ...summary, modes: [] } });
    expect(empty).toContain('No run has recorded a mode yet');
    expect(empty).toContain('This request succeeded');
  });

  it('reports a non-sending mode as safe, and names it', () => {
    const ok = at({ data: summary });
    expect(ok).toContain('shadow');
    expect(ok).toContain('Nothing sends in this mode');
  });

  it('reports a sending mode as dangerous', () => {
    // `pilot`, `limited` and `full` can execute. That must not read the same as
    // shadow — it is the difference between a preview and real email to 153 people.
    const live = at({ data: { ...summary, modes: ['limited'] } });
    expect(live).toContain('can execute actions');
    expect(live).not.toContain('Nothing sends in this mode');
  });

  it('still states what the tab does not show, in every data state', () => {
    const ok = at({ data: summary });
    expect(ok).toContain('not served by any read endpoint');
    expect(ok).toContain('Mode switch');
  });
});
