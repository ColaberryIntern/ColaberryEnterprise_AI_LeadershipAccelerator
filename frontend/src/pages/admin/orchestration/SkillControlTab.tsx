import React, { useEffect, useState } from 'react';

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

  useEffect(() => {
    fetch(`${apiUrl}/api/admin/orchestration/program/skills`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        setSkills(data.skills || []);
        setGrouped(data.grouped || {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, apiUrl]);

  if (loading) return (
    <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div></div>
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
                          </tr>
                        </thead>
                        <tbody>
                          {domainSkills.map((s: any) => (
                            <tr key={s.skill_id}>
                              <td className="text-muted">{s.skill_id}</td>
                              <td className="fw-medium">{s.name}</td>
                              <td>{s.description}</td>
                              <td>{(s.mastery_threshold * 100).toFixed(0)}%</td>
                              <td>{s.is_active ? <span className="badge bg-success" style={{ fontSize: 10 }}>Yes</span> : <span className="badge bg-danger" style={{ fontSize: 10 }}>No</span>}</td>
                            </tr>
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
