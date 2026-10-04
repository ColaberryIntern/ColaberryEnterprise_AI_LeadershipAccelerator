import React from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, EmptyState } from '../shell';
import type { DriftFinding } from '../../../services/agentEffectiveAccessApi';

interface Props {
  findings: DriftFinding[];
}

/**
 * AdminToolsDriftSection — R205. One real, plain-English row per mismatch
 * the resolver found (or this phase's own prior discovery confirmed) across
 * the fleet's real authority sources — T09's own "inventory drift" ask.
 * Never a raw JSON dump; each row names the affected agent and links to
 * their own detail page where that resolves.
 */
export default function AdminToolsDriftSection({ findings }: Props) {
  return (
    <SectionCard
      title={`Inventory drift (${findings.length})`}
      subtitle="Real mismatches between what's declared and what's real, across every scattered authority source this fleet has today."
      className="mt-3"
    >
      {findings.length === 0 ? (
        <EmptyState icon="shield-check-line" title="No drift found" description="Every source this resolver reads agrees with every other, for every agent." tone="quiet" />
      ) : (
        <ul className="list-group list-group-flush">
          {findings.map((finding, i) => (
            <li key={i} className="list-group-item px-0">
              <div className="d-flex justify-content-between align-items-start gap-3">
                <p className="small mb-0">{finding.description}</p>
                {finding.agentId ? (
                  <Link to={`/admin/agents/${finding.agentId}`} className="small text-nowrap">
                    {finding.agentName}
                  </Link>
                ) : (
                  <span className="small text-nowrap text-muted">{finding.agentName}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
