import React from 'react';
import api from '../../utils/api';

/**
 * R2 - approve a learner brand's authored assets for a landing page, from the Content tab (backend
 * routes/admin/growthJourneyContentApprovalRoutes.ts). Preview first, always: it shows exactly how many asset rules and
 * policy pages would be written, and writes nothing. Approve is Ali's (the server refuses anyone else with 403); Revoke
 * is open to any admin, so taking approval away never waits on one person. Nothing here touches the Explorer registry.
 */

/** The brands with authored assets to declare (backend contentRulesPlan.LEARNER_BRAND_SLUGS). */
const BRANDS = ['colaberry-training', 'cpn'] as const;

interface Preview { rules: number; policy_pages: number; skipped: number; summary: string[] }
type Body = { brand_slug: string; landing_page: string };

const post = <T,>(action: 'preview' | 'apply' | 'revoke', body: Body) =>
  api.post<T>(`/api/admin/growth-journey/content-approval/${action}`, body).then((r) => r.data);

function errorText(e: unknown): string {
  const r = (e as { response?: { status?: number; data?: { error?: string } } })?.response;
  if (r?.status === 403) return 'Only Ali (or a super admin) can approve content.';
  return r?.data?.error || 'That did not work. Nothing was changed.';
}

export default function ContentApprovalForm({ onChanged }: { onChanged?: () => void }) {
  const [brand, setBrand] = React.useState<string>(BRANDS[0]);
  const [page, setPage] = React.useState('');
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [note, setNote] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setNote(null);
    try { await fn(); } catch (e) { setNote({ tone: 'danger', text: errorText(e) }); } finally { setBusy(false); }
  };
  const body = { brand_slug: brand, landing_page: page.trim() };

  return (
    <div className="card border-0 shadow-sm mb-3" data-testid="content-approval">
      <div className="card-header bg-white fw-semibold">Approve content for a brand</div>
      <div className="card-body">
        <p className="small text-muted">
          Approves this brand&rsquo;s authored lessons for one landing page, so Maya and the journey may cite them. Preview first:
          it writes nothing.
        </p>
        <div className="row g-2 align-items-end">
          <div className="col-sm-3">
            <label className="form-label small fw-medium mb-1" htmlFor="ca-brand">Brand</label>
            <select id="ca-brand" className="form-select form-select-sm" value={brand} onChange={(e) => { setBrand(e.target.value); setPreview(null); }}>
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="col-sm-6">
            <label className="form-label small fw-medium mb-1" htmlFor="ca-page">Landing page (https)</label>
            <input id="ca-page" className="form-control form-control-sm" value={page} placeholder="https://..."
              onChange={(e) => { setPage(e.target.value); setPreview(null); }} />
          </div>
          <div className="col-sm-3 d-flex gap-2">
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={busy || !page.trim()} data-testid="ca-preview"
              onClick={() => run(async () => { setPreview(await post<Preview>('preview', body)); })}>Preview</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || !preview} data-testid="ca-apply"
              onClick={() => run(async () => {
                const r = await post<{ rules_created: number; rules_existing: number; rules_restored?: number; policy_pages_added: number }>('apply', body);
                const restored = r.rules_restored ?? 0;
                setNote({ tone: 'success', text: `Approved: ${r.rules_created} new rules, ${restored} restored after a revoke (${r.rules_existing - restored} already approved), ${r.policy_pages_added} landing page added.` });
                onChanged?.();
              })}>Approve</button>
            <button type="button" className="btn btn-outline-danger btn-sm" disabled={busy || !page.trim()} data-testid="ca-revoke"
              onClick={() => run(async () => {
                const r = await post<{ rules_revoked: number; policy_pages_removed: number }>('revoke', body);
                setNote({ tone: 'success', text: `Revoked: ${r.rules_revoked} rules, ${r.policy_pages_removed} landing page removed.` });
                onChanged?.();
              })}>Revoke</button>
          </div>
        </div>
        {preview && (
          <div className="small mt-2" data-testid="ca-preview-result">
            Would approve <strong>{preview.rules}</strong> asset rules and <strong>{preview.policy_pages}</strong> landing page
            entries ({preview.skipped} assets skipped).
          </div>
        )}
        {note && <div className={`alert alert-${note.tone} py-2 small mt-2 mb-0`} role="status" data-testid="ca-note">{note.text}</div>}
      </div>
    </div>
  );
}
