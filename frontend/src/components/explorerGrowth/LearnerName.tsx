import React from 'react';
import PersonLink from '../admin/person/PersonLink';

/**
 * A learner as Explorer Growth shows them (Ali, 2026-10-26: "make sure all student links take you to 360" and "a link to see the GHL
 * record with one click using the icon"): the name or email links to the 360 profile on its Explorer tab (PersonLink, which falls
 * back to plain text when no identifier resolves), and the orange GHL icon (the same orange as the 360's GHL button) opens the contact
 * in the right GoHighLevel sub-account in a new tab. The icon renders ONLY when the server resolved a URL (explorerPersonLinks), so a
 * person not in the CRM gets no link rather than a wrong one. Both stop the click reaching a row that opens a drawer.
 */
export interface LearnerNameProps {
  enrollmentId: string;
  email: string | null;
  name?: string | null;
  leadId?: number | null;
  ghlUrl?: string | null;
  className?: string;
}

export default function LearnerName({ enrollmentId, email, name, leadId, ghlUrl, className }: LearnerNameProps) {
  return (
    <span className={`d-inline-flex align-items-center gap-2 ${className ?? ''}`}>
      <PersonLink enrollmentId={enrollmentId} email={email} leadId={leadId ?? undefined} name={name ?? email} tab="explorer" stopPropagation
        title="Open the 360 profile" />
      {ghlUrl && (
        <a href={ghlUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} data-testid="eg-ghl-link"
          className="d-inline-flex align-items-center justify-content-center rounded-circle text-white text-decoration-none"
          style={{ width: 22, height: 22, backgroundColor: '#FF7A00', fontSize: 9, fontWeight: 800 }}
          title="Open this contact in GoHighLevel" aria-label="Open this contact in GoHighLevel">GHL</a>
      )}
    </span>
  );
}
