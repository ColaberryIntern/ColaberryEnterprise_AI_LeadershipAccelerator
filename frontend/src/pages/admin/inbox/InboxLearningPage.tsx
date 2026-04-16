import React, { useState, useEffect } from 'react';
import api from '../../../utils/api';

interface LearningMetrics {
  total_drafts: number;
  approval_rate: number;
  edited_count: number;
  rejected_count: number;
}

interface StyleProfile {
  category: string;
  formality_level: string;
  tone_descriptors: string[];
  greeting_patterns: string[];
  signoff_patterns: string[];
}

interface LearningEvent {
  id: number;
  date: string;
  email_subject: string;
  ai_draft_preview: string;
  actual_reply_preview: string;
  diff_summary: string;
}

export default function InboxLearningPage() {
  const [metrics, setMetrics] = useState<LearningMetrics | null>(null);
  const [profiles, setProfiles] = useState<StyleProfile[]>([]);
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchLearning = async () => {
      try {
        setLoading(true);
        setError('');
        const res = await api.get('/api/admin/inbox/learning');
        setMetrics(res.data || null);
        setProfiles(res.data.style_profiles || []);
        setEvents(res.data.recent_events || res.data.learning_events || []);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load learning data');
      } finally {
        setLoading(false);
      }
    };
    fetchLearning();
  }, []);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  return (
    <div>
      <h4 className="mb-3">Learning Dashboard</h4>

      {/* Metric cards */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="text-muted small mb-1">Total Drafts</div>
              <div className="fs-3 fw-bold">{metrics?.total_drafts ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="text-muted small mb-1">Approval Rate</div>
              <div className="fs-3 fw-bold text-success">{metrics?.approval_rate != null ? `${Math.round(metrics.approval_rate)}%` : '--'}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="text-muted small mb-1">Edited Before Send</div>
              <div className="fs-3 fw-bold text-warning">{metrics?.edited_count ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="text-muted small mb-1">Rejected</div>
              <div className="fs-3 fw-bold text-danger">{metrics?.rejected_count ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Style profiles */}
      {profiles.length > 0 && (
        <div className="mb-4">
          <h5 className="mb-3">Style Profiles</h5>
          <div className="row g-3">
            {profiles.map((profile) => (
              <div key={profile.category} className="col-md-6 col-lg-4">
                <div className="card border-0 shadow-sm h-100">
                  <div className="card-header bg-white fw-semibold">{profile.category}</div>
                  <div className="card-body">
                    <div className="mb-2">
                      <span className="small fw-medium">Formality:</span>{' '}
                      <span className="badge bg-info">{profile.formality_level}</span>
                    </div>
                    <div className="mb-2">
                      <span className="small fw-medium d-block">Tone:</span>
                      <div className="d-flex gap-1 flex-wrap">
                        {profile.tone_descriptors.map((t) => (
                          <span key={t} className="badge bg-secondary">{t}</span>
                        ))}
                      </div>
                    </div>
                    <div className="mb-2">
                      <span className="small fw-medium d-block">Greetings:</span>
                      <ul className="list-unstyled small text-muted mb-0">
                        {profile.greeting_patterns.map((g, i) => (
                          <li key={i}>&ldquo;{g}&rdquo;</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="small fw-medium d-block">Sign-offs:</span>
                      <ul className="list-unstyled small text-muted mb-0">
                        {profile.signoff_patterns.map((s, i) => (
                          <li key={i}>&ldquo;{s}&rdquo;</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent learning events */}
      <h5 className="mb-3">Recent Learning Events</h5>
      {events.length === 0 ? (
        <div className="text-center py-5 text-muted">No learning events yet.</div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>Email Subject</th>
                  <th>AI Draft</th>
                  <th>Actual Reply</th>
                  <th>Diff Summary</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr key={evt.id}>
                    <td className="small text-muted">{new Date(evt.date).toLocaleDateString()}</td>
                    <td className="small fw-medium">{evt.email_subject}</td>
                    <td className="small text-muted text-truncate" style={{ maxWidth: 200 }}>{evt.ai_draft_preview}</td>
                    <td className="small text-muted text-truncate" style={{ maxWidth: 200 }}>{evt.actual_reply_preview}</td>
                    <td className="small">{evt.diff_summary}</td>
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
