import React, { useEffect, useState } from 'react';
import { SectionCard } from '../shell';
import { CASE_STUDY_CONTROLS } from './caseStudyDesk';
import type { CaseStudySummary, CaseStudyUpdatePatch } from '../../../services/caseStudyAdminApi';

/**
 * CaseStudyConsentPanel — spec §16, the consent and privacy record.
 *
 * These columns are the RECORD's, not the snapshot's, and the publish gate
 * compares the two: if the record says `anonymized` and the approved snapshot
 * says `named`, publication is refused rather than resolved by picking one.
 * That is why saving here tells the reviewer, on screen, that the snapshot must
 * be rebuilt and re-approved afterwards — a consent change that does not reach
 * the snapshot changes nothing about what a visitor would see.
 */

interface Props {
  record: CaseStudySummary;
  busy: boolean;
  onSave: (patch: CaseStudyUpdatePatch) => void;
}

type OrgMode = 'named' | 'anonymized' | 'hidden';
type BuilderMode = 'named' | 'role_only' | 'anonymous';
type Visibility = 'public' | 'anonymized' | 'private';

export default function CaseStudyConsentPanel({
  record, busy, onSave,
}: Props): React.ReactElement {
  const [orgMode, setOrgMode] = useState<OrgMode>(record.organizationIdentityMode);
  const [orgName, setOrgName] = useState(record.organizationDisplayName ?? '');
  const [orgConsent, setOrgConsent] = useState(record.organizationNamingConsent);
  const [builderMode, setBuilderMode] = useState<BuilderMode>(record.builderIdentityMode);
  const [builderConsent, setBuilderConsent] = useState(record.builderNamingConsent);
  const [visibility, setVisibility] = useState<Visibility>(record.visibility);

  // A reload (after a sync, or after another admin's edit) must not leave stale
  // consent in the form; consent is the one thing that must never be guessed.
  useEffect(() => {
    setOrgMode(record.organizationIdentityMode);
    setOrgName(record.organizationDisplayName ?? '');
    setOrgConsent(record.organizationNamingConsent);
    setBuilderMode(record.builderIdentityMode);
    setBuilderConsent(record.builderNamingConsent);
    setVisibility(record.visibility);
  }, [record]);

  const namedWithoutConsent = (orgMode === 'named' && !orgConsent)
    || (builderMode === 'named' && !builderConsent);

  const save = () => onSave({
    organizationIdentityMode: orgMode,
    organizationDisplayName: orgName.trim() ? orgName.trim() : null,
    organizationNamingConsent: orgConsent,
    builderIdentityMode: builderMode,
    builderNamingConsent: builderConsent,
    visibility,
  });

  return (
    <SectionCard title="Consent and privacy" icon="shield-user-line" className="mb-4">
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label" htmlFor="cs-org-mode">Organization identity</label>
            <select
              id="cs-org-mode" data-testid="cs-org-mode" className="form-select" value={orgMode}
              onChange={(e) => setOrgMode(e.target.value as OrgMode)}
            >
              <option value="named">named</option>
              <option value="anonymized">anonymized</option>
              <option value="hidden">hidden</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="cs-org-name">Organization display name</label>
            <input
              id="cs-org-name" data-testid="cs-org-name" className="form-control" value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="cs-visibility">Record visibility</label>
            <select
              id="cs-visibility" data-testid="cs-visibility" className="form-select"
              value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}
            >
              <option value="public">public</option>
              <option value="anonymized">anonymized</option>
              <option value="private">private</option>
            </select>
          </div>
          <div className="col-md-6 form-check ms-3">
            <input
              id="cs-org-consent" data-testid="cs-org-consent" className="form-check-input"
              type="checkbox" checked={orgConsent}
              onChange={(e) => setOrgConsent(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="cs-org-consent">
              The organization has approved being named
            </label>
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="cs-builder-mode">Builder identity</label>
            <select
              id="cs-builder-mode" data-testid="cs-builder-mode" className="form-select"
              value={builderMode} onChange={(e) => setBuilderMode(e.target.value as BuilderMode)}
            >
              <option value="named">named</option>
              <option value="role_only">role_only</option>
              <option value="anonymous">anonymous</option>
            </select>
          </div>
          <div className="col-md-6 form-check ms-3">
            <input
              id="cs-builder-consent" data-testid="cs-builder-consent" className="form-check-input"
              type="checkbox" checked={builderConsent}
              onChange={(e) => setBuilderConsent(e.target.checked)}
            />
            <label className="form-check-label" htmlFor="cs-builder-consent">
              The builders have approved being named
            </label>
          </div>
        </div>

        {namedWithoutConsent && (
          <div className="alert alert-danger mt-3" data-testid="cs-consent-warning">
            Someone is set to be named without a recorded consent. The publish gate refuses this,
            and it should: change the identity mode, or record the consent.
          </div>
        )}

        <p className="small text-muted mt-3 mb-2">
          Consent lives on the record. The snapshot carries its own copy, and the gate compares
          them, so rebuild the snapshot with a sync and approve it again after changing anything
          here.
        </p>
        <button
          type="button" className="btn btn-sm btn-danger" disabled={busy}
          data-testid={CASE_STUDY_CONTROLS.consent} onClick={save}
        >
          Save consent
        </button>
      </form>
    </SectionCard>
  );
}
