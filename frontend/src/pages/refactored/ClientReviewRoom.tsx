import React, { useState } from 'react';
import DeliveryShell, { type DeliverySection } from './DeliveryShell';
import { Frame, Kpi, Measure, Note, Outcome, Panel } from './DeliveryPrimitives';

/**
 * ClientReviewRoom — the eight destinations of master plan §Gate 10.
 *
 * ## What this component is NOT allowed to be
 *
 * It is not the builder view with fields hidden. Every value it renders comes from the
 * client-shaped payload the server builds from `clientVisibility.CLIENT_FIELD_ALLOWLIST`;
 * there is no builder payload in this component's props to filter. That is the whole
 * control: a role check applied here would mean the private data had already crossed the
 * network, where anyone can read it in DevTools.
 *
 * The placeholder data below stands in for `GET /api/refactored/client/projects/:id` and
 * is deliberately shaped like the client projection — no risk level, no execution policy,
 * no builder authority, no story internals.
 *
 * ## Not yet verified
 *
 * This has never been rendered in a browser. §20 forbids deploying, and green CI is not
 * visual verification for a user-facing surface. It compiles and type-checks; that is a
 * different claim.
 */

const SECTIONS: readonly DeliverySection[] = [
  { key: 'overview', label: 'Overview', purpose: 'What this project is for and where it stands.' },
  { key: 'decisions', label: 'Decisions', purpose: 'What was decided, why, and what still needs your approval.' },
  { key: 'design', label: 'Design', purpose: 'What it will look like and how it will behave.' },
  { key: 'preview', label: 'Preview', purpose: 'The working thing, before it is released.' },
  { key: 'changes', label: 'Changes', purpose: 'What you asked to change, and what that would affect.' },
  { key: 'releases', label: 'Releases', purpose: 'What shipped, when, and what evidence supported it.' },
  { key: 'results', label: 'Results', purpose: 'What it achieved against what was promised.' },
  { key: 'documents', label: 'Documents', purpose: 'The artifacts you were given.' },
];

const DECISIONS = [
  { title: 'Arrivals refresh every 30s', type: 'Design', rationale: 'Balances freshness against data cost', status: 'approved' },
  { title: 'Accessibility approach', type: 'Design', rationale: 'Screen-reader announcements on arrival change', status: 'needs_you' },
  { title: 'Offline behaviour', type: 'Requirements', rationale: 'Last known arrivals shown with a timestamp', status: 'approved' },
  { title: 'Route colour scheme', type: 'Design', rationale: 'Superseded by the agency brand refresh', status: 'superseded' },
];

const DECISION_BADGE: Record<string, { cls: string; label: string }> = {
  approved: { cls: 'text-bg-success', label: 'Approved' },
  needs_you: { cls: 'text-bg-warning', label: 'Needs you' },
  superseded: { cls: 'text-bg-secondary', label: 'Superseded' },
};

const RELEASES = [
  { name: 'R3 — Arrivals board', date: '—', evidence: '8 of 8 checks', status: 'Awaiting your acceptance', cls: 'text-bg-warning' },
  { name: 'R2 — Route search', date: '12 Aug', evidence: '8 of 8 checks', status: 'Accepted', cls: 'text-bg-success' },
  { name: 'R1 — Foundations', date: '28 Jul', evidence: '6 of 6 checks', status: 'Accepted with exceptions', cls: 'text-bg-success' },
];

const DOCUMENTS = [
  { title: 'Accessibility conformance statement', kind: 'Compliance', published: '12 Aug' },
  { title: 'Data handling statement', kind: 'Compliance', published: '12 Aug' },
  { title: 'Release 2 notes', kind: 'Release', published: '12 Aug' },
  { title: 'Scope summary', kind: 'Scope', published: '28 Jul' },
];

