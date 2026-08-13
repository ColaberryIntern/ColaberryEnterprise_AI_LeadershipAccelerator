import React from 'react';

// ProofDesk Milestone 2 — References tab (spec §15.3). Purely presentational: reads
// fields already present on the ticket (parent_ticket_id, entity_type/entity_id, any
// metadata.source_url-style fields) — no new fetch, no new backend surface. Renders an
// honest "No references" when none of these are populated, never a fabricated link.

interface TicketLike {
  parent_ticket_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, any>;
}

interface Props {
  ticket: TicketLike;
  onOpenTicket?: (ticketId: string) => void;
}

export default function ReferencesTab({ ticket, onOpenTicket }: Props) {
  const sourceUrl = typeof ticket.metadata?.source_url === 'string' ? ticket.metadata.source_url : null;
  const hasParent = Boolean(ticket.parent_ticket_id);
  const hasEntity = Boolean(ticket.entity_type && ticket.entity_id);
  const hasSourceUrl = Boolean(sourceUrl);

  if (!hasParent && !hasEntity && !hasSourceUrl) {
    return <div className="text-muted small py-4">No references.</div>;
  }

  return (
    <div className="small">
      {hasParent && (
        <div className="mb-2">
          <span className="text-muted me-2">Parent ticket:</span>
          {onOpenTicket ? (
            <button
              type="button"
              className="btn btn-link btn-sm p-0"
              onClick={() => onOpenTicket(ticket.parent_ticket_id as string)}
            >
              {ticket.parent_ticket_id}
            </button>
          ) : (
            <span className="font-monospace">{ticket.parent_ticket_id}</span>
          )}
        </div>
      )}
      {hasEntity && (
        <div className="mb-2">
          <span className="text-muted me-2">Related entity:</span>
          <span className="font-monospace">{ticket.entity_type}:{ticket.entity_id}</span>
        </div>
      )}
      {hasSourceUrl && (
        <div className="mb-2">
          <span className="text-muted me-2">Source:</span>
          <a href={sourceUrl as string} target="_blank" rel="noreferrer">{sourceUrl}</a>
        </div>
      )}
    </div>
  );
}
