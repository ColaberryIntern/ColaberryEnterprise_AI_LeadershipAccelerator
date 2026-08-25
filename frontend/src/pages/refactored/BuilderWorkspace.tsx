import React, { useState } from 'react';
import DeliveryShell, { type DeliverySection } from './DeliveryShell';
import { Frame, Kpi, Measure, Note, Outcome, Panel, Timeline } from './DeliveryPrimitives';

/**
 * BuilderWorkspace — the eight destinations of master plan §Gate 11.
 *
 * ## Mode is a support level, never a permission tier
 *
 * The mode chip is a label. Switching it changes how much the assistant explains and
 * nothing else — not what data loads, not what the builder may do. Gate 11's
 * `assertModeIsSupportOnly()` enforces that over the mode table, and this component keeps
 * faith with it: there is no `mode === 'learn'` branch anywhere below that hides a value or
 * disables an action. A UI that greyed things out in learn mode would turn a teaching aid
 * into a permission downgrade, which is the thing Gate 11 refuses.
 *
 * ## Three failures, drawn as three different things
 *
 * `Proof` renders *stale* evidence (pinned to an earlier commit), *not run* evidence and a
 * *fail* distinctly. Gate 9 blocks on all three, but a builder needs to know which one they
 * are looking at — re-running a scan, writing a missing test and fixing a defect are
 * different afternoons.
 *
 * ## Not yet verified
 *
 * Never rendered in a browser. §20 forbids deploying, and green CI is not visual
 * verification for a user-facing surface.
 */

const SECTIONS: readonly DeliverySection[] = [
  { key: 'command', label: 'Command', purpose: 'What needs attention right now, across every project you are on.' },
  { key: 'plan', label: 'Plan', purpose: 'Requirements, stories, and what they trace to.' },
  { key: 'design', label: 'Design', purpose: 'Design decisions and the visual contract.' },
  { key: 'build', label: 'Build', purpose: 'Execution runs, workspaces and pull requests.' },
  { key: 'agents', label: 'Agents', purpose: 'Agent definitions and their trust requirements.' },
  { key: 'proof', label: 'Proof', purpose: 'Evidence and the quality gate for each story and release.' },
  { key: 'release', label: 'Release', purpose: 'What is ready to ship and what is blocking it.' },
  { key: 'operate', label: 'Operate', purpose: 'What is running, and what it is doing in production.' },
];

const EXCEPTIONS = [
  { tone: 'text-bg-danger', label: 'Urgent', text: 'Security gate failing on story-114' },
  { tone: 'text-bg-success', label: 'Opportunity', text: 'Release 3 is ready and awaiting approval' },
  { tone: 'text-bg-warning', label: 'Watch', text: 'Carrying 5 concurrent stories (threshold 4)' },
];

const STORIES = [
  { title: 'Arrivals board renders live times', fulfils: 'REQ-004', risk: 'R2', status: 'Done', cls: 'text-bg-success' },
  { title: 'Screen-reader announcements', fulfils: 'REQ-011', risk: 'R2', status: 'In review', cls: 'text-bg-warning' },
  { title: 'Offline last-known arrivals', fulfils: 'REQ-007', risk: 'R1', status: 'Executing', cls: 'text-bg-info' },
  { title: 'Spanish translations', fulfils: null, risk: 'R2', status: 'Traceability gap', cls: 'text-bg-danger' },
];

const INPACT: Array<{ dim: string; score: number | null }> = [
  { dim: 'Intent', score: 5 },
  { dim: 'Neutrality', score: 4 },
  { dim: 'Provenance', score: null },
  { dim: 'Accountability', score: 5 },
  { dim: 'Control', score: 4 },
  { dim: 'Transparency', score: 5 },
];

