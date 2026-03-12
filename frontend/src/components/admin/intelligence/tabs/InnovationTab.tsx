import { useState, useEffect, useCallback } from 'react';
import { getInnovationScoresData, InnovationScoreEntry } from '../../../../services/intelligenceApi';
import FeedbackButtons from '../FeedbackButtons';
import { deptMatchesLayer } from '../entityPanel/departmentConfig';

interface Props {
  entityFilter?: { type: string; id: string; name: string } | null;
  layerFilter?: number | null;
}

export default function InnovationTab({ entityFilter, layerFilter }: Props) {
  const [scores, setScores] = useState<InnovationScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const { data } = await getInnovationScoresData();
      let result = data.scores || [];
      if (entityFilter?.type === 'department') {
        result = result.filter((s) => s.id === entityFilter.id);
      } else if (layerFilter != null) {
        result = result.filter((s: any) => deptMatchesLayer(s.slug || s.name || '', layerFilter));
      }
      setScores(result);
    } catch { /* ignore */ }
    setLoading(false);
  }, [entityFilter?.type, entityFilter?.id, layerFilter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading innovation scores...</span>
        </div>
      </div>
    );
  }

  const maxScore = Math.max(...scores.map((s) => s.innovation_score), 1);

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0 fw-semibold">Innovation Scores</h6>
          {entityFilter && (
            <span className="badge bg-primary" style={{ fontSize: '0.68rem' }}>
              Filtered: {entityFilter.name}
            </span>
          )}
        </div>
      </div>

      {/* Formula explanation */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body p-2">
          <div className="small text-muted">
            <span className="fw-medium">Innovation Score Formula:</span>{' '}
            0.3 × Initiative Velocity + 0.25 × Completion Rate + 0.2 × Cross-Dept Collaboration + 0.15 × Risk Mitigation + 0.1 × Revenue Growth
          </div>
        </div>
      </div>

      <div className="row g-3">
        {scores.map((dept) => (
          <div key={dept.id} className="col-md-6">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <h6 className="fw-semibold mb-0" style={{ color: dept.color, fontSize: '0.9rem' }}>
                      {dept.name}
                    </h6>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold" style={{ fontSize: '1.4rem', color: dept.color }}>
                      {Math.round(dept.innovation_score)}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.65rem' }}>innovation</div>
                  </div>
                </div>

                {/* Score bar */}
                <div className="progress mb-3" style={{ height: 8 }}>
                  <div
                    className="progress-bar"
                    style={{
                      width: `${(dept.innovation_score / maxScore) * 100}%`,
                      background: dept.color,
                    }}
                  />
                </div>

                {/* Health + Innovation side by side */}
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <div className="rounded-2 p-2 text-center" style={{ background: dept.bg_light }}>
                      <div className="fw-bold" style={{ color: dept.color }}>{Math.round(dept.health_score)}</div>
                      <div className="text-muted" style={{ fontSize: '0.6rem' }}>Health</div>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="rounded-2 p-2 text-center" style={{ background: dept.bg_light }}>
                      <div className="fw-bold" style={{ color: dept.color }}>{Math.round(dept.innovation_score)}</div>
                      <div className="text-muted" style={{ fontSize: '0.6rem' }}>Innovation</div>
                    </div>
                  </div>
                </div>

                {/* Breakdown */}
                <div className="small">
                  <div className="d-flex justify-content-between text-muted mb-1">
                    <span>Initiative Velocity</span>
                    <span className="fw-medium">{dept.breakdown.initiative_velocity}%</span>
                  </div>
                  <div className="d-flex justify-content-between text-muted mb-1">
                    <span>Completion Rate</span>
                    <span className="fw-medium">{dept.breakdown.completion_rate}%</span>
                  </div>
                  <div className="d-flex justify-content-between text-muted mb-1">
                    <span>Avg Progress</span>
                    <span className="fw-medium">{dept.breakdown.avg_progress}%</span>
                  </div>
                  <div className="d-flex justify-content-between text-muted">
                    <span>Team ({dept.breakdown.team_size})</span>
                    <span className="fw-medium">
                      {dept.breakdown.active_initiatives} active / {dept.breakdown.total_initiatives} total
                    </span>
                  </div>
                </div>
                <div className="mt-2 pt-2 border-top">
                  <FeedbackButtons contentType="innovation" contentKey={`innovation_${dept.id}`} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {scores.length === 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            No innovation data{entityFilter ? ` for ${entityFilter.name}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
