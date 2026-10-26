import React from 'react';
import type { GovProposalDocument } from '../../../../services/govProjectPortalApi';

/**
 * ProposalDocuments — the cockpit's PROPOSAL tab: one card per NAMED document a bid must submit. The AI drafts each,
 * a reviewer accepts it; a card opens the document drawer to draft / preview / comment / accept. Accepted documents
 * count toward the overall %. Pricing (admin-only) is not shown to an intern (the projection drops it).
 */
const STATUS: Record<string, { cls: string; label: string }> = {
  not_started: { cls: '', label: 'Not started' },
  drafting: { cls: 'ai', label: 'Drafting…' },
  drafted: { cls: 'warn', label: 'Needs review' },
  changes_requested: { cls: 'warn', label: 'Changes requested' },
  accepted: { cls: 'ok', label: 'Accepted' },
};

export default function ProposalDocuments(
  { docs, onOpen }: { docs: GovProposalDocument[]; onOpen: (d: GovProposalDocument) => void },
): React.ReactElement {
  if (!docs.length) {
    return <div className="gck-empty" style={{ padding: 16 }}>No proposal documents yet. Once the solicitation's requirements are established, the documents a bid must submit appear here.</div>;
  }
  return (
    <div className="gck-doc-grid">
      {docs.map((d) => {
        const st = STATUS[d.status] ?? STATUS.not_started;
        return (
          <button type="button" className="gck-tcard" key={d.key} onClick={() => onOpen(d)}>
            <div className="top">
              <span className="gck-story-title" style={{ fontWeight: 700 }}>{d.title}</span>
              <span className={`gck-tag ${st.cls}`}>{st.label}</span>
            </div>
            <div className="gck-tags">
              <span className="gck-tag">Proposal doc</span>
              {d.gate && <span className="gck-tag warn">required</span>}
              {d.version > 0 && <span className="gck-tag">v{d.version}</span>}
            </div>
            <div className="gck-hint">Covers {d.requirementIds.length} requirement{d.requirementIds.length === 1 ? '' : 's'}{d.comments.length ? ` · ${d.comments.length} comment${d.comments.length === 1 ? '' : 's'}` : ''}</div>
          </button>
        );
      })}
    </div>
  );
}
