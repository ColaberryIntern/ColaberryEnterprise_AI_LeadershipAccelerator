import React from 'react';
import type { ServicePage } from '../../config/v2ServicePages';

/**
 * ServiceVisualsV5 - the illustration each service page carries under "What it is",
 * as Ali's site model draws them:
 *
 *   Build  a mock custom application (an operations hub triaging exceptions),
 *   Guide  a workflow running across the systems a company already has, plus the
 *          twelve-month strip (training up front, guided building throughout),
 *   Train  the assigned Forward Deployed Engineer.
 *
 * All three are labelled illustrative in their own copy and carry no figures. They are
 * drawn in HTML, not images, so they stay sharp and follow the site's type.
 */

function BuildApp(): React.ReactElement {
  return (
    <div className="cbv2-appmock5" role="img" aria-label="Illustration of a custom application">
      <div className="cbv2-appmock5__b">
        <b>YC</b>
        <span>Your Company &middot; Operations Hub</span>
        <em>Custom-built &middot; illustrative</em>
      </div>
      <div className="cbv2-appmock5__g">
        <div className="cbv2-appmock5__nav">
          <span className="is-on">Exceptions queue</span>
          <span>Vendors</span>
          <span>Approvals</span>
          <span>Reports</span>
          <span>Settings</span>
        </div>
        <div className="cbv2-appmock5__main">
          <h5>Today&rsquo;s exceptions, triaged by AI</h5>
          <div className="cbv2-appmock5__cards">
            <div><small>Auto-resolved</small><strong>Routed</strong></div>
            <div><small>Needs review</small><strong>Your team</strong></div>
            <div><small>Escalated</small><strong>Manager</strong></div>
          </div>
          <div className="cbv2-appmock5__row" style={{ marginTop: 8 }}>
            <span>Order mismatch: vendor code format</span>
            <span className="cbv2-tag cbv2-tag--green">Resolved</span>
          </div>
          <div className="cbv2-appmock5__row">
            <span>Missing PO on high-value invoice</span>
            <span className="cbv2-tag cbv2-tag--amber5">Review</span>
          </div>
          <div className="cbv2-appmock5__row">
            <span>Duplicate shipment request</span>
            <span className="cbv2-tag cbv2-tag--navy5">Escalated</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideFlow(): React.ReactElement {
  return (
    <>
      <div className="cbv2-wf5" role="img" aria-label="Illustration of a workflow running across existing systems">
        <div className="cbv2-wf5__sys">
          <span>Your ERP</span>
          <span>Your CRM</span>
          <span>Email</span>
          <span>Shared drive</span>
          <span>Slack / Teams</span>
        </div>
        <div className="cbv2-wf5__flow">
          <div><small>Trigger</small>Invoice arrives by email</div>
          <div className="is-ai"><small>AI step</small>Read, match to PO in your ERP</div>
          <div><small>Rule</small>Over threshold? Ask a person in Teams</div>
          <div className="is-ok"><small>Done</small>Posted in your ERP, logged</div>
        </div>
        <p className="cbv2-wf5__note">
          Illustrative. No new tool to log into: the workflow connects the systems you already
          have.
        </p>
      </div>
      <div className="cbv2-months5" aria-label="Twelve-month cohort: training up front, guided building throughout">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} className={i < 3 ? 'is-t' : 'is-b'}>
            M{i + 1}
          </i>
        ))}
      </div>
      <div className="cbv2-months5__lg">
        <span><i className="is-t" />Training + first guided build</span>
        <span><i className="is-b" />Guided building, department by department</span>
      </div>
    </>
  );
}

function TrainFde(): React.ReactElement {
  return (
    <div className="cbv2-fde5">
      <div className="cbv2-fde5__av" aria-hidden="true">FDE</div>
      <div>
        <strong>Your assigned Forward Deployed Engineer</strong>
        <span>
          Enrolls your people, tracks their progress, and connects what they learn to your
          processes.
        </span>
      </div>
    </div>
  );
}

export default function ServiceVisualV5({ slug }: { slug: ServicePage['slug'] }): React.ReactElement {
  if (slug === 'build') return <BuildApp />;
  if (slug === 'guide') return <GuideFlow />;
  return <TrainFde />;
}
