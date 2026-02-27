import React, { useState } from 'react';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

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
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Import' }]} />
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          Import Leads
        </h1>
        <button className="btn btn-outline-primary btn-sm" onClick={handleDownloadTemplate}>
          Download CSV Template
        </button>
      </div>

      {/* Instructions */}
      <div className="card admin-table-card mb-4">
        <div className="card-header fw-bold py-3">CSV Format</div>
        <div className="card-body">
          <p className="small text-muted mb-2">
            Upload a CSV file with leads. Required columns: <strong>name</strong> and <strong>email</strong>.
            All other columns are optional. Duplicates (by email) are automatically skipped.
          </p>
          <div className="bg-light p-3 rounded">
            <code className="small" style={{ whiteSpace: 'pre-wrap' }}>
              {EXPECTED_COLUMNS.join(', ')}
            </code>
          </div>
        </div>
      </div>

      {/* Upload Area */}
      <div className="card admin-table-card mb-4">
        <div className="card-header fw-bold py-3">Upload</div>
        <div className="card-body">
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
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="card admin-table-card">
          <div className="card-header fw-bold py-3">Import Results</div>
          <div className="card-body">
            <div className="row g-3 mb-3">
              <div className="col-md-3">
                <div className="card bg-light p-3 text-center">
                  <div className="text-muted small">Total Rows</div>
                  <div className="h4 fw-bold mb-0">{result.total}</div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card bg-light p-3 text-center">
                  <div className="text-muted small">Imported</div>
                  <div className="h4 fw-bold mb-0 text-success">{result.imported}</div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card bg-light p-3 text-center">
                  <div className="text-muted small">Skipped (Duplicate)</div>
                  <div className="h4 fw-bold mb-0 text-warning">{result.skipped}</div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card bg-light p-3 text-center">
                  <div className="text-muted small">Errors</div>
                  <div className="h4 fw-bold mb-0 text-danger">{result.errors.length}</div>
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <h6 className="fw-bold mb-2">Errors</h6>
                <div className="bg-light p-3 rounded" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="small text-danger mb-1">
                      Row {err.row}: {err.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default AdminImportPage;
