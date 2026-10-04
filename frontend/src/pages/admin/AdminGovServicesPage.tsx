import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, StatCard } from '../../components/admin/shell';
import {
  listServiceOfferings, createServiceOffering, updateServiceOffering, retireServiceOffering,
  type ServiceOffering, type ServiceOfferingInput,
} from '../../services/factoryApi';
import ServiceEvidencePanel from '../../components/admin/ServiceEvidencePanel';

/**
 * AdminGovServicesPage — "Our Services": the catalog of what Colaberry offers, so a government opportunity can be
 * matched against it (the deterministic matcher is a separate, advisory feature). View / add / edit / retire.
 * A service is RETIRED (hidden from the active list), never deleted. Tenant-scoped on the server.
 * Design: Bootstrap 5 + admin-shell + RemixIcon; colors via tokens / Bootstrap utilities, no hardcoded hex.
 */

type StatusFilter = 'active' | 'all';
type Editing = ServiceOffering | 'new' | null;

const parseList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);
const joinList = (xs: string[] | null | undefined): string => (xs && xs.length ? xs.join(', ') : '');

interface FormState { name: string; category: string; description: string; keywords: string; naicsCodes: string; pscCodes: string; pastPerformance: string; owner: string; }
const emptyForm: FormState = { name: '', category: '', description: '', keywords: '', naicsCodes: '', pscCodes: '', pastPerformance: '', owner: '' };
const formFrom = (s: ServiceOffering): FormState => ({
  name: s.name ?? '', category: s.category ?? '', description: s.description ?? '',
  keywords: joinList(s.keywords), naicsCodes: joinList(s.naicsCodes), pscCodes: joinList(s.pscCodes),
  pastPerformance: s.pastPerformance ?? '', owner: s.owner ?? '',
});
const inputFrom = (f: FormState): ServiceOfferingInput => ({
  name: f.name.trim(), category: f.category.trim() || undefined, description: f.description.trim() || undefined,
  keywords: parseList(f.keywords), naicsCodes: parseList(f.naicsCodes), pscCodes: parseList(f.pscCodes),
  pastPerformance: f.pastPerformance.trim() || undefined, owner: f.owner.trim() || undefined,
});

/** The add/edit modal (React-controlled; no bootstrap JS). */
function ServiceForm({ initial, title, onCancel, onSave, saving }: {
  initial: FormState; title: string; onCancel: () => void; onSave: (f: FormState) => void; saving: boolean;
}): React.ReactElement {
  const [f, setF] = useState<FormState>(initial);
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
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
                  <label className="form-label" htmlFor="svc-keywords">Keywords <span className="text-secondary small">(comma-separated — used for matching)</span></label>
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

export default function AdminGovServicesPage(): React.ReactElement {
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('active');
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  /** The service whose case-study evidence is open, if any. */
  const [evidenceFor, setEvidenceFor] = useState<ServiceOffering | null>(null);

  const load = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    setError(null);
    try {
      setServices(await listServiceOfferings(status));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load the service catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(filter); }, [load, filter]);

  const activeCount = useMemo(() => services.filter((s) => s.status === 'active').length, [services]);

  const handleSave = useCallback(async (f: FormState) => {
    setSaving(true);
    setError(null);
    try {
      if (editing && editing !== 'new') await updateServiceOffering(editing.id, inputFrom(f));
      else await createServiceOffering(inputFrom(f));
      setEditing(null);
      await load(filter);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not save the service.');
    } finally {
      setSaving(false);
    }
  }, [editing, filter, load]);

  const handleRetire = useCallback(async (s: ServiceOffering) => {
    setError(null);
    try {
      await retireServiceOffering(s.id);
      await load(filter);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not retire the service.');
    }
  }, [filter, load]);

  return (
    <div>
      <PageHeader
        title="Our Services"
        subtitle="The services Colaberry offers · used to match against government opportunities"
        icon="service-line"
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><i className="ri-add-line me-1" aria-hidden="true" />Add service</button>}
      />

      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-3"><StatCard label="Active services" value={String(activeCount)} icon="service-line" tone="primary" hint="offerings available to match" /></div>
      </div>

      {error && <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert"><span>{error}</span><button type="button" className="btn-close" aria-label="Dismiss error" onClick={() => setError(null)} /></div>}

      <SectionCard
        title="Service catalog"
        subtitle="Keywords, NAICS and PSC codes drive the (advisory) opportunity match. Retire a service to hide it; it is never deleted."
        icon="archive-line"
        actions={
          <div className="btn-group btn-group-sm" role="group" aria-label="Status filter">
            <button type="button" className={`btn ${filter === 'active' ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setFilter('active')}>Active</button>
            <button type="button" className={`btn ${filter === 'all' ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => setFilter('all')}>All</button>
          </div>
        }
      >
        {loading ? (
          <p className="text-secondary mb-0">Loading services…</p>
        ) : services.length === 0 ? (
          <div className="text-center py-4">
            <i className="ri-service-line fs-2 text-secondary" aria-hidden="true" />
            <p className="text-secondary mt-2 mb-3">No services yet — add your first offering so opportunities can be matched against it.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><i className="ri-add-line me-1" aria-hidden="true" />Add your first service</button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr className="text-uppercase small text-secondary">
                  <th>Service</th>
                  <th style={{ width: 120 }}>Category</th>
                  <th>Keywords</th>
                  <th style={{ width: 140 }}>NAICS</th>
                  <th style={{ width: 140 }}>Owner</th>
                  <th style={{ width: 250 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className={s.status === 'retired' ? 'opacity-50' : undefined}>
                    <td>
                      <div className="fw-semibold">{s.name}{s.status === 'retired' && <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2">Retired</span>}</div>
                      {s.description && <div className="small text-secondary">{s.description}</div>}
                    </td>
                    <td>{s.category ? <span className="badge bg-secondary-subtle text-secondary-emphasis">{s.category}</span> : <span className="text-secondary">—</span>}</td>
                    <td className="small text-secondary">{joinList(s.keywords) || '—'}</td>
                    <td className="small text-secondary">{joinList(s.naicsCodes) || '—'}</td>
                    <td className="small text-secondary">{s.owner || '—'}</td>
                    <td>
                      <div className="d-flex gap-1">
                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEvidenceFor(s)} title="Case studies offered as evidence for this service">
                          <i className="ri-links-line me-1" aria-hidden="true" />Evidence
                        </button>
                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setEditing(s)}><i className="ri-edit-line me-1" aria-hidden="true" />Edit</button>
                        {s.status === 'active' && (
                          <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleRetire(s)} title="Hide this service (reversible: edit keeps its data)">
                            <i className="ri-archive-line me-1" aria-hidden="true" />Retire
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {editing && (
        <ServiceForm
          title={editing === 'new' ? 'Add a service' : 'Edit service'}
          initial={editing === 'new' ? emptyForm : formFrom(editing)}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {evidenceFor && (
        <ServiceEvidencePanel
          serviceId={evidenceFor.id}
          serviceName={evidenceFor.name}
          onClose={() => setEvidenceFor(null)}
        />
      )}
    </div>
  );
}
