import React from 'react';
import { SectionCard } from '../../../components/admin/shell';
import type { GovAssignableBuilder } from '../../../services/factoryApi';

/**
 * RightRail — the persistent pursuit rail that sits beside every step (the 2026-10 redesign).
 *
 * It does NOT own the pursuit data: the page composes the deadline countdown, the key-dates/buyer
 * section, and the messages/amendments inbox from the SAME existing panel components
 * (DeadlineCard / OpportunityDossier / AmendmentInbox) and hands them in as nodes, so behavior and
 * every server-backed handler are unchanged — the rail only gives them a sticky home that stays
 * visible as the viewer moves through the steps. The one piece of UI the rail owns is the minimal
 * Team section (bidding entity + the builders a story can be assigned to); the richer roster-based
 * team view is a deferred follow-up (P6-T5), so this shows exactly what `ws.build` already carries.
 */
export function RightRail({
  deadline,
  dates,
  messages,
  team,
}: {
  deadline: React.ReactNode;
  dates: React.ReactNode;
  messages: React.ReactNode;
  team: { biddingEntity: string; builders: GovAssignableBuilder[]; deliveryProjectId: string | null };
}): React.ReactElement {
  return (
    <div className="gov-rail d-flex flex-column gap-3" style={{ position: 'sticky', top: 16 }}>
      {deadline}
      {dates}
      {messages}
      <SectionCard title="Team" icon="team-line"
        subtitle="Who can be assigned on this pursuit. The full roster view is a later step; this is what the workspace already knows.">
        <div className="small mb-2"><span className="text-secondary">Bidding entity:</span>{' '}
          <span className="fw-semibold">{team.biddingEntity || '—'}</span></div>
        {team.builders.length > 0 ? (
          <ul className="list-unstyled mb-0">
            {team.builders.map((b) => (
              <li key={b.identityId} className="py-1 border-top small d-flex flex-wrap align-items-center gap-2">
                <i className="ri-user-3-line text-secondary" aria-hidden="true" />
                <span className="fw-semibold">{b.email ?? b.identityId}</span>
                {b.roles.length > 0 && (
                  <span className="text-secondary">{b.roles.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="small text-secondary">
            <i className="ri-information-line me-1" aria-hidden="true" />
            {team.deliveryProjectId
              ? 'No assignable builders yet on the delivery project.'
              : 'Builders become assignable once a build is authorized into a delivery project.'}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
