import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useMarketingValidation } from '../hooks/useMarketingValidation';
import { getAuditSummary, exportAuditMarkdown, getReports, clearReports } from '../services/validationStore';
import type { ValidationResult } from '../services/blueprintValidator';
import type { AgentReport } from '../agents/uxUiAgent';

function MarketingMonitorPanel() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const { lastReport, isScanning, healthScore, triggerScan } = useMarketingValidation();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'history' | 'health'>('live');

  // Don't render for non-admins or on admin pages
  if (!isAuthenticated || location.pathname.startsWith('/admin')) return null;

  const handleExport = () => {
    const md = exportAuditMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `marketing-audit-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="btn btn-sm rounded-circle shadow"
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '24px',
          width: '48px',
          height: '48px',
          zIndex: 9997,
          backgroundColor: 'var(--color-primary)',
          color: '#fff',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
        }}
        title="Marketing Intelligence Monitor"
        aria-label="Toggle marketing monitor panel"
      >
        {isScanning ? (
          <span className="spinner-border spinner-border-sm" role="status" />
        ) : (
          <span>{healthScore >= 80 ? '\u2713' : healthScore >= 50 ? '\u26A0' : '\u2717'}</span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '24px',
            width: '420px',
            height: '560px',
            zIndex: 9997,
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: '#fff',
          }}
        >
          {/* Header */}
          <div
            style={{
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
              color: '#fff',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <strong style={{ fontSize: '14px' }}>Marketing Intelligence</strong>
              <div style={{ fontSize: '11px', opacity: 0.8 }}>
                Health: {healthScore}/100
                {isScanning && ' — Scanning...'}
              </div>
            </div>
            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-outline-light"
                onClick={triggerScan}
                disabled={isScanning}
                style={{ fontSize: '11px', padding: '2px 8px' }}
              >
                Scan
              </button>
              <button
                className="btn btn-sm btn-outline-light"
                onClick={() => setIsOpen(false)}
                style={{ fontSize: '14px', padding: '0 6px', lineHeight: '1' }}
                aria-label="Close panel"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Tabs */}
          <nav className="nav nav-tabs" style={{ fontSize: '12px' }}>
            {(['live', 'history', 'health'] as const).map(tab => (
              <button
                key={tab}
                className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                {tab === 'live' ? 'Live' : tab === 'history' ? 'History' : 'Health'}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px', fontSize: '13px' }}>
            {activeTab === 'live' && <LiveTab report={lastReport} isScanning={isScanning} onCopy={handleCopy} />}
            {activeTab === 'history' && <HistoryTab />}
            {activeTab === 'health' && <HealthTab onExport={handleExport} />}
          </div>
        </div>
      )}
    </>
  );
}

function LiveTab({ report, isScanning, onCopy }: {
  report: ReturnType<typeof useMarketingValidation>['lastReport'];
  isScanning: boolean;
  onCopy: (text: string) => void;
}) {
  if (isScanning) {
    return <div className="text-center text-muted py-4"><span className="spinner-border spinner-border-sm" role="status" /> Scanning page...</div>;
  }

  if (!report) {
    return <div className="text-center text-muted py-4">Navigate to a public page to start scanning.</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <strong>{report.route}</strong>
        <span className={`badge ${report.overallScore >= 80 ? 'bg-success' : report.overallScore >= 50 ? 'bg-warning' : 'bg-danger'}`}>
          {report.overallScore}/100
        </span>
      </div>
      <div className="small text-muted mb-3">
        {report.passedRules}/{report.totalRules} rules passed | {report.topSuggestions.length} high-priority suggestions
      </div>

      {report.agents.map((agent: AgentReport) => (
        <AgentCard key={agent.agentName} agent={agent} onCopy={onCopy} />
      ))}
    </div>
  );
}

function AgentCard({ agent, onCopy }: { agent: AgentReport; onCopy: (text: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const failures = agent.results.filter(r => !r.passed);
  const passes = agent.results.filter(r => r.passed);

  return (
    <div className="card border-0 shadow-sm mb-2">
      <div
        className="card-header bg-white d-flex justify-content-between align-items-center"
        style={{ cursor: 'pointer', padding: '8px 12px' }}
        onClick={() => setExpanded(prev => !prev)}
      >
        <span className="fw-semibold" style={{ fontSize: '12px' }}>
          {expanded ? '\u25BC' : '\u25B6'} {agent.agentName}
        </span>
        <span>
          <span className="badge bg-success me-1" style={{ fontSize: '10px' }}>{passes.length}</span>
          {failures.length > 0 && <span className="badge bg-danger" style={{ fontSize: '10px' }}>{failures.length}</span>}
        </span>
      </div>
      {expanded && (
        <div className="card-body" style={{ padding: '8px 12px' }}>
          {failures.length === 0 && (
            <div className="text-success small">All checks passed.</div>
          )}
          {failures.map((r: ValidationResult) => (
            <ResultRow key={r.ruleId} result={r} onCopy={onCopy} />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result, onCopy }: { result: ValidationResult; onCopy: (text: string) => void }) {
  const severityColor = result.severity === 'critical' ? 'danger' : result.severity === 'warning' ? 'warning' : 'info';

  return (
    <div className="border-bottom py-2" style={{ fontSize: '12px' }}>
      <div className="d-flex justify-content-between align-items-start">
        <div>
          <span className={`badge bg-${severityColor} me-1`} style={{ fontSize: '10px' }}>
            {result.severity}
          </span>
          <span className="text-muted">{result.ruleId}</span>
        </div>
        <span style={{ fontSize: '10px', color: '#999' }}>
          {Math.round(result.confidence * 100)}%
        </span>
      </div>
      <div className="mt-1">{result.details}</div>
      {result.suggestion && (
        <div className="mt-1 d-flex align-items-start gap-1">
          <span className="text-primary" style={{ fontSize: '11px' }}>{result.suggestion}</span>
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ fontSize: '10px', padding: '0 4px', lineHeight: '1.4' }}
            onClick={() => onCopy(result.suggestion || '')}
            title="Copy suggestion"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const reports = useMemo(() => getReports(), []);

  if (reports.length === 0) {
    return <div className="text-center text-muted py-4">No scan history yet. Navigate pages to build history.</div>;
  }

  return (
    <div>
      {reports.slice(0, 20).map((report, i) => (
        <div key={i} className="border-bottom py-2 d-flex justify-content-between align-items-center" style={{ fontSize: '12px' }}>
          <div>
            <strong>{report.route}</strong>
            <div className="text-muted" style={{ fontSize: '11px' }}>
              {new Date(report.timestamp).toLocaleString()}
            </div>
          </div>
          <div className="text-end">
            <span className={`badge ${report.overallScore >= 80 ? 'bg-success' : report.overallScore >= 50 ? 'bg-warning' : 'bg-danger'}`}>
              {report.overallScore}
            </span>
            <div className="text-muted" style={{ fontSize: '11px' }}>
              {report.passedRules}/{report.totalRules}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function HealthTab({ onExport }: { onExport: () => void }) {
  const summary = useMemo(() => getAuditSummary(), []);

  return (
    <div>
      {/* Health Score */}
      <div className="text-center mb-3">
        <div style={{ fontSize: '48px', fontWeight: 'bold', color: summary.overallScore >= 80 ? 'var(--color-accent)' : summary.overallScore >= 50 ? '#ffc107' : 'var(--color-secondary)' }}>
          {summary.overallScore}
        </div>
        <div className="text-muted small">Marketing Health Score</div>
        <span className={`badge ${summary.trend === 'improving' ? 'bg-success' : summary.trend === 'declining' ? 'bg-danger' : 'bg-secondary'} mt-1`}>
          {summary.trend}
        </span>
      </div>

      {/* Category Breakdown */}
      <div className="mb-3">
        <strong style={{ fontSize: '12px' }}>Category Scores</strong>
        {Object.entries(summary.perCategory).map(([cat, score]) => (
          <div key={cat} className="d-flex justify-content-between align-items-center py-1" style={{ fontSize: '12px' }}>
            <span>{cat.replace(/_/g, ' ')}</span>
            <div className="d-flex align-items-center gap-2">
              <div style={{ width: '80px', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px' }}>
                <div style={{ width: `${score}%`, height: '100%', backgroundColor: score >= 80 ? 'var(--color-accent)' : score >= 50 ? '#ffc107' : 'var(--color-secondary)', borderRadius: '3px' }} />
              </div>
              <span className="text-muted">{score}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Top Suggestions */}
      {summary.topSuggestions.length > 0 && (
        <div className="mb-3">
          <strong style={{ fontSize: '12px' }}>Top Issues</strong>
          {summary.topSuggestions.slice(0, 5).map((s, i) => (
            <div key={i} className="py-1 border-bottom" style={{ fontSize: '11px' }}>
              <span className={`badge bg-${s.severity === 'critical' ? 'danger' : 'warning'} me-1`} style={{ fontSize: '9px' }}>
                {s.severity}
              </span>
              <strong>{s.route}</strong>: {s.details}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="d-flex gap-2">
        <button className="btn btn-sm btn-outline-primary flex-grow-1" onClick={onExport} style={{ fontSize: '11px' }}>
          Export Report
        </button>
        <button className="btn btn-sm btn-outline-danger" onClick={() => { clearReports(); window.location.reload(); }} style={{ fontSize: '11px' }}>
          Clear Data
        </button>
      </div>

      {/* Pages Scanned */}
      {summary.perPage.length > 0 && (
        <div className="mt-3">
          <strong style={{ fontSize: '12px' }}>Pages Scanned ({summary.totalPagesScanned})</strong>
          {summary.perPage.map(p => (
            <div key={p.route} className="d-flex justify-content-between py-1" style={{ fontSize: '11px' }}>
              <span>{p.route}</span>
              <span className={`badge ${p.score >= 80 ? 'bg-success' : p.score >= 50 ? 'bg-warning' : 'bg-danger'}`} style={{ fontSize: '10px' }}>
                {p.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MarketingMonitorPanel;
