import React from 'react';

interface SkillControlTabProps {
  token: string;
  cohortId: string;
  apiUrl: string;
}

const ONTOLOGY_LAYERS = [
  { key: 'strategy_trust', label: 'Strategy Trust', color: 'bg-primary' },
  { key: 'governance', label: 'Governance', color: 'bg-success' },
  { key: 'requirements', label: 'Requirements', color: 'bg-info' },
  { key: 'build_discipline', label: 'Build Discipline', color: 'bg-warning' },
  { key: 'executive_authority', label: 'Executive Authority', color: 'bg-danger' },
];

const SkillControlTab: React.FC<SkillControlTabProps> = ({ token, cohortId, apiUrl }) => {
  return (
    <div>
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">
          Skill Mastery Configuration
        </div>
        <div className="card-body">
          <div className="alert alert-info mb-4" style={{ fontSize: 13 }}>
            Skill configuration coming soon. The skill mastery tracking system will allow
            administrators to configure skill definitions, mastery thresholds, and assessment
            criteria for each ontology layer.
          </div>

          <h6 className="fw-semibold mb-3" style={{ fontSize: 14 }}>Ontology Layers</h6>
          <p className="text-muted mb-3" style={{ fontSize: 13 }}>
            The accelerator program tracks skill mastery across five core ontology layers:
          </p>

          <div className="d-flex gap-2 flex-wrap">
            {ONTOLOGY_LAYERS.map((layer) => (
              <div key={layer.key} className="card border-0 shadow-sm" style={{ minWidth: 180 }}>
                <div className="card-body text-center py-3">
                  <span
                    className={`badge ${layer.color} mb-2`}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    {layer.label}
                  </span>
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    {layer.key}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-top">
            <h6 className="fw-semibold mb-2" style={{ fontSize: 13 }}>Planned Features</h6>
            <ul style={{ fontSize: 13 }} className="text-muted">
              <li>Skill definition management per ontology layer</li>
              <li>Mastery threshold configuration (beginner, intermediate, advanced)</li>
              <li>Assessment criteria and rubric builder</li>
              <li>Skill-to-artifact mapping</li>
              <li>Progress visualization settings</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillControlTab;
