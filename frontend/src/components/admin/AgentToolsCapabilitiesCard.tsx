import React from 'react';
import { SectionCard } from './shell';
import type { AgentDetailToolCapability } from '../../services/agentDetailApi';

// Extracted from AgentDetailPage.tsx (2026-08-26) — pure extraction, no
// behavior change — to keep that page under CLAUDE.md's 500-line hard
// ceiling while adding the new task-visibility sections alongside it.

interface AgentToolsCapabilitiesCardProps {
  byTool: AgentDetailToolCapability[];
}

export default function AgentToolsCapabilitiesCard({ byTool }: AgentToolsCapabilitiesCardProps) {
  return (
    <SectionCard
      title="Tools & capabilities"
      icon="tools-line"
      subtitle="What this agent is actually permitted to do today — not an aspirational list. Click a tool to see what it reads and produces."
    >
      {byTool.length > 0 ? (
        <div className="d-flex flex-column gap-2">
          {byTool.map((t) => (
            <details key={t.tool} className="border rounded p-2">
              <summary style={{ cursor: 'pointer' }}>
                <span className="badge bg-secondary-subtle text-secondary-emphasis me-2">
                  <i className="ri-checkbox-circle-line" aria-hidden="true" />
                </span>
                <code>{t.tool}</code>
                {!t.documented && (
                  <span className="badge bg-warning-subtle text-warning-emphasis ms-2">
                    <i className="ri-information-line" aria-hidden="true" /> undocumented
                  </span>
                )}
              </summary>
              <div className="mt-2 ps-4">
                {t.documented ? (
                  <div className="row g-3">
                    <div className="col-md-6">
                      <h6 className="text-uppercase text-muted small mb-1">Reads</h6>
                      {t.reads.length > 0 ? (
                        <ul className="list-unstyled mb-0 small">
                          {t.reads.map((r) => (
                            <li key={r} className="mb-1">
                              <i className="ri-eye-line text-info me-1" aria-hidden="true" />{r}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted small mb-0">Doesn't read an external data source.</p>
                      )}
                    </div>
                    <div className="col-md-6">
                      <h6 className="text-uppercase text-muted small mb-1">Produces</h6>
                      {t.produces.length > 0 ? (
                        <ul className="list-unstyled mb-0 small">
                          {t.produces.map((p) => (
                            <li key={p} className="mb-1">
                              <i className="ri-add-circle-line text-success me-1" aria-hidden="true" />{p}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-muted small mb-0">Doesn't produce anything on its own.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted small mb-0">
                    <i className="ri-information-line" aria-hidden="true" /> No documented reads/produces yet for this tool — disclosed honestly rather than guessed.
                  </p>
                )}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="text-muted mb-0">No tools recorded.</p>
      )}
    </SectionCard>
  );
}
