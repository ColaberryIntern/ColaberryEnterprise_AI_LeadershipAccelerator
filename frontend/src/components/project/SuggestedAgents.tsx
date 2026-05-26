/**
 * SuggestedAgents — inline import-graph agent suggestions for one BP.
 *
 * Plan C of the agent-discovery rebuild. Renders inside BPDetailV2 right
 * below AgentsSection. Pulls D3 suggestions for THIS cap (filtered to
 * unmapped agents whose imports reference this cap's files). Each
 * suggestion shows agent name, score, evidence count, with a one-click
 * Attach button. On success, the chip flips to "Attached" and the parent
 * `onUpdate` callback reloads the cap so the agent appears in the
 * Confirmed list.
 *
 * Renders NOTHING when there are no suggestions — keeps the BP detail
 * visually clean for fully-covered caps. Cache TTL is 5 min on the
 * backend, so cap switches inside that window are instant.
 */
import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

interface Suggestion {
  agentName: string;
  sourcePath: string;
  score: number;
  evidence: string[];
  nameStemBoost: boolean;
}

interface Props {
  capId: string;
  onUpdate: () => void;
}

type AttachState = 'idle' | 'attaching' | 'attached' | 'error';
interface RowState { status: AttachState; message?: string; }

const SuggestedAgents: React.FC<Props> = ({ capId, onUpdate }) => {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    portalApi.get(`/api/portal/project/capabilities/${encodeURIComponent(capId)}/agent-suggestions`)
      .then(res => {
        if (active) setSuggestions(res.data?.suggestions || []);
      })
      .catch(() => { if (active) setSuggestions([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [capId]);

  const attach = async (s: Suggestion) => {
    setRowStates(rs => ({ ...rs, [s.agentName]: { status: 'attaching' } }));
    try {
      await portalApi.post(
        `/api/portal/project/capabilities/${encodeURIComponent(capId)}/agents/${encodeURIComponent(s.agentName)}/attach`,
        {},
      );
      setRowStates(rs => ({ ...rs, [s.agentName]: { status: 'attached', message: 'Attached' } }));
      // Refresh the parent so the agent shows in AgentsSection's Confirmed list.
      onUpdate();
    } catch (err: any) {
      setRowStates(rs => ({
        ...rs,
        [s.agentName]: { status: 'error', message: err?.response?.data?.error || 'Attach failed' },
      }));
    }
  };

  // Render nothing while loading or if there are no suggestions — keeps
  // the BP detail clean for fully-covered caps.
  if (loading || suggestions.length === 0) return null;

  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <div style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--color-text-light)', fontWeight: 600, marginBottom: '0.65rem',
      }}>
        Suggested agents — {suggestions.length} from import-graph evidence
      </div>
      <div style={{
        padding: '0.85rem 1rem',
        background: 'rgba(59,130,246,0.06)',
        border: '1px solid rgba(59,130,246,0.18)',
        borderRadius: 6,
      }}>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontStyle: 'italic', marginBottom: 10 }}>
          These agent files import code that this BP owns. Click Attach to confirm — they&apos;ll appear above as confirmed agents.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {suggestions.map(s => {
            const state = rowStates[s.agentName];
            const attached = state?.status === 'attached';
            return (
              <div
                key={s.agentName}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '0.5rem 0.65rem',
                  background: attached ? '#dcfce7' : 'white',
                  border: `1px solid ${attached ? '#bbf7d0' : 'var(--color-border)'}`,
                  borderRadius: 5,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>
                    {s.agentName}
                    {s.nameStemBoost && (
                      <span style={{
                        marginLeft: 8, fontSize: 9.5, padding: '1px 6px',
                        background: 'rgba(59,130,246,0.12)', color: 'var(--color-primary)',
                        borderRadius: 3, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>name match</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 10.5, color: 'var(--color-text-light)', fontFamily: 'var(--font-mono)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {s.sourcePath}
                  </div>
                </div>
                <span style={{
                  fontSize: 10.5, color: 'var(--color-text-light)', whiteSpace: 'nowrap',
                }}>
                  score {s.score} · {s.evidence.length} import{s.evidence.length === 1 ? '' : 's'}
                </span>
                {attached ? (
                  <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>
                    <i className="bi bi-check-circle-fill me-1" />
                    Attached
                  </span>
                ) : state?.status === 'error' ? (
                  <span style={{ fontSize: 11, color: '#b91c1c' }}>
                    <i className="bi bi-exclamation-circle me-1" />
                    {state.message}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => attach(s)}
                    disabled={state?.status === 'attaching'}
                    style={{
                      padding: '3px 12px', fontSize: 11.5, fontWeight: 600,
                      border: '1px solid var(--color-primary)', borderRadius: 4,
                      background: 'var(--color-primary)', color: 'white',
                      cursor: state?.status === 'attaching' ? 'wait' : 'pointer',
                      minHeight: 26,
                    }}
                  >
                    {state?.status === 'attaching' ? 'Attaching…' : 'Attach'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SuggestedAgents;
