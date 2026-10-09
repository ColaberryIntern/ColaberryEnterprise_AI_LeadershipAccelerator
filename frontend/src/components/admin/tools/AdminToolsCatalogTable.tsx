import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../shell';
import type { ToolCatalogEntry } from '../../../services/agentEffectiveAccessApi';

interface Props {
  tools: ToolCatalogEntry[];
}

/**
 * AdminToolsCatalogTable — R204. One row per real tool, registered/granted/
 * usable shown as 3 separate, independently-readable badges per assigned
 * agent (T10's own spec: "show registered, configured, assigned, and usable
 * separately") — never collapsed into one status pill, since a tool can
 * genuinely be true on one and false on another (e.g. registered but not
 * usable under the live enforce mode).
 *
 * Fields T10's spec asks for that this real system has no data for today
 * (setup prerequisites, connection test, versions, configuration status in
 * the credentials sense) are not shown as blank or fabricated — they are
 * simply not part of this table, since nothing in this codebase tracks them
 * yet (confirmed by this phase's own discovery). Only "purpose"
 * (reads/produces), "assigned agents", and "registered/granted/usable" have
 * real data behind them.
 */
export default function AdminToolsCatalogTable({ tools }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (toolName: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  };

  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th scope="col" style={{ width: 28 }} />
            <th scope="col">Tool</th>
            <th scope="col">Purpose</th>
            <th scope="col">Assigned agents</th>
            <th scope="col">Documented</th>
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => {
            const isOpen = expanded.has(tool.toolName);
            return (
              <React.Fragment key={tool.toolName}>
                <tr role="button" onClick={() => toggle(tool.toolName)} style={{ cursor: 'pointer' }}>
                  <td className="text-muted">
                    <i className={`ri-arrow-${isOpen ? 'down' : 'right'}-s-line`} aria-hidden="true" />
                  </td>
                  <td>
                    <code className="small">{tool.toolName}</code>
                  </td>
                  <td className="small text-muted">
                    {tool.reads.length > 0 ? tool.reads[0] : <span className="fst-italic">No read description on file</span>}
                  </td>
                  <td>
                    {tool.assignedAgents.length === 0 ? (
                      <span className="text-muted small">None</span>
                    ) : (
                      <span className="small">{tool.assignedAgents.map((a) => a.agentName).join(', ')}</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge label={tool.documented ? 'documented' : 'undocumented'} tone={tool.documented ? 'success' : 'warning'} />
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={5} className="bg-light-subtle">
                      <div className="p-3">
                        {tool.reads.length > 0 && (
                          <div className="mb-2">
                            <strong className="small d-block">Reads</strong>
                            <ul className="small mb-0">
                              {tool.reads.map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {tool.produces.length > 0 && (
                          <div className="mb-2">
                            <strong className="small d-block">Produces</strong>
                            <ul className="small mb-0">
                              {tool.produces.map((p, i) => (
                                <li key={i}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {tool.assignedAgents.length === 0 ? (
                          <p className="small text-muted mb-0">No agent is granted this tool today.</p>
                        ) : (
                          <table className="table table-sm mb-0">
                            <thead>
                              <tr className="small text-muted">
                                <th scope="col">Agent</th>
                                <th scope="col">Registered</th>
                                <th scope="col">Granted via</th>
                                <th scope="col">Usable now</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tool.assignedAgents.map((a) => (
                                <tr key={a.agentId}>
                                  <td className="small">
                                    <Link to={`/admin/agents/${a.agentId}`}>{a.agentName}</Link>
                                  </td>
                                  <td>
                                    <StatusBadge label={a.registered ? 'registered' : 'not registered'} tone={a.registered ? 'success' : 'neutral'} />
                                  </td>
                                  <td className="small text-muted">{a.grantedVia.length > 0 ? a.grantedVia.join(', ') : '—'}</td>
                                  <td>
                                    <StatusBadge label={a.usable ? 'usable' : 'not usable'} tone={a.usable ? 'success' : 'warning'} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <p className="small text-muted mt-2 mb-0">
                          Credential references, when a tool depends on one, show only that a credential exists — never its value. This resolver never
                          fetches or transmits a raw secret.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
