import React from 'react';
import { Profile } from '../../../adminOs/personTypes';
import SectionCard from '../shell/SectionCard';
import { Field, fmtDate } from './primitives';

/**
 * Sessions on the public properties, when this person is linked to a visitor.
 *
 * Extracted from `PersonProfilePage` on 2026-10-11 (T212) under CLAUDE.md's
 * 500-line file ceiling. Behaviour unchanged.
 *
 * `sessions || null` is deliberate rather than sloppy: it turns a zero into the
 * "Not recorded" state, because a person linked to a visitor row with no
 * sessions is a data artefact, not a visit of length zero.
 */
export default function SiteActivityTab({ engagement }: {
  engagement: Profile['engagement'];
}) {
  return (
    <SectionCard title="Site activity">
      {engagement ? (
        <div className="row">
          <Field label="Sessions" value={engagement.sessions || null} />
          <Field label="First visit" value={fmtDate(engagement.firstSeen)} />
          <Field label="Last visit" value={fmtDate(engagement.lastSeen)} />
          <Field label="Properties" value={engagement.sites.join(', ')} />
        </div>
      ) : (
        <p className="text-muted small mb-0">No site activity linked to this person.</p>
      )}
    </SectionCard>
  );
}
