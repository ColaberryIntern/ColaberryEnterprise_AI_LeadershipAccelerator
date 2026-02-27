import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ui/ToastProvider';
import Breadcrumb from '../../components/ui/Breadcrumb';

interface ApolloResult {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string;
  phone_numbers?: { raw_number: string }[];
  linkedin_url?: string;
  organization?: {
    name: string;
    industry: string;
    estimated_num_employees?: number;
    annual_revenue_printed?: string;
  };
}

function AdminApolloPage() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ApolloResult[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; errors: number } | null>(null);
  const [form, setForm] = useState({
    titles: '',
    seniorities: '',
    industries: '',
    company_sizes: '',
    locations: '',
    keywords: '',
  });

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setImportResult(null);
    try {
      const body: Record<string, any> = { per_page: 25 };
      if (form.titles) body.q_person_title = form.titles.split(',').map((s) => s.trim());
      if (form.seniorities) body.person_seniorities = form.seniorities.split(',').map((s) => s.trim());
      if (form.industries) body.q_organization_industries = form.industries.split(',').map((s) => s.trim());
      if (form.company_sizes) body.organization_num_employees_ranges = form.company_sizes.split(',').map((s) => s.trim());
      if (form.locations) body.person_locations = form.locations.split(',').map((s) => s.trim());
      if (form.keywords) body.q_keywords = form.keywords;

      const res = await fetch('/api/admin/apollo/search', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data.people || []);
        setTotal(data.total || 0);
        setSelectedIds(new Set());
      } else {
        showToast(data.error || 'Search failed.', 'error');
      }
    } catch (err) {
      showToast('Apollo search failed.', 'error');
    } finally {
      setSearching(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map((r) => r.id)));
    }
  };

  const handleImport = async () => {
    const selected = results.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/admin/apollo/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ people: selected }),
      });
      const data = await res.json();
      if (res.ok) {
        setImportResult({ imported: data.imported, duplicates: data.duplicates, errors: data.errors });
        setSelectedIds(new Set());
      }
    } catch (err) {
      showToast('Import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Apollo' }]} />
      <h2 className="mb-4">Apollo Lead Search</h2>

      {/* Search Form */}
      <div className="card admin-table-card mb-4">
        <div className="card-body">
          <form onSubmit={handleSearch}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Job Titles</label>
                <input
                  className="form-control form-control-sm"
                  value={form.titles}
                  onChange={(e) => setForm({ ...form, titles: e.target.value })}
                  placeholder="CTO, VP Engineering, Director AI"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Seniorities</label>
                <input
                  className="form-control form-control-sm"
                  value={form.seniorities}
                  onChange={(e) => setForm({ ...form, seniorities: e.target.value })}
                  placeholder="c_suite, vp, director"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Industries</label>
                <input
                  className="form-control form-control-sm"
                  value={form.industries}
                  onChange={(e) => setForm({ ...form, industries: e.target.value })}
                  placeholder="SaaS, Financial Services, Healthcare"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Company Size Ranges</label>
                <input
                  className="form-control form-control-sm"
                  value={form.company_sizes}
                  onChange={(e) => setForm({ ...form, company_sizes: e.target.value })}
                  placeholder="51,200, 201,1000"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Locations</label>
                <input
                  className="form-control form-control-sm"
                  value={form.locations}
                  onChange={(e) => setForm({ ...form, locations: e.target.value })}
                  placeholder="United States, California"
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-semibold">Keywords</label>
                <input
                  className="form-control form-control-sm"
                  value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                  placeholder="artificial intelligence, machine learning"
                />
              </div>
            </div>
            <div className="mt-3">
              <button className="btn btn-primary" type="submit" disabled={searching}>
                {searching ? 'Searching...' : 'Search Apollo'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className="alert alert-success">
          Imported {importResult.imported} leads.
          {importResult.duplicates > 0 && ` ${importResult.duplicates} duplicates skipped.`}
          {importResult.errors > 0 && ` ${importResult.errors} errors.`}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="card admin-table-card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Results ({total} total, showing {results.length})</span>
            <div className="d-flex gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={selectAll}>
                {selectedIds.size === results.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                className="btn btn-success btn-sm"
                disabled={selectedIds.size === 0 || importing}
                onClick={handleImport}
              >
                {importing ? 'Importing...' : `Import ${selectedIds.size} Lead(s)`}
              </button>
            </div>
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Company</th>
                  <th>Industry</th>
                  <th>Size</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className={selectedIds.has(r.id) ? 'table-active' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                      />
                    </td>
                    <td className="fw-semibold">{r.name || `${r.first_name} ${r.last_name}`}</td>
                    <td className="small">{r.title}</td>
                    <td>{r.organization?.name}</td>
                    <td className="small">{r.organization?.industry}</td>
                    <td className="small">{r.organization?.estimated_num_employees}</td>
                    <td className="small">{r.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminApolloPage;