const ClientReviewRoom: React.FC = () => {
  const [active, setActive] = useState('overview');

  return (
    <DeliveryShell
      audienceLabel="Client view"
      audienceTone="client"
      engagementName="Northgate Transit"
      projectName="Rider Information Portal"
      personName="Dana Whitfield"
      personRole="Client owner"
      sections={SECTIONS}
      activeKey={active}
      onSelect={setActive}
    >
      {active === 'overview' && (
        <>
          <div className="row row-cols-2 row-cols-md-4 g-3 mb-3">
            <Kpi value="3" label="Releases" />
            <Kpi value="2" label="Awaiting you" />
            <Kpi value="24" label="Delivered" />
            <Kpi value="Aug 30" label="Next review" />
          </div>
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <Panel title="Why this exists">
                <p className="small mb-0">
                  Riders cannot see real-time arrivals, so the call centre absorbs the demand. The
                  portal puts arrivals on the rider&apos;s phone and reduces call volume.
                </p>
              </Panel>
            </div>
            <div className="col-md-6">
              <Panel title="Needs your attention">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span className="badge text-bg-warning">Approval</span>
                  <span className="small">Accessibility approach for the arrivals board</span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge text-bg-warning">Approval</span>
                  <span className="small">Release 3 acceptance</span>
                </div>
              </Panel>
            </div>
          </div>
          <Note tone="safe">
            <b>What this screen cannot show.</b> Agent scratchpad, internal mentor notes, private
            builder assessment, secrets and engineering logs are not hidden by the browser — the
            server returns a different object. The allowlist is the control.
          </Note>
        </>
      )}

      {active === 'decisions' && (
        <>
          <div className="card border-0 shadow-sm mb-3">
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Decision</th>
                    <th>Type</th>
                    <th>Rationale</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DECISIONS.map((d) => (
                    <tr key={d.title}>
                      <td className="small fw-semibold">{d.title}</td>
                      <td className="small">{d.type}</td>
                      <td className="small text-muted">{d.rationale}</td>
                      <td>
                        <span className={`badge ${DECISION_BADGE[d.status].cls}`}>
                          {DECISION_BADGE[d.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Note>
            <b>Superseded, never overwritten.</b> A changed decision gets a successor row and keeps
            its original rationale, decider and date. An update in place would let the record claim
            you approved something you never saw.
          </Note>
        </>
      )}

      {active === 'design' && (
        <div className="row g-3">
          <div className="col-md-6">
            <Panel title="Arrivals board — option A">
              <Frame>Large type, one route per row</Frame>
              <div className="mt-2">
                <span className="badge text-bg-success">Approved</span>
              </div>
            </Panel>
          </div>
          <div className="col-md-6">
            <Panel title="Arrivals board — option B">
              <Frame>Map-led, routes as pins</Frame>
              <div className="mt-2">
                <span className="badge text-bg-secondary">Not chosen</span>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {active === 'preview' && (
        <Panel>
          <Frame caption="preview-r3.northgate.example">Live preview of release 3</Frame>
          <p className="small text-muted mb-0 mt-3">
            This exact preview reference is snapshotted onto your acceptance, so the record shows
            what you actually looked at.
          </p>
        </Panel>
      )}

      {active === 'changes' && (
        <>
          <Panel title="Add Spanish translations" className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-3">
              <span className="badge text-bg-warning">Impact assessed</span>
              <span className="small text-muted">Requested 21 Aug</span>
            </div>
            <Note>
              <b>Before this is built, here is what it touches.</b>
              <ul className="mb-0 mt-2 ps-3">
                <li>
                  This change reaches <b>4 other parts</b> of the project.
                </li>
                <li>
                  It affects work you have <b>already accepted</b>, which would need re-approval.
                </li>
                <li>
                  It affects something <b>already released and running</b>.
                </li>
              </ul>
            </Note>
            <div className="d-flex gap-2 mt-3">
              <button type="button" className="btn btn-success btn-sm">
                Approve for build
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm">
                Decline
              </button>
            </div>
          </Panel>
          <Note tone="safe">
            <b>There is no path from “submitted” straight to “build”.</b> The route runs through
            impact assessment as a property of the workflow, not a rule someone must remember.
          </Note>
        </>
      )}

      {active === 'releases' && (
        <>
          <div className="card border-0 shadow-sm mb-3">
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Release</th>
                    <th>Date</th>
                    <th>Evidence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {RELEASES.map((r) => (
                    <tr key={r.name}>
                      <td className="small fw-semibold">{r.name}</td>
                      <td className="small">{r.date}</td>
                      <td>
                        <span className="badge text-bg-success">{r.evidence}</span>
                      </td>
                      <td>
                        <span className={`badge ${r.cls}`}>{r.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <Panel title="Release 3 — evidence summary">
            <div className="row row-cols-2 row-cols-md-4 g-3">
              {['Accessibility', 'Security', 'Browser', 'Rollback tested'].map((dim) => (
                <div className="col" key={dim}>
                  <Outcome value="pass" />
                  <div className="small text-muted mt-1">{dim}</div>
                </div>
              ))}
            </div>
            <p className="small text-muted mb-0 mt-3">
              You are shown the conclusion and the shape of the proof — not our CI output.
            </p>
          </Panel>
        </>
      )}

      {active === 'results' && (
        <>
          <Panel className="mb-3">
            <Measure label="Call volume" value={-38} display="−38%" percent={62} />
            <Measure label="Rider satisfaction" value={21} display="+21" percent={74} />
            <Measure label="Arrivals accuracy" value={91} display="91%" percent={91} />
            {/* Not deployed, so this genuinely has no reading. */}
            <Measure label="Availability" value={null} />
          </Panel>
          <Note>
            <b>Measured, or it does not appear.</b> A metric with no reading shows as{' '}
            <i>not measured</i> rather than as a zero or a green bar.
          </Note>
        </>
      )}

      {active === 'documents' && (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover mb-0 align-middle">
              <thead className="table-light">
                <tr>
                  <th>Document</th>
                  <th>Kind</th>
                  <th>Published</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {DOCUMENTS.map((doc) => (
                  <tr key={doc.title}>
                    <td className="small fw-semibold">{doc.title}</td>
                    <td className="small">{doc.kind}</td>
                    <td className="small">{doc.published}</td>
                    <td className="text-end">
                      <button type="button" className="btn btn-outline-primary btn-sm">
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </DeliveryShell>
  );
};

export default ClientReviewRoom;