const EVIDENCE: Array<{ dim: string; kind: string; sha: string | null; outcome: 'pass' | 'stale' | 'not_run' }> = [
  { dim: 'Unit tests', kind: 'test_run', sha: 'a1b2c3d', outcome: 'pass' },
  { dim: 'Integration', kind: 'test_run', sha: 'a1b2c3d', outcome: 'pass' },
  { dim: 'Browser', kind: 'browser_run', sha: 'a1b2c3d', outcome: 'pass' },
  { dim: 'Accessibility', kind: 'accessibility_scan', sha: '9f8e7d6', outcome: 'stale' },
  { dim: 'Security', kind: '—', sha: null, outcome: 'not_run' },
];

const RELEASE_CHECKS: Array<[string, boolean]> = [
  ['Stories complete', true],
  ['Requirements covered', true],
  ['Tests', true],
  ['Browser', true],
  ['Security', true],
  ['Accessibility', true],
  ['AI evals', true],
  ['Migration rehearsal', true],
  ['Rollback', true],
  ['Client acceptance', false],
];

const BuilderWorkspace: React.FC = () => {
  const [active, setActive] = useState('command');
  // A label only. Nothing below branches on it — see the header.
  const [mode, setMode] = useState<'learn' | 'delivery'>('learn');

  return (
    <DeliveryShell
      audienceLabel="Builder view"
      audienceTone="builder"
      engagementName="Northgate Transit"
      projectName="Rider Information Portal"
      personName="Sam Okafor"
      personRole="Builder"
      sections={SECTIONS}
      activeKey={active}
      onSelect={setActive}
      badge={
        <button
          type="button"
          className="badge text-bg-light border"
          onClick={() => setMode(mode === 'learn' ? 'delivery' : 'learn')}
          title="Mode changes how much the assistant explains. It never changes what you can see or do."
        >
          {mode === 'learn' ? 'Learn mode' : 'Delivery mode'}
        </button>
      }
    >
      {active === 'command' && (
        <>
          <div className="row row-cols-2 row-cols-md-4 g-3 mb-3">
            <Kpi value="3" label="Active projects" />
            <Kpi value="2" label="Blocked" />
            <Kpi value="5" label="Awaiting review" />
            <Kpi value="1" label="Release ready" />
          </div>
          <Panel title="Mentor exceptions" className="mb-3">
            {EXCEPTIONS.map((e) => (
              <div className="d-flex align-items-center gap-2 mb-2" key={e.text}>
                <span className={`badge ${e.tone}`}>{e.label}</span>
                <span className="small">{e.text}</span>
              </div>
            ))}
          </Panel>
          <Note tone="safe">
            <b>Two of the six exceptions fire on good news.</b> A mentor system that only surfaces
            failure teaches people to hide things — and misses the two moments a mentor is most
            useful: before a first client review, and when shipping becomes irreversible.
          </Note>
        </>
      )}

      {active === 'plan' && (
        <>
          <div className="card border-0 shadow-sm mb-3">
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Story</th>
                    <th>Fulfils</th>
                    <th>Risk</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {STORIES.map((s) => (
                    <tr key={s.title}>
                      <td className="small fw-semibold">{s.title}</td>
                      <td className="small">
                        {s.fulfils ? <code>{s.fulfils}</code> : <span className="text-muted">unmapped</span>}
                      </td>
                      <td>
                        <span className="badge text-bg-light border">{s.risk}</span>
                      </td>
                      <td>
                        <span className={`badge ${s.cls}`}>{s.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Note>
            <b>An unmapped story is shown as a gap, not hidden.</b> Work that traces to no
            requirement is the thing worth seeing.
          </Note>
        </>
      )}

      {active === 'design' && (
        <div className="row g-3">
          <div className="col-md-6">
            <Panel title="Decision — refresh interval">
              <p className="small mb-2">
                <b>Chosen:</b> 30 seconds.
              </p>
              <p className="small text-muted mb-2">
                Options considered: 10s (data cost), 30s, 60s (staleness complaints in pilot).
              </p>
              <span className="badge text-bg-success">Approved by client</span>
            </Panel>
          </div>
          <div className="col-md-6">
            <Panel title="Visual contract">
              <Frame>Reference vs implementation</Frame>
              <div className="mt-2">
                <span className="badge text-bg-success">Diff within tolerance</span>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {active === 'build' && (
        <>
          <Panel title="Run er-4471 — offline last-known arrivals" className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
              <span className="badge text-bg-info">Executing</span>
              <span className="small text-muted">
                GitHub-hosted runner · base <code>a1b2c3d</code> · 6m elapsed of 30m ceiling
              </span>
            </div>
            <Timeline
              items={[
                { title: <><b>Provisioned</b> workspace at pinned SHA</>, at: '12:02' },
                { title: <><b>Planned</b> 4 file changes</>, at: '12:03' },
                { title: <><b>Editing</b> <code>src/arrivals/cache.ts</code></>, at: '12:06' },
              ]}
            />
          </Panel>
          <Note>
            <b>The runner holds no production credentials.</b> Deploy, production database, DNS and
            live email are denied by the absence of anything to do them with.
          </Note>
        </>
      )}

      {active === 'agents' && (
        <Panel title="Arrivals summariser — INPACT coverage">
          {INPACT.map((d) => (
            <Measure
              key={d.dim}
              label={d.dim}
              value={d.score}
              display={d.score === null ? undefined : `${d.score}/6`}
              percent={d.score === null ? 0 : (d.score / 6) * 100}
            />
          ))}
          <Note>
            <b>Provenance is unscored, so this agent cannot go to production.</b> An unscored
            dimension is a failure, not a pass.
          </Note>
        </Panel>
      )}

      {active === 'proof' && (
        <>
          <div className="card border-0 shadow-sm mb-3">
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Dimension</th>
                    <th>Evidence</th>
                    <th>Pinned to</th>
                    <th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {EVIDENCE.map((e) => (
                    <tr key={e.dim}>
                      <td className="small fw-semibold">{e.dim}</td>
                      <td className="small">{e.kind}</td>
                      <td className="small">{e.sha ? <code>{e.sha}</code> : '—'}</td>
                      <td>
                        <Outcome value={e.outcome} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Note>
            <b>Two different failures, shown differently.</b> Evidence pinned to an older commit is
            not evidence about this one, and <i>not run</i> is never <i>pass</i>.
          </Note>
        </>
      )}

      {active === 'release' && (
        <>
          <Panel title="Release 3 — government profile, 10 mandatory checks" className="mb-3">
            <div className="row row-cols-1 row-cols-md-3 g-2">
              {RELEASE_CHECKS.map(([label, passed]) => (
                <div className="col d-flex align-items-center gap-2" key={label}>
                  <Outcome value={passed ? 'pass' : 'not_run'} />
                  <span className="small">{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <button type="button" className="btn btn-secondary btn-sm" disabled>
                Deploy
              </button>
              <span className="small text-muted ms-2">
                Refused unconditionally while master plan §20 stands.
              </span>
            </div>
          </Panel>
          <Note>
            <b>Ready is not the same as authorized.</b> Deployment is a code change with a review,
            never a configuration flag.
          </Note>
        </>
      )}

      {active === 'operate' && (
        <>
          <div className="row row-cols-2 row-cols-md-4 g-3 mb-3">
            <Kpi value="—" label="Availability" muted />
            <Kpi value="—" label="Errors" muted />
            <Kpi value="—" label="Latency" muted />
            <Kpi value="—" label="Cost" muted />
          </div>
          <Note>
            <b>Unknown, not healthy.</b> Nothing is deployed, so no signal has ever been read. A
            dashboard that renders green because no data arrived is the specific failure this screen
            is built to refuse.
          </Note>
          <Panel title="Candidates from production signals" className="mt-3">
            <p className="small text-muted mb-0">
              No candidates. A signal proposes a defect, optimization, requirement, tuning or
              architecture change — it never mutates production itself.
            </p>
          </Panel>
        </>
      )}
    </DeliveryShell>
  );
};

export default BuilderWorkspace;
