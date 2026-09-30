import React, { useCallback, useMemo, useState } from 'react';
import { SectionCard, StatusBadge } from '../shell';
import {
  ConversionInternInput, ConversionPlan, ConversionReport,
  commitInternshipConversion, planInternshipConversion,
} from '../../../services/adminInternshipApi';

/**
 * Convert Existing Interns.
 *
 * ── DRY RUN FIRST, ALWAYS ──────────────────────────────────────────────────
 *
 * There is no way to reach Commit without having run the preview: the commit
 * button does not exist until a plan is on screen, and changing the roster clears
 * the plan. That is deliberate — the contract asks for a preview before committing,
 * and an operator who can skip straight to Commit has no preview.
 *
 * The server re-plans on commit rather than trusting the plan posted back, so even
 * a stale on-screen plan cannot decide who joins the cohort.
 *
 * ── THE PASTE FORMAT IS FORGIVING ON PURPOSE ───────────────────────────────
 *
 * One intern per line: an email, optionally a name, optionally the two
 * certifications as flags. Someone converting fifteen people has that list in an
 * email or a spreadsheet, not in JSON, and a format that rejects a trailing comma
 * makes them do data entry instead of the actual review.
 */

const PLACEHOLDER = `ada@example.com, Ada Lovelace, interview, documents
grace@example.com, Grace Hopper
# lines starting with # are ignored`;

const OUTCOME_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  will_convert: 'success',
  already_converted: 'info',
  ambiguous_match: 'warning',
  no_match: 'danger',
};

/**
 * Parse the pasted roster.
 *
 * Exported for the sake of being testable in isolation — this is where a mistyped
 * line becomes a person who does or does not get converted.
 */
export function parseRoster(text: string): { interns: ConversionInternInput[]; bad: string[] } {
  const interns: ConversionInternInput[] = [];
  const bad: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(',').map((p) => p.trim()).filter((p) => p.length > 0);
    const email = parts.find((p) => p.includes('@'));
    if (!email) { bad.push(line); continue; }

    const flags = parts.map((p) => p.toLowerCase());
    const name = parts.find((p) => p !== email
      && !['interview', 'documents', 'grandfathered', 'verified'].includes(p.toLowerCase()));

    interns.push({
      email,
      full_name: name ?? null,
      // Word-based rather than positional: "interview" anywhere on the line means
      // the interview is grandfathered, so column order cannot silently matter.
      interview_grandfathered: flags.includes('interview') || flags.includes('grandfathered'),
      documents_already_verified: flags.includes('documents') || flags.includes('verified'),
    });
  }

  return { interns, bad };
}

