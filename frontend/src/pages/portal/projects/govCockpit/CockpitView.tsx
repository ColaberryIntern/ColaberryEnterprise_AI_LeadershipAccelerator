import React, { useMemo, useState } from 'react';
import type { StudentGovProjectView, GovProposalDocument } from '../../../../services/govProjectPortalApi';
import { parseDeadline, countdownTo, formatCountdown, dossierDeadlineIso } from '../../../admin/govDeadline';
import BuildReleases from './BuildReleases';
import ProposalDocuments from './ProposalDocuments';
import ProposalDocumentDrawer from './ProposalDocumentDrawer';
import CommitFeed from './CommitFeed';
import HowItWorks from './HowItWorks';
import ProjectOverview from './ProjectOverview';
import CopilotRail from './CopilotRail';
import './govCockpit.css';

/**
 * CockpitView (v2) — the Build Cockpit shell, now TWO clear workstreams. The intern owns the whole project, so there
 * is no per-story assignment here: the BUILD tab shows the real releases → stories (summary + deep-link), and the
 * PROPOSAL tab shows the named documents the AI drafts and a reviewer accepts. The project bar shows the overall %
 * (verified build stories + accepted documents), the agency and the close countdown. The copilot rail is grounded in
 * the same student-safe projection. All data comes from one projection; this only arranges it + holds view state.
 */
type Tab = 'overview' | 'build' | 'proposal' | 'commits' | 'how';

export default function CockpitView(
  { view, projectId, onReload }: { view: StudentGovProjectView; projectId: string; onReload: () => void },
): React.ReactElement {
  const [tab, setTab] = useState<Tab>('overview');
  const [openDocKey, setOpenDocKey] = useState<string | null>(null);

  const docs = useMemo(() => view.proposalDocuments ?? [], [view.proposalDocuments]);
  const feed = view.commitFeed ?? [];
  const progress = view.overallProgress ?? { buildVerified: 0, buildTotal: 0, docsAccepted: 0, docsTotal: 0, pct: 0 };
  const openDoc: GovProposalDocument | null = openDocKey ? docs.find((d) => d.key === openDocKey) ?? null : null;
  const docsNeedReview = docs.filter((d) => d.status === 'drafted').length;

  const closeIso = dossierDeadlineIso(view.keyDates ?? []);
  const parsed = parseDeadline(closeIso);
  const countdown = parsed ? formatCountdown(countdownTo(parsed.ms, Date.now()), parsed.hasTime) : null;

  const greeting = (progress.docsAccepted + progress.buildVerified) === 0
    ? 'Start the build in the workspace, and draft the proposal documents here. Ask me what to do next.'
    : `${progress.buildVerified}/${progress.buildTotal} build stories verified and ${progress.docsAccepted}/${progress.docsTotal} documents accepted. Ask me what to do next, or what's at risk.`;

  const donePct = progress.pct;

  return (
    <div className="gck">
      <header className="gck-bar">
        <div>
          <span className="gck-eyebrow">Gov project &middot; Build + Proposal</span>
          <h1>{view.name}</h1>
        </div>
        <div className="gck-meta">
          {view.agency && <span className="gck-chip">Agency <b>{view.agency}</b></span>}
          {closeIso && <span className="gck-chip">Closes <b className="gck-num">{closeIso}</b>{countdown ? <> &middot; <b className="gck-num">{countdown}</b></> : null}</span>}
          <span className="gck-chip"><span className="gck-dot" aria-hidden="true" />GitHub sync <b>live</b></span>
        </div>
      </header>

      <section className="gck-summary" aria-label="Progress summary">
        <div className="gck-panel">
          <div className="gck-prog-label"><span className="gck-eyebrow">Overall completion</span><span className="gck-big gck-num">{donePct}%</span></div>
          <div className="gck-track">
            {progress.buildVerified > 0 && <span style={{ width: `${(progress.buildVerified / Math.max(1, progress.buildTotal + progress.docsTotal)) * 100}%`, background: 'var(--ai)' }} title="verified build stories" />}
            {progress.docsAccepted > 0 && <span style={{ width: `${(progress.docsAccepted / Math.max(1, progress.buildTotal + progress.docsTotal)) * 100}%`, background: 'var(--ok)' }} title="accepted documents" />}
          </div>
          <div className="gck-legend">
            <span><i style={{ background: 'var(--ai)' }} />Build stories verified</span>
            <span><i style={{ background: 'var(--ok)' }} />Documents accepted</span>
            <span><i style={{ background: 'var(--line)' }} />Remaining</span>
          </div>
        </div>
        <div className="gck-panel gck-stat"><div className="k">Build stories</div><div className="v gck-num">{progress.buildVerified}/{progress.buildTotal}</div><div className="s">verified from commits</div></div>
        <div className="gck-panel gck-stat"><div className="k">Proposal documents</div><div className="v gck-num">{progress.docsAccepted}/{progress.docsTotal}</div><div className="s">accepted</div></div>
        <div className="gck-panel gck-stat"><div className="k">Documents to review</div><div className="v gck-num" style={{ color: docsNeedReview ? 'var(--warn)' : undefined }}>{docsNeedReview}</div><div className="s">drafted, awaiting a decision</div></div>
      </section>

      <nav className="gck-tabs" role="tablist">
        <button className="gck-tab" role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button>
        <button className="gck-tab" role="tab" aria-selected={tab === 'build'} onClick={() => setTab('build')}>Build</button>
        <button className="gck-tab" role="tab" aria-selected={tab === 'proposal'} onClick={() => setTab('proposal')}>Proposal<span className="n">{docs.length}</span></button>
        <button className="gck-tab" role="tab" aria-selected={tab === 'commits'} onClick={() => setTab('commits')}>Commit sync<span className="n">{feed.length}</span></button>
        <button className="gck-tab" role="tab" aria-selected={tab === 'how'} onClick={() => setTab('how')}>How it works</button>
      </nav>

      <div className="gck-main">
        <div style={{ minWidth: 0 }}>
          {tab === 'overview' && <ProjectOverview view={view} />}
          {tab === 'build' && <BuildReleases summary={view.buildSummary} />}
          {tab === 'proposal' && <ProposalDocuments docs={docs} onOpen={(d) => setOpenDocKey(d.key)} />}
          {tab === 'commits' && <CommitFeed feed={feed} />}
          {tab === 'how' && <HowItWorks />}
        </div>
        <CopilotRail projectId={projectId} greeting={greeting} />
      </div>

      {openDoc && <ProposalDocumentDrawer doc={openDoc} projectId={projectId} canVerify={view.viewerCanVerify} onReload={onReload} onClose={() => setOpenDocKey(null)} />}
    </div>
  );
}
