import React, { useMemo, useState } from 'react';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
  total: number;
}

const EXPECTED_COLUMNS = [
  'name', 'email', 'company', 'title', 'phone', 'role',
  'company_size', 'evaluating_90_days', 'interest_area', 'message',
  'source', 'form_type', 'consent_contact',
  'utm_source', 'utm_campaign', 'page_url',
];

function AdminImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  // Per-page trust signal (Basecamp todo 10027085963): the import tool writes
  // straight to the live leads store, so the signal reflects that uploads land
  // in the system of record after duplicate screening.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'import',
    updatedAt: new Date().toISOString(),
    summary: 'CSV uploads write directly to the live leads store after duplicate screening.',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Destination',
        status: 'live',
        evidence: [{ label: 'Writes to', value: 'leads (deduped by email)' }],
      },
    ],
  }), []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    setResult(null);
    setError('');
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/api/admin/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setResult(res.data.result);
    } catch (err: any) {
      console.error('Import failed:', err);
      setError(err.response?.data?.error || 'Import failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = EXPECTED_COLUMNS.join(',') + '\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads-import-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="Import"
        icon="upload-2-line"
        subtitle="Upload a CSV of leads. Duplicates are screened by email before they reach the live store."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Import' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={handleDownloadTemplate}>
            <i className="ri-download-line" aria-hidden="true" /> Download CSV Template
          </button>
        }
      />

      {/* Instructions */}
      <SectionCard title="CSV Format" icon="file-list-3-line" className="mb-4">
        <p className="small text-muted mb-2">
          Upload a CSV file with leads. Required columns: <strong>name</strong> and <strong>email</strong>.
          All other columns are optional. Duplicates (by email) are automatically skipped.
        </p>
        <div className="p-3 rounded" style={{ background: 'var(--surface-subtle)' }}>
          <code className="small" style={{ whiteSpace: 'pre-wrap' }}>
            {EXPECTED_COLUMNS.join(', ')}
          </code>
        </div>
      </SectionCard>

      {/* Upload Area */}
      <SectionCard title="Upload" icon="upload-cloud-2-line" className="mb-4">
        <div className="mb-3">
          <input
            type="file"
            className="form-control"
            accept=".csv"
            onChange={handleFileChange}
          />
        </div>

        {file && (
          <div className="mb-3">
            <span className="text-muted small">Selected: </span>
            <span className="fw-medium small">{file.name}</span>
            <span className="text-muted small ms-2">({(file.size / 1024).toFixed(1)} KB)</span>
          </div>
        )}

        {error && <div className="alert alert-danger py-2 small">{error}</div>}

        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? 'Importing...' : 'Import Leads'}
        </button>
      </SectionCard>

      {/* Results */}
      {result && (
        <SectionCard title="Import Results" icon="checkbox-circle-line">
          <div className="row g-3 mb-3">
            <div className="col-6 col-lg-3">
              <StatCard label="Total Rows" value={result.total} icon="table-line" tone="info" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Imported" value={result.imported} icon="checkbox-circle-line" tone="success" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Skipped (Duplicate)" value={result.skipped} icon="filter-off-line" tone={result.skipped ? 'warning' : 'neutral'} />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Errors" value={result.errors.length} icon="error-warning-line" tone={result.errors.length ? 'danger' : 'neutral'} />
            </div>
          </div>

          {result.errors.length > 0 && (
            <div>
              <div className="d-flex align-items-center gap-2 mb-2">
                <h6 className="fw-bold mb-0">Errors</h6>
                <StatusBadge label={`${result.errors.length} failed`} tone="danger" />
              </div>
              <div className="p-3 rounded" style={{ background: 'var(--surface-subtle)', maxHeight: '200px', overflowY: 'auto' }}>
                {result.errors.map((err, idx) => (
                  <div key={idx} className="small mb-1" style={{ color: 'var(--status-danger)' }}>
                    Row {err.row}: {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      )}
    </>
  );
}

export default AdminImportPage;
