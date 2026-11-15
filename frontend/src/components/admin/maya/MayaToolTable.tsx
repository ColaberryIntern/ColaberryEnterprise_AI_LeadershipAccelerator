import React from 'react';
import { StatusBadge } from '../shell';
import type { MayaToolRow } from '../../../services/mayaConsoleApi';

/**
 * Both of Maya's tool belts in one table, with the two facts that are easy to confuse.
 *
 *   REGISTERED means a handler for that exact name is compiled into the backend. A grant of a
 *   name nothing implements reads as success and changes nothing an agent can do, which is why
 *   the grant gate refuses it.
 *
 *   GRANTED means the name is in her `tools_granted` column. Until 13 Nov 2026 this table would
 *   have been all falses in the first column and that was the real cause of zero grants across
 *   all 31 agents: `registeredToolNames()` had never heard of her tools, so every grant refused
 *   `tool_not_registered`.
 *
 * The effect class is shown because it is what decides whether a tool can reach a person at all:
 * `read` and `internal` never do, `outbound` always does, and `transactional_receipt` is the one
 * declared exception that sends without a per-message approval.
 */

const EFFECT_TONE: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  read: 'neutral',
  internal: 'info',
  transactional_receipt: 'warning',
  outbound: 'danger',
};

export default function MayaToolTable({ rows }: { rows: MayaToolRow[] }): React.ReactElement {
  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover align-middle mb-0">
        <thead className="table-light">
          <tr>
            <th scope="col">Tool</th>
            <th scope="col">Belt</th>
            <th scope="col">Capability</th>
            <th scope="col">Reaches a person?</th>
            <th scope="col">Registered</th>
            <th scope="col">Granted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tool}>
              <td className="font-monospace small">{row.tool}</td>
              <td className="small text-muted">{row.belts.join(' + ')}</td>
              <td className="font-monospace small">{row.capability}</td>
              <td>
                <StatusBadge
                  label={row.effect_class.replace(/_/g, ' ')}
                  tone={EFFECT_TONE[row.effect_class] ?? 'neutral'}
                />
              </td>
              <td>
                {row.registered
                  ? <StatusBadge label="yes" tone="success" />
                  : <StatusBadge label="no handler" tone="danger" />}
              </td>
              <td>
                {row.granted
                  ? <StatusBadge label="granted" tone="success" />
                  // "held without a grant" is the phrase the Agent Tools tab already uses for
                  // this exact state, kept verbatim so the two screens agree.
                  : <StatusBadge label="no grant" tone="warning" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
