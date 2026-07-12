import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal, TrustLevel } from '../../components/admin/shell/trust';

interface EntryPoint {
  id: string;
  slug: string;
  name: string | null;
  page: string | null;
  form_name: string | null;
  is_active: boolean;
}

interface LeadSource {
  id: string;
  slug: string;
  name: string;
  domain: string;
  is_active: boolean;
  entryPoints?: EntryPoint[];
  created_at: string;
}

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewSource, setShowNewSource] = useState(false);
  const [newSource, setNewSource] = useState({ slug: '', name: '', domain: '' });
  const [showNewEntry, setShowNewEntry] = useState<string | null>(null);
  const [newEntry, setNewEntry] = useState({ slug: '', name: '', page: '', form_name: '' });
  const [error, setError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/sources');
      setSources(res.data.sources || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const createSource = async () => {
    setError(null);
    try {
      await api.post('/api/admin/sources', newSource);
      setNewSource({ slug: '', name: '', domain: '' });
      setShowNewSource(false);
      fetchSources();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create source');
    }
  };

  const createEntry = async (sourceId: string) => {
    setError(null);
    try {
      await api.post(`/api/admin/sources/${sourceId}/entry-points`, newEntry);
      setNewEntry({ slug: '', name: '', page: '', form_name: '' });
      setShowNewEntry(null);
      fetchSources();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create entry point');
    }
  };

  const summary = useMemo(() => {
    const total = sources.length;
    const active = sources.filter((s) => s.is_active).length;
    const inactive = total - active;
    const entryPoints = sources.reduce((acc, s) => acc + (s.entryPoints || []).length, 0);
    return { total, active, inactive, entryPoints };
  }, [sources]);

  // Per-page trust signal (Basecamp todo 10027085963) derived from configured lead sources.
  const trust: TrustSignal = useMemo(() => {
    const { total, active, inactive, entryPoints } = summary;
    const level: TrustLevel = 'live';
    return {
      level,
      score: total === 0 ? 0 : Math.round((active / total) * 100),
      source: 'lead sources',
      updatedAt: new Date().toISOString(),
      summary: `${total} source${total === 1 ? '' : 's'} configured, ${active} active, ${entryPoints} entry point${entryPoints === 1 ? '' : 's'}.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Coverage',
          status: 'live',
          score: total === 0 ? 0 : Math.round((active / total) * 100),
          evidence: [
            { label: 'Active', value: `${active}/${total}` },
            { label: 'Inactive', value: String(inactive) },
            { label: 'Entry points', value: String(entryPoints) },
          ],
        },
      ],
    };
  }, [summary]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Sources"
        icon="upload-cloud-2-line"
        subtitle="Configure sites, forms, and webhook integrations that feed leads into the system."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Sources' }]}
        trust={trust}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowNewSource(true)}>
            <i className="ri-add-line" aria-hidden="true" /> New Source
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Sources" value={summary.total} icon="global-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Active" value={summary.active} icon="checkbox-circle-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Inactive" value={summary.inactive} icon="pause-circle-line" tone={summary.inactive ? 'warning' : 'neutral'} />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Entry Points" value={summary.entryPoints} icon="links-line" tone="info" />
          </div>
        </div>
      </PageHeader>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {showNewSource && (
        <SectionCard title="New Source" icon="add-circle-line" className="mb-4">
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label small fw-medium">Slug</label>
              <input className="form-control form-control-sm" value={newSource.slug}
                onChange={(e) => setNewSource({ ...newSource, slug: e.target.value })}
                placeholder="trustbeforeintelligence" />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Name</label>
              <input className="form-control form-control-sm" value={newSource.name}
                onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                placeholder="Trust Before Intelligence" />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Domain</label>
              <input className="form-control form-control-sm" value={newSource.domain}
                onChange={(e) => setNewSource({ ...newSource, domain: e.target.value })}
                placeholder="trustbeforeintelligence.ai" />
            </div>
          </div>
          <div className="mt-3 d-flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={createSource}>Create</button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowNewSource(false)}>Cancel</button>
          </div>
        </SectionCard>
      )}

      {sources.map((source) => (
        <SectionCard key={source.id} padded={false} className="mb-3">
          <div className="admin-section-card__head">
            <div>
              <span className="fw-semibold">{source.name}</span>
              <span className="text-muted ms-2 small">{source.slug} · {source.domain}</span>
              {!source.is_active && <span className="ms-2"><StatusBadge label="inactive" tone="warning" /></span>}
            </div>
            <div className="admin-section-card__actions">
              <button className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowNewEntry(source.id)}>
                <i className="ri-add-line" aria-hidden="true" /> Entry Point
              </button>
            </div>
          </div>
          <div>
            {showNewEntry === source.id && (
              <div className="p-3 border-bottom">
                <div className="row g-2">
                  <div className="col-md-3">
                    <input className="form-control form-control-sm" value={newEntry.slug}
                      onChange={(e) => setNewEntry({ ...newEntry, slug: e.target.value })}
                      placeholder="slug (e.g. get_book_modal)" />
                  </div>
                  <div className="col-md-3">
                    <input className="form-control form-control-sm" value={newEntry.name}
                      onChange={(e) => setNewEntry({ ...newEntry, name: e.target.value })}
                      placeholder="display name" />
                  </div>
                  <div className="col-md-3">
                    <input className="form-control form-control-sm" value={newEntry.page}
                      onChange={(e) => setNewEntry({ ...newEntry, page: e.target.value })}
                      placeholder="page (e.g. /)" />
                  </div>
                  <div className="col-md-3">
                    <input className="form-control form-control-sm" value={newEntry.form_name}
                      onChange={(e) => setNewEntry({ ...newEntry, form_name: e.target.value })}
                      placeholder="form name" />
                  </div>
                </div>
                <div className="mt-2 d-flex gap-2">
                  <button className="btn btn-sm btn-primary" onClick={() => createEntry(source.id)}>Create</button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowNewEntry(null)}>Cancel</button>
                </div>
              </div>
            )}
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Slug</th>
                    <th>Name</th>
                    <th>Page</th>
                    <th>Form</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {(source.entryPoints || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-muted py-3">No entry points yet.</td></tr>
                  ) : (
                    (source.entryPoints || []).map((ep) => (
                      <tr key={ep.id}>
                        <td><code>{ep.slug}</code></td>
                        <td>{ep.name || '-'}</td>
                        <td className="text-muted small">{ep.page || '-'}</td>
                        <td className="text-muted small">{ep.form_name || '-'}</td>
                        <td className="text-end">
                          <Link to={`/admin/generator/${source.slug}/${ep.slug}`}
                            className="btn btn-sm btn-outline-secondary">Generate embed</Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      ))}

      {sources.length === 0 && (
        <div className="text-center py-5 text-muted">
          No sources configured yet. Click <strong>New Source</strong> to add one, or run <code>npm run seed:sources</code>.
        </div>
      )}
    </>
  );
}
