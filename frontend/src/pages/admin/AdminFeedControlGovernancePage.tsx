import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { PageHeader, SectionCard } from '../../components/admin/shell';

/**
 * AdminFeedControlGovernancePage — CAPE Phase 6 (design doc §12, §16 Phase 6).
 * The full Feed Control governance board: skill coverage heatmap, learner-stage
 * (lifecycle-mode) policies, pacing controls, and the explanation simulator.
 *
 * Standalone route rather than a `FeedControlTab.tsx` addition — logged as
 * execution-contract.md Assumption 1: `FeedControlTab.tsx` is already 536
 * lines (CLAUDE.md's Modular Composition Rule hard-ceilings a file at 500),
 * so 4 more large panels there would blow past it immediately. This page is
 * linked FROM `FeedControlTab.tsx` for discoverability, and its own
 * Explanation Simulator panel reuses the EXISTING
 * `GET /api/admin/feed-control/simulate` endpoint rather than duplicating it.
 *
 * Reading/simulating on this page never mutates production ranking — only an
 * explicit admin "Save" action on the Learner-Stage Policies or Pacing
 * Controls panels does, and every such save is versioned (per
 * execution-contract.md's overall success criteria).
 *
 * Panels are built as separate components (T011-T014) and rendered here by
 * section — keeps this shell's own diff small and each panel file under the
 * repo's file-size soft target.
 */

type GovernanceSection = 'heatmap' | 'policies' | 'pacing' | 'simulator';

const SECTIONS: Array<{ id: GovernanceSection; label: string }> = [
  { id: 'heatmap', label: 'Skill Coverage Heatmap' },
  { id: 'policies', label: 'Learner-Stage Policies' },
  { id: 'pacing', label: 'Pacing Controls' },
  { id: 'simulator', label: 'Explanation Simulator' },
];

// Panel components land here as T011-T014 each replace their own placeholder.
// Kept as lazy-safe plain imports (no code-splitting complexity needed for an
// admin-only, low-traffic page) — same convention as AdminOrchestrationPage's
// tab component imports.
import SkillCoverageHeatmap from './governance/SkillCoverageHeatmap';
import LearnerStagePolicies from './governance/LearnerStagePolicies';
import PacingControls from './governance/PacingControls';
import ExplanationSimulator from './governance/ExplanationSimulator';

const AdminFeedControlGovernancePage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const urlSection = params.get('section');
  const [activeSection, setActiveSection] = useState<GovernanceSection>(
    (urlSection && SECTIONS.some((s) => s.id === urlSection) ? urlSection : 'heatmap') as GovernanceSection
  );

  const selectSection = (id: GovernanceSection) => {
    setActiveSection(id);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('section', id);
      return next;
    });
  };

  return (
    <div className="admin-page">
      <PageHeader
        title="Feed Control Governance"
        subtitle="Skill coverage, learner-stage policies, pacing controls, and the explanation simulator — extends the Feed Control board. Reading and simulating never changes what students see; only an explicit Save does, and every save is versioned."
        icon="shield-star-line"
      />

      <div className="mb-3">
        <Link to="/admin/orchestration?tab=feed-control" className="text-decoration-none">
          &larr; Back to Feed Control board
        </Link>
      </div>

      <ul className="nav nav-tabs mb-3" role="tablist">
        {SECTIONS.map((s) => (
          <li className="nav-item" key={s.id} role="presentation">
            <button
              type="button"
              className={`nav-link ${activeSection === s.id ? 'active' : ''}`}
              onClick={() => selectSection(s.id)}
              aria-current={activeSection === s.id ? 'page' : undefined}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>

      {activeSection === 'heatmap' && <SkillCoverageHeatmap />}
      {activeSection === 'policies' && <LearnerStagePolicies />}
      {activeSection === 'pacing' && <PacingControls />}
      {activeSection === 'simulator' && <ExplanationSimulator />}
    </div>
  );
};

export default AdminFeedControlGovernancePage;
