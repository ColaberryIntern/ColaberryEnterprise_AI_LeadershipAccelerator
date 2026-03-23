import React, { useEffect, useState, useCallback } from 'react';
import portalApi from '../../utils/portalApi';

interface ContractData {
  id: string;
  project_id: string;
  contract_json: any;
  validation_status: string;
  readiness_status: string;
  locked_at: string | null;
}

function ProjectLockInScreen() {
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [slug, setSlug] = useState('');

  const fetchContract = useCallback(() => {
    setLoading(true);
    portalApi.get('/api/portal/project/contract')
      .then(res => {
        if (res.data?.contract_json) {
          setContract(res.data);
        } else {
          setContract(null);
        }
      })
      .catch(() => setContract(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchContract(); }, [fetchContract]);

  const handleGenerate = async () => {
    if (!slug.trim()) { alert('Please enter a project slug'); return; }
    setGenerating(true);
    try {
      const res = await portalApi.post('/api/portal/project/contract/generate', { slug: slug.trim() });
      setContract(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to generate contract');
    } finally { setGenerating(false); }
  };

  const handleLock = async () => {
    setLocking(true);
    try {
      const res = await portalApi.post('/api/portal/project/contract/lock');
      setContract(res.data);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to lock contract');
    } finally { setLocking(false); }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" style={{ color: 'var(--color-primary)' }} role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // No contract yet — show generate form
  if (!contract) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center py-5">
          <i className="bi bi-file-earmark-code fs-1 d-block mb-3" style={{ color: 'var(--color-primary)' }}></i>
          <h5 className="fw-bold mb-2" style={{ color: 'var(--color-primary)' }}>Generate Your System Design Contract</h5>
          <p className="text-muted small mb-3">Enter your project slug to fetch the design contract from the AI Project Architect.</p>
          <div className="d-flex justify-content-center gap-2" style={{ maxWidth: 400, margin: '0 auto' }}>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="e.g., ai-admissions-agent"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <button className="btn btn-sm btn-primary text-nowrap" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const c = contract.contract_json;
  const isLocked = !!contract.locked_at;

  return (
    <>
      {/* Header */}
      <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: `4px solid ${isLocked ? 'var(--color-accent)' : 'var(--color-primary)'}` }}>
        <div className="card-body py-3">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
                <i className="bi bi-file-earmark-check me-2"></i>
                {c.project_name || 'System Design Contract'}
              </h5>
              <div className="d-flex gap-2">
                <span className={`badge ${contract.validation_status === 'valid' ? 'bg-success' : 'bg-warning text-dark'}`}>
                  {contract.validation_status === 'valid' ? 'Valid' : 'Has Issues'}
                </span>
                <span className={`badge ${contract.readiness_status === 'ready' ? 'bg-success' : 'bg-warning text-dark'}`}>
                  {contract.readiness_status === 'ready' ? 'Build Ready' : 'Not Ready'}
                </span>
                {isLocked && <span className="badge bg-primary">Locked</span>}
              </div>
            </div>
            {!isLocked && (
              <button className="btn btn-sm btn-primary" onClick={handleLock} disabled={locking}>
                {locking ? 'Locking...' : 'Confirm & Lock'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {/* Features */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold small">
              <i className="bi bi-puzzle me-2" style={{ color: 'var(--color-primary)' }}></i>Features
            </div>
            <div className="card-body p-0">
              {c.features && Array.isArray(c.features) ? (
                <ul className="list-group list-group-flush">
                  {c.features.map((f: any, i: number) => (
                    <li key={i} className="list-group-item small py-2">
                      {typeof f === 'string' ? f : f.name || f.title || JSON.stringify(f)}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-3 text-muted small">No features defined</div>
              )}
            </div>
          </div>
        </div>

        {/* Skills */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold small">
              <i className="bi bi-stars me-2" style={{ color: '#8b5cf6' }}></i>Skills
            </div>
            <div className="card-body">
              {c.skills && Array.isArray(c.skills) ? (
                <div className="d-flex flex-wrap gap-2">
                  {c.skills.map((s: any, i: number) => (
                    <span key={i} className="badge bg-light text-dark border py-2 px-3">
                      {typeof s === 'string' ? s : s.name || JSON.stringify(s)}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="text-muted small">No skills defined</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        {/* Architecture */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold small">
              <i className="bi bi-diagram-3 me-2" style={{ color: 'var(--color-primary)' }}></i>Architecture
            </div>
            <div className="card-body small">
              {c.architecture ? (
                <div>
                  {c.architecture.style && <div className="mb-1"><strong>Style:</strong> {c.architecture.style}</div>}
                  {c.architecture.deployment_type && <div className="mb-1"><strong>Deployment:</strong> {c.architecture.deployment_type}</div>}
                  {c.architecture.ai_depth && <div className="mb-1"><strong>AI Depth:</strong> {c.architecture.ai_depth}</div>}
                  {typeof c.architecture === 'string' && <div>{c.architecture}</div>}
                </div>
              ) : (
                <div className="text-muted">No architecture defined</div>
              )}
            </div>
          </div>
        </div>

        {/* MCP Servers */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold small">
              <i className="bi bi-plug me-2" style={{ color: 'var(--color-accent)' }}></i>MCP Servers
            </div>
            <div className="card-body p-0">
              {c.mcp_servers && Array.isArray(c.mcp_servers) ? (
                <ul className="list-group list-group-flush">
                  {c.mcp_servers.map((server: any, i: number) => (
                    <li key={i} className="list-group-item small py-2">
                      <div className="fw-medium">{server.name || server}</div>
                      {server.purpose && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{server.purpose}</div>}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-3 text-muted small">No MCP servers configured</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Validation */}
      {c.validation && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold small">
            <i className="bi bi-shield-check me-2" style={{ color: c.validation.is_valid ? 'var(--color-accent)' : '#f59e0b' }}></i>
            Validation
          </div>
          <div className="card-body small">
            {c.validation.issues && c.validation.issues.length > 0 && (
              <div className="mb-2">
                <div className="fw-medium text-danger mb-1">Issues:</div>
                <ul className="mb-0">
                  {c.validation.issues.map((issue: string, i: number) => <li key={i}>{issue}</li>)}
                </ul>
              </div>
            )}
            {c.validation.warnings && c.validation.warnings.length > 0 && (
              <div>
                <div className="fw-medium" style={{ color: '#f59e0b' }}>Warnings:</div>
                <ul className="mb-0">
                  {c.validation.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            {(!c.validation.issues || c.validation.issues.length === 0) && (!c.validation.warnings || c.validation.warnings.length === 0) && (
              <div className="text-success"><i className="bi bi-check-circle me-1"></i>All validations passed</div>
            )}
          </div>
        </div>
      )}

      {/* Build Readiness */}
      {c.build_readiness && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold small">
            <i className="bi bi-rocket-takeoff me-2" style={{ color: 'var(--color-primary)' }}></i>
            Build Readiness
          </div>
          <div className="card-body small">
            <div className="d-flex gap-3 mb-2">
              <span className={`badge ${c.build_readiness.ready ? 'bg-success' : 'bg-warning text-dark'} py-2 px-3`}>
                {c.build_readiness.ready ? 'Ready to Build' : 'Not Ready'}
              </span>
              {c.build_readiness.risk_level && (
                <span className={`badge ${
                  c.build_readiness.risk_level === 'low' ? 'bg-success' :
                  c.build_readiness.risk_level === 'medium' ? 'bg-warning text-dark' : 'bg-danger'
                } py-2 px-3`}>
                  Risk: {c.build_readiness.risk_level}
                </span>
              )}
            </div>
            {c.build_readiness.missing_components && c.build_readiness.missing_components.length > 0 && (
              <div>
                <div className="fw-medium text-muted mb-1">Missing Components:</div>
                <ul className="mb-0">
                  {c.build_readiness.missing_components.map((mc: string, i: number) => <li key={i}>{mc}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default ProjectLockInScreen;