const InternshipConversionPanel: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<ConversionPlan | null>(null);
  const [report, setReport] = useState<ConversionReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { interns, bad } = useMemo(() => parseRoster(text), [text]);

  const changeText = (value: string) => {
    setText(value);
    // Editing the roster invalidates the preview. Leaving a stale plan on screen
    // beside an edited list is how someone commits a set they never previewed.
    setPlan(null);
    setReport(null);
  };

  const preview = useCallback(async () => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setPlan(await planInternshipConversion(interns));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not build the preview.');
    } finally {
      setBusy(false);
    }
  }, [interns]);

  const commit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await commitInternshipConversion(interns));
      setPlan(null);
      onChanged?.();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not commit the conversion.');
    } finally {
      setBusy(false);
    }
  }, [interns, onChanged]);

  const willConvert = plan?.rows.filter((r) => r.outcome === 'will_convert').length ?? 0;

  return (
    <SectionCard
      title="Convert existing interns"
      icon="user-shared-line"
      subtitle="Preview first. Nothing is written and nobody is emailed until you commit."
    >
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <label className="form-label" htmlFor="ai-roster" style={{ fontSize: 13, fontWeight: 600 }}>
        One intern per line
      </label>
      <textarea
        id="ai-roster"
        className="form-control form-control-sm"
        rows={6}
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5 }}
        placeholder={PLACEHOLDER}
        value={text}
        onChange={(e) => changeText(e.target.value)}
      />
      <div className="form-text">
        Add <code>interview</code> to certify an equivalent interview already happened, and{' '}
        <code>documents</code> if their paperwork was signed and checked outside the platform.
        Everyone still has to acknowledge the Claude Code and API-key requirement — that one is
        never waived.
      </div>

      {bad.length > 0 && (
        <div className="alert alert-warning mt-2" style={{ fontSize: 12.5 }}>
          {bad.length} line{bad.length === 1 ? '' : 's'} had no email address and will be ignored:{' '}
          <code>{bad.slice(0, 3).join(' | ')}</code>{bad.length > 3 ? ' …' : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          onClick={preview}
          disabled={busy || interns.length === 0}
        >
          {busy && !plan ? 'Previewing…' : `Preview ${interns.length || ''} ${interns.length === 1 ? 'intern' : 'interns'}`.trim()}
        </button>

        {/* Commit does not exist until a plan is on screen. */}
        {plan && (
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={commit}
            disabled={busy || willConvert === 0}
            title={willConvert === 0 ? 'Nothing in this plan would convert' : undefined}
          >
            {busy ? 'Converting…' : `Commit ${willConvert} conversion${willConvert === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {plan && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>
            Preview — nothing has been written{plan.cohort_exists ? '' : ' (the internship cohort will be created on commit)'}
          </p>
          <div className="table-responsive">
            <table className="table table-sm align-middle" style={{ fontSize: 12.5 }}>
              <thead>
                <tr><th>Email</th><th>Outcome</th><th>Interview</th><th>Documents</th><th>Preserved</th><th>What would happen</th></tr>
              </thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.email}>
                    <td>
                      {r.email}
                      {r.full_name && <div className="text-muted">{r.full_name}</div>}
                    </td>
                    <td><StatusBadge label={r.outcome.replace(/_/g, ' ')} tone={OUTCOME_TONE[r.outcome]} /></td>
                    <td>{r.requirements?.interview ?? '—'}</td>
                    <td>{r.requirements?.documents.replace(/_/g, ' ') ?? '—'}</td>
                    <td>
                      {r.preserved
                        ? `${r.preserved.projects} projects · ${r.preserved.attendance_records} attendance · from ${r.preserved.started_on ?? '?'}`
                        : '—'}
                    </td>
                    <td>
                      {r.blocked_reason
                        ? <span className="text-danger">{r.blocked_reason}</span>
                        : <ul className="mb-0 ps-3">{r.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report && (
        <div style={{ marginTop: 16 }}>
          <div className="alert alert-success" role="status" style={{ fontSize: 13 }}>
            <strong>Committed.</strong> {report.summary.converted} converted,{' '}
            {report.summary.skipped} already done, {report.summary.failed} failed.
          </div>
          <table className="table table-sm mb-0" style={{ fontSize: 12.5 }}>
            <thead><tr><th>Email</th><th>Result</th><th>Status</th><th>Cohort</th></tr></thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.email}>
                  <td>{r.email}</td>
                  <td>
                    {r.ok
                      ? (r.skipped_already_converted ? <StatusBadge label="already done" tone="info" /> : <StatusBadge label="converted" tone="success" />)
                      : <StatusBadge label="failed" tone="danger" />}
                  </td>
                  <td>{r.state?.replace(/_/g, ' ') ?? <span className="text-danger">{r.error}</span>}</td>
                  <td>{r.added_to_cohort ? 'added' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Retry is safe and says so, because a failed row is the normal case
              an operator will want to re-run. */}
          <p className="text-muted mb-0" style={{ fontSize: 12, marginTop: 8 }}>
            Re-running is safe — anyone already converted is skipped rather than converted twice.
          </p>
        </div>
      )}
    </SectionCard>
  );
};

export default InternshipConversionPanel;
