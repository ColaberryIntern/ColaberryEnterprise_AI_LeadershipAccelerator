import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../../../components/admin/shell';
import type { TrustSignal } from '../../../components/admin/shell';
import { fetchBankHealth, fetchCohorts, BankHealth, AdminCohort } from '../../../services/certPrepAdminApi';
import CertCohortPanel from './CertCohortPanel';
import CertBankPanel from './CertBankPanel';
import CertReviewPanel from './CertReviewPanel';
import CertEvidenceReviewPanel from './CertEvidenceReviewPanel';
import CertAuditPanel from './CertAuditPanel';

/**
 * AdminCertPrepPage — running Cert Prep for a cohort, and keeping the question
 * bank honest.
 *
 * The two jobs are different in kind and the tabs say so. "Cohort" is
 * operational: who is ready, where the cohort is weak, who never started.
 * "Question bank", "Review" and "Evidence" are quality control: nothing reaches
 * a student until a named human approved it, and no build counts toward
 * readiness until a named human verified it. "Audit" is the record of both.
 *
 * WHAT THIS PAGE REFUSES TO DO, on purpose:
 *   - No bulk approve. The API has no such endpoint; approving forty questions
 *     with one click is not review.
 *   - No reviewer field anywhere. The server stamps the authenticated admin.
 *   - No invented numbers. A readiness that was never computed reads "Not
 *     measured", not 0, and a discrimination below the exposure floor reads "—",
 *     not a confident-looking figure derived from three answers.
 *
 * The page is also the one Cert Prep surface that displays answer keys, in the
 * Review tab, because reviewing a question means reading its key. That is why it
 * lives behind requireAdmin and the 'program' management section.
 */

type TabId = 'cohort' | 'bank' | 'review' | 'evidence' | 'audit';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'cohort', label: 'Cohort', icon: 'group-line' },
  { id: 'bank', label: 'Question bank', icon: 'stack-line' },
  { id: 'review', label: 'Review queue', icon: 'draft-line' },
  { id: 'evidence', label: 'Evidence', icon: 'file-check-line' },
  { id: 'audit', label: 'Audit', icon: 'history-line' },
];

/**
 * The page's trust signal is the bank's own health, because that is what makes
 * every other number on the page meaningful. A bank with unfilled domains cannot
 * produce a full-length form, so a readiness score computed from it is measuring
 * less than it appears to — the badge says so rather than leaving an instructor
 * to infer it from a short sitting.
 */
export function bankTrust(health: BankHealth | null, failed: boolean): TrustSignal {
  if (failed) {
    return { level: 'error', source: 'Cert Prep bank', summary: 'Bank health could not be loaded, so nothing on this page is confirmed.' };
  }
  if (!health) {
    return { level: 'unverified', source: 'Cert Prep bank', summary: 'Loading bank health…' };
  }
  const approved = health.by_status?.approved ?? 0;
  if (approved === 0) {
    return {
      level: 'unverified',
      source: `Blueprint ${health.blueprint_version}`,
      summary: 'No approved questions. Nothing is servable to a student yet.',
    };
  }
  if (health.domains_with_no_approved.length > 0) {
    return {
      level: 'stale',
      source: `Blueprint ${health.blueprint_version}`,
      summary: `${health.domains_with_no_approved.length} domain(s) have no approved items, so forms cannot be filled to their planned length.`,
    };
  }
  return {
    level: 'verified',
    source: `Blueprint ${health.blueprint_version}`,
    summary: `${approved} approved items covering every domain.`,
  };
}

export default function AdminCertPrepPage() {
  const [tab, setTab] = useState<TabId>('cohort');
  const [cohorts, setCohorts] = useState<AdminCohort[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [health, setHealth] = useState<BankHealth | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(true);

  /** Enrollment ids for the selected cohort, lifted here so the Evidence tab can
   *  scope its queue to the cohort the instructor is actually looking at. */
  const [enrollmentIds, setEnrollmentIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchCohorts();
      const open = list.filter((c) => c.status === 'open');
      setCohorts(open.length > 0 ? open : list);
      setCohortId((prev) => prev || open[0]?.id || list[0]?.id || '');
    } catch {
      setCohorts([]);
    }
    try {
      setHealth(await fetchBankHealth());
      setHealthFailed(false);
    } catch (err: any) {
      // A 404 here is the feature flag, not a fault: CERT_PREP_ENABLED gates
      // every cert route. Saying "not enabled" is more useful than "failed".
      if (err?.response?.status === 404) setDisabled(true);
      else setHealthFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const trust = useMemo(() => bankTrust(health, healthFailed), [health, healthFailed]);

  return (
    <>
      <PageHeader
        title="Cert Prep"
        subtitle="Claude Certified Architect readiness — cohort operations and question-bank quality"
        icon="award-line"
        trust={trust}
        breadcrumb={[{ label: 'Program' }, { label: 'Cert Prep' }]}
      />

      {disabled && (
        <SectionCard>
          <p className="mb-1"><strong>Cert Prep is not enabled in this environment.</strong></p>
          <p className="text-muted mb-0 small">
            Every <code>/api/admin/cert-prep</code> route returns 404 while <code>CERT_PREP_ENABLED</code> is off.
            The page is reachable so the surface can be checked before the flag is turned on; the data below will stay empty until it is.
          </p>
        </SectionCard>
      )}

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <label className="form-label mb-0 small text-muted" htmlFor="cert-cohort">Cohort</label>
        <select
          id="cert-cohort"
          className="form-select form-select-sm"
          style={{ maxWidth: 320 }}
          value={cohortId}
          onChange={(e) => setCohortId(e.target.value)}
          disabled={cohorts.length === 0}
        >
          {cohorts.length === 0 && <option value="">No cohorts available</option>}
          {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {loading && <span className="small text-muted">Loading…</span>}
      </div>

      <ul className="nav nav-tabs mb-3" role="tablist">
        {TABS.map((t) => (
          <li className="nav-item" key={t.id} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`nav-link ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <i className={`ri-${t.icon} me-1`} aria-hidden="true" />{t.label}
            </button>
          </li>
        ))}
      </ul>

      {tab === 'cohort' && (
        <CertCohortPanel cohortId={cohortId} onEnrollmentIds={setEnrollmentIds} />
      )}
      {tab === 'bank' && <CertBankPanel health={health} />}
      {tab === 'review' && <CertReviewPanel onChanged={load} />}
      {tab === 'evidence' && <CertEvidenceReviewPanel enrollmentIds={enrollmentIds} />}
      {tab === 'audit' && <CertAuditPanel />}
    </>
  );
}
