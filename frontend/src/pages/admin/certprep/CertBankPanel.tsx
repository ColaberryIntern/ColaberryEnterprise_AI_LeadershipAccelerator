import React, { useEffect, useState } from 'react';
import { SectionCard, StatCard, StatusBadge } from '../../../components/admin/shell';
import { fetchItemStatistics, BankHealth, ItemStatistic } from '../../../services/certPrepAdminApi';
import { RubricBadge } from './RubricBadge';

/**
 * CertBankPanel — is the question bank healthy, and which item should somebody
 * read today?
 *
 * The item table is the substance. A bank that is never measured decays quietly:
 * a miskeyed item marks competent students wrong forever and looks exactly like
 * a hard question. Three signals catch it, and the column order here follows how
 * they should be read:
 *
 *   - **flags** first, because that is the answer to "what should I look at".
 *   - **discrimination**, which is the only signal that can distinguish a hard
 *     item from a wrong one: if the students who score well overall do WORSE on
 *     this item, the key is probably wrong. Shown as "—" below the exposure
 *     floor rather than as a number, because a confident-looking statistic from
 *     three answers is worse than none.
 *   - **p-value** last, because on its own it cannot tell those two apart.
 *
 * Rows arrive worst-signal-first from the server and are not re-sorted here.
 */

const FLAG_LABEL: Record<string, string> = {
  possibly_miskeyed_or_broken: 'Possibly miskeyed',
  negative_discrimination: 'Negative discrimination',
  too_easy: 'Too easy',
  dead_distractor: 'Dead distractor',
  insufficient_exposures: 'Too few exposures',
};

const FLAG_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  possibly_miskeyed_or_broken: 'danger',
  negative_discrimination: 'danger',
  too_easy: 'warning',
  dead_distractor: 'warning',
  insufficient_exposures: 'neutral',
};

export default function CertBankPanel({ health }: { health: BankHealth | null }) {
  const [items, setItems] = useState<ItemStatistic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchItemStatistics()
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) setError('Could not load item statistics.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const byStatus = health?.by_status ?? {};

  return (
    <>
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3"><StatCard label="Questions" value={health?.total_questions ?? '—'} icon="stack-line" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Approved" value={byStatus.approved ?? 0} tone="success" icon="check-double-line" /></div>
        <div className="col-6 col-lg-3"><StatCard label="Awaiting review" value={(byStatus.draft ?? 0) + (byStatus.in_review ?? 0)} tone="warning" icon="draft-line" /></div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="Unfilled domains"
            value={health?.domains_with_no_approved.length ?? '—'}
            tone={(health?.domains_with_no_approved.length ?? 0) > 0 ? 'danger' : 'neutral'}
            icon="alert-line"
            hint="cannot fill a form slot"
          />
        </div>
      </div>

      {/*
        The whole-bank audit. Per-question scores cannot see that 144 answers sit
        at A; this can. Hard failures are red because a bank where one letter
        wins is not a measurement instrument; advisory ones are amber because a
        thin objective is thin, not broken, and a scorecard that is all red
        teaches people to stop reading it.
      */}
      {health?.audit && (
        <div className={`border rounded p-3 mb-3 ${health.audit.pass ? '' : 'border-danger'}`}>
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className={`badge ${health.audit.pass ? 'text-bg-success' : 'text-bg-danger'}`}>
              Bank audit {health.audit.pass ? 'PASS' : 'FAIL'}
            </span>
            <span className="small text-muted">
              {health.audit.items} items · {health.audit.hardFailures} hard, {health.audit.advisoryFailures} advisory
            </span>
          </div>
          <ul className="list-unstyled small mb-0">
            {health.audit.checks.map((c) => (
              <li key={c.id} className="d-flex gap-2 mb-1">
                <span
                  className={`badge ${c.pass ? 'text-bg-success' : c.severity === 'hard' ? 'text-bg-danger' : 'text-bg-warning'}`}
                  style={{ minWidth: 44 }}
                >
                  {c.pass ? 'ok' : c.severity === 'hard' ? 'FAIL' : 'warn'}
                </span>
                <span><strong>{c.label}</strong> — {c.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        The rubric summary sits with bank health rather than with the item
        statistics below, because the two answer different questions at different
        times. Item statistics come from student RESPONSES and stay empty until a
        cohort has answered; the rubric can be computed the moment a question
        exists. Bank quality is visible from day one instead of after the first
        sitting.
      */}
      {health?.rubric && health.rubric.scored > 0 && (
        <div className="d-flex flex-wrap align-items-center gap-3 mb-3 p-3 border rounded">
          <RubricBadge met={health.rubric.median_met ?? 0} of={health.rubric.of} />
          <span className="small">
            <strong>{health.rubric.fully_meets}</strong> of <strong>{health.rubric.scored}</strong>{' '}
            questions match the published exam shape on all {health.rubric.of} dimensions
            {health.rubric.median_met !== null && <> · median {health.rubric.median_met}/{health.rubric.of}</>}
          </span>
          <span className="small text-muted ms-auto">
            Advisory. Measures whether items look like real exam items, not whether they are correct.
          </span>
        </div>
      )}

      {health && health.domains_with_no_approved.length > 0 && (
        <div className="alert alert-warning">
          <strong>No approved items in {health.domains_with_no_approved.join(', ')}.</strong>{' '}
          A form asks for a share of each domain by exam weight; a domain with nothing approved is
          silently dropped, so students receive a <em>shorter</em> sitting rather than an error. That
          is the usual explanation for a mock that returns fewer items than it planned.
        </div>
      )}

      <SectionCard
        title="Approved items by domain"
        subtitle={health ? `Blueprint ${health.blueprint_version}` : undefined}
        icon="pie-chart-line"
      >
        {!health ? <p className="text-muted mb-0">Loading…</p> : (
          <div className="d-flex flex-wrap gap-3">
            {Object.entries(health.approved_by_domain).map(([domain, count]) => (
              <div key={domain} className="border rounded px-3 py-2">
                <div className="small text-muted"><code>{domain}</code></div>
                <div className="fs-5">{count}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="mt-3">
        <SectionCard
          title="Item statistics"
          subtitle="Worst signal first. A miskeyed item looks exactly like a hard one until discrimination is read."
          icon="microscope-line"
        >
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Domain</th>
                  <th scope="col">Signals</th>
                  <th scope="col" className="text-end">Discrimination</th>
                  <th scope="col" className="text-end">p-value</th>
                  <th scope="col" className="text-end">Exposures</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="text-muted">Loading…</td></tr>}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted">
                      No responses yet, so there are no statistics. This is the honest empty state, not a zero.
                    </td>
                  </tr>
                )}
                {items.map((it) => (
                  <tr key={`${it.question_key}-${it.revision}`}>
                    <td className="text-nowrap"><code>{it.question_key}</code> <span className="text-muted small">r{it.revision}</span></td>
                    <td><code>{it.domain_id}</code></td>
                    <td>
                      {it.flags.length === 0
                        ? <span className="text-muted small">healthy</span>
                        : (
                          <div className="d-flex flex-wrap gap-1">
                            {it.flags.map((f) => (
                              <StatusBadge key={f} label={FLAG_LABEL[f] ?? f} tone={FLAG_TONE[f] ?? 'neutral'} />
                            ))}
                          </div>
                        )}
                    </td>
                    <td className="text-end">
                      {it.discrimination === null
                        ? <span className="text-muted" title="Below the exposure floor — no number is better than a misleading one">—</span>
                        : it.discrimination}
                    </td>
                    <td className="text-end">{it.p_value.toFixed(2)}</td>
                    <td className="text-end">{it.exposures}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
