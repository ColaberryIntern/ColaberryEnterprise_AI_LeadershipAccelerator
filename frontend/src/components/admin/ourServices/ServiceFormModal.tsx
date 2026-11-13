import React, { useEffect, useState } from 'react';
import type { ServiceOffering, ServiceOfferingInput } from '../../../services/factoryApi';

/**
 * ServiceFormModal - the add/edit service modal (React-controlled; no bootstrap JS). Moved unchanged out of
 * AdminGovServicesPage so the page can stay a thin composer. The field ids (svc-name, svc-keywords, ...) are
 * relied on by the page tests.
 */
export interface FormState { name: string; category: string; description: string; keywords: string; naicsCodes: string; pscCodes: string; pastPerformance: string; owner: string; }

const parseList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);
const joinList = (xs: string[] | null | undefined): string => (xs && xs.length ? xs.join(', ') : '');

export const emptyForm: FormState = { name: '', category: '', description: '', keywords: '', naicsCodes: '', pscCodes: '', pastPerformance: '', owner: '' };
export const formFrom = (s: ServiceOffering): FormState => ({
  name: s.name ?? '', category: s.category ?? '', description: s.description ?? '',
  keywords: joinList(s.keywords), naicsCodes: joinList(s.naicsCodes), pscCodes: joinList(s.pscCodes),
  pastPerformance: s.pastPerformance ?? '', owner: s.owner ?? '',
});
export const inputFrom = (f: FormState): ServiceOfferingInput => ({
  name: f.name.trim(), category: f.category.trim() || undefined, description: f.description.trim() || undefined,
  keywords: parseList(f.keywords), naicsCodes: parseList(f.naicsCodes), pscCodes: parseList(f.pscCodes),
  pastPerformance: f.pastPerformance.trim() || undefined, owner: f.owner.trim() || undefined,
});

interface Props { initial: FormState; title: string; onCancel: () => void; onSave: (f: FormState) => void; saving: boolean }

export default function ServiceFormModal({ initial, title, onCancel, onSave, saving }: Props): React.ReactElement {
  const [f, setF] = useState<FormState>(initial);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
      style={{ background: 'rgba(0,0,0,.5)' }} onClick={onCancel}>
      <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable" role="document" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={onCancel} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) onSave(f); }}>
            <div className="modal-body">
              <div className="row g-3">
                <div className="col-md-8">
                  <label className="form-label" htmlFor="svc-name">Service name <span className="text-danger">*</span></label>
                  <input id="svc-name" className="form-control" value={f.name} onChange={set('name')} required maxLength={200} autoFocus />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="svc-category">Category</label>
                  <input id="svc-category" className="form-control" value={f.category} onChange={set('category')} maxLength={80} placeholder="IT / Consulting / Data / AI" />
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="svc-desc">Description</label>
                  <textarea id="svc-desc" className="form-control" rows={2} value={f.description} onChange={set('description')} maxLength={4000} />
                </div>
                <div className="col-12">
                  <label className="form-label" htmlFor="svc-keywords">Keywords <span className="text-secondary small">(comma-separated, used for matching)</span></label>
                  <input id="svc-keywords" className="form-control" value={f.keywords} onChange={set('keywords')} placeholder="data analytics, dashboards, ETL, case management" />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="svc-naics">NAICS codes <span className="text-secondary small">(comma-separated)</span></label>
                  <input id="svc-naics" className="form-control" value={f.naicsCodes} onChange={set('naicsCodes')} placeholder="541512, 541511" />
                </div>
                <div className="col-md-6">
                  <label className="form-label" htmlFor="svc-psc">PSC codes <span className="text-secondary small">(optional)</span></label>
                  <input id="svc-psc" className="form-control" value={f.pscCodes} onChange={set('pscCodes')} placeholder="D302, R425" />
                </div>
                <div className="col-md-8">
                  <label className="form-label" htmlFor="svc-pastperf">Past performance <span className="text-secondary small">(references / notes)</span></label>
                  <textarea id="svc-pastperf" className="form-control" rows={2} value={f.pastPerformance} onChange={set('pastPerformance')} maxLength={4000} />
                </div>
                <div className="col-md-4">
                  <label className="form-label" htmlFor="svc-owner">Owner / POC</label>
                  <input id="svc-owner" className="form-control" value={f.owner} onChange={set('owner')} maxLength={120} placeholder="name or email" />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !f.name.trim()}>
                {saving ? 'Saving…' : 'Save service'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
