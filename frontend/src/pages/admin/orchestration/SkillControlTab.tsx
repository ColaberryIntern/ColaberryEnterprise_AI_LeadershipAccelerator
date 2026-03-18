import React, { useEffect, useState, useCallback } from 'react';

interface Props { token: string; apiUrl: string; }

const layerColors: Record<string, string> = {
  strategy_trust: '#1a365d',
  governance: '#c53030',
  requirements: '#2b6cb0',
  build_discipline: '#38a169',
  executive_authority: '#805ad5',
};

const layerLabels: Record<string, string> = {
  strategy_trust: 'Strategy & Trust',
  governance: 'Governance & Risk',
  requirements: 'Requirements Precision',
  build_discipline: 'Build Discipline',
  executive_authority: 'Executive Authority',
};

const SkillControlTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [skills, setSkills] = useState<any[]>([]);
  const [grouped, setGrouped] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [linkedArtifacts, setLinkedArtifacts] = useState<any[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/orchestration/program/skills`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setSkills(data.skills || []);
        setGrouped(data.grouped || {});
      })
      .catch((err) => setError(err.message || 'Failed to load skill ontology'))
      .finally(() => setLoading(false));
  }, [token, apiUrl]);

  const fetchLinkedArtifacts = useCallback(async (skillId: string) => {
    setArtifactsLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/skills/${skillId}/artifacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setLinkedArtifacts(Array.isArray(data) ? data : []);
    } catch {
      setLinkedArtifacts([]);
    } finally {
      setArtifactsLoading(false);
    }
  }, [apiUrl, token]);

  const handleToggleExpand = (skillId: string) => {
    if (expandedSkillId === skillId) {
      setExpandedSkillId(null);
      setLinkedArtifacts([]);
    } else {
      setExpandedSkillId(skillId);
      fetchLinkedArtifacts(skillId);
    }
  };

  if (loading) return (
    <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
  );

  if (error) return (
    <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>
  );

  const layers = Object.keys(grouped);

  return (
    <div>
      <div className="d-flex justify-content-between mb-3">
        <span className="fw-semibold" style={{ fontSize: 14 }}>Skill Ontology ({skills.length} skills across {layers.length} layers)</span>
      </div>

      {layers.map(layerId => {
        const layer = grouped[layerId];
        const domains = Object.keys(layer.domains);
        return (
          <div key={layerId} className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white d-flex align-items-center gap-2">
              <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: layerColors[layerId] || '#718096', display: 'inline-block' }}></span>
              <span className="fw-semibold" style={{ fontSize: 14 }}>{layerLabels[layerId] || layerId}</span>
              <span className="badge bg-secondary ms-auto" style={{ fontSize: 11 }}>{domains.length} domains</span>
            </div>
            <div className="card-body py-2">
              {domains.map(domainId => {
                const domainSkills = layer.domains[domainId];
                return (
                  <div key={domainId} className="mb-3">
                    <h6 className="fw-medium text-muted mb-2" style={{ fontSize: 12 }}>{domainId}</h6>
                    <div className="table-responsive">
                      <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                        <thead className="table-light">
                          <tr>
                            <th>Skill ID</th>
                            <th>Name</th>
                            <th>Description</th>
                            <th style={{ width: 80 }}>Threshold</th>
                            <th style={{ width: 60 }}>Active</th>
                            <th style={{ width: 80 }}>Artifacts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {domainSkills.map((s: any) => (
                            <React.Fragment key={s.skill_id}>
                              <tr>
                                <td className="text-muted">{s.skill_id}</td>
                                <td className="fw-medium">{s.name}</td>
                                <td>{s.description}</td>
                                <td>{(s.mastery_threshold * 100).toFixed(0)}%</td>
                                <td>{s.is_active ? <span className="badge bg-success" style={{ fontSize: 10 }}>Yes</span> : <span className="badge bg-danger" style={{ fontSize: 10 }}>No</span>}</td>
                                <td>
                                  <button
                                    className={`btn btn-sm ${expandedSkillId === s.skill_id ? 'btn-primary' : 'btn-outline-secondary'}`}
                                    style={{ fontSize: 10, padding: '2px 6px' }}
                                    onClick={() => handleToggleExpand(s.skill_id)}
                                  >
                                    {expandedSkillId === s.skill_id ? 'Hide' : 'View'}
                                  </button>
                                </td>
                              </tr>
                              {expandedSkillId === s.skill_id && (
                                <tr>
                                  <td colSpan={6} className="bg-light">
                                    <div className="p-2">
                                      <strong style={{ fontSize: 11 }}>Linked Artifacts</strong>
                                      {artifactsLoading ? (
                                        <div className="text-center py-1"><div className="spinner-border spinner-border-sm text-primary" /></div>
                                      ) : linkedArtifacts.length === 0 ? (
                                        <p className="text-muted small mb-0 mt-1">No artifacts linked to this skill.</p>
                                      ) : (
                                        <table className="table table-sm mt-1 mb-0" style={{ fontSize: 11 }}>
                                          <thead>
                                            <tr>
                                              <th>Artifact</th>
                                              <th>Type</th>
                                              <th>Contribution</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {linkedArtifacts.map((a: any) => {
                                              const mapping = Array.isArray(a.skill_mapping)
                                                ? a.skill_mapping.find((m: any) => m.skill_id === s.skill_id)
                                                : null;
                                              return (
                                                <tr key={a.id}>
                                                  <td className="fw-medium">{a.name}</td>
                                                  <td><span className="badge bg-secondary" style={{ fontSize: 9 }}>{a.artifact_type}</span></td>
                                                  <td>{mapping ? `${(mapping.contribution * 100).toFixed(0)}%` : '-'}</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {layers.length === 0 && (
        <div className="text-muted text-center py-4" style={{ fontSize: 13 }}>No skill definitions found. Restart the backend to seed the ontology.</div>
      )}
    </div>
  );
};

export default SkillControlTab;
