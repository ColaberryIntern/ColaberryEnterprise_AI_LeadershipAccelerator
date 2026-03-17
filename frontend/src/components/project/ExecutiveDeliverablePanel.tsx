import React from 'react';

interface ROI {
  estimated_annual_savings?: string;
  implementation_cost?: string;
  roi_percentage?: string;
  payback_months?: number;
}

interface ExecutiveDeliverablePanelProps {
  report: string;
  roi?: ROI;
  generatedAt?: string;
  loading?: boolean;
}

function ExecutiveDeliverablePanel({ report, roi, generatedAt, loading }: ExecutiveDeliverablePanelProps) {
  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Generating executive deliverable...</span>
        </div>
        <p className="small text-muted mt-3">Generating executive deliverable...</p>
      </div>
    );
  }

  return (
    <div>
      {/* ROI Summary Cards */}
      {roi && (
        <div className="row g-3 mb-4">
          {roi.estimated_annual_savings && (
            <div className="col-sm-3">
              <div className="card border-0 shadow-sm text-center p-3">
                <div className="small text-muted mb-1">Annual Savings</div>
                <div className="h5 fw-bold mb-0" style={{ color: 'var(--color-accent)' }}>
                  {roi.estimated_annual_savings}
                </div>
              </div>
            </div>
          )}
          {roi.implementation_cost && (
            <div className="col-sm-3">
              <div className="card border-0 shadow-sm text-center p-3">
                <div className="small text-muted mb-1">Implementation Cost</div>
                <div className="h5 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
                  {roi.implementation_cost}
                </div>
              </div>
            </div>
          )}
          {roi.roi_percentage && (
            <div className="col-sm-3">
              <div className="card border-0 shadow-sm text-center p-3">
                <div className="small text-muted mb-1">ROI</div>
                <div className="h5 fw-bold mb-0" style={{ color: 'var(--color-accent)' }}>
                  {roi.roi_percentage}
                </div>
              </div>
            </div>
          )}
          {roi.payback_months != null && (
            <div className="col-sm-3">
              <div className="card border-0 shadow-sm text-center p-3">
                <div className="small text-muted mb-1">Payback Period</div>
                <div className="h5 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
                  {roi.payback_months} mo
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Report */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span><i className="bi bi-file-earmark-richtext me-2"></i>Executive Report</span>
          {generatedAt && (
            <span className="small text-muted">
              Generated {new Date(generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="card-body">
          <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: 'var(--color-text)' }}>
            {report}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ExecutiveDeliverablePanel;
