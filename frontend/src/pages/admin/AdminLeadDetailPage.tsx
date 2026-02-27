import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';
import ActivityTimeline from '../../components/admin/ActivityTimeline';
import AddNoteForm from '../../components/admin/AddNoteForm';
import AppointmentCard from '../../components/admin/AppointmentCard';
import ScheduleAppointmentModal from '../../components/admin/ScheduleAppointmentModal';
import TemperatureBadge from '../../components/TemperatureBadge';

interface LeadDetail {
  id: number;
  name: string;
  email: string;
  company: string;
  role: string;
  title: string;
  phone: string;
  company_size: string;
  evaluating_90_days: boolean;
  lead_score: number;
  lead_temperature?: string;
  temperature_updated_at?: string;
  status: string;
  pipeline_stage: string;
  interest_area: string;
  interest_level: string;
  notes: string;
  source: string;
  form_type: string;
  message: string;
  consent_contact: boolean;
  utm_source: string;
  utm_campaign: string;
  page_url: string;
  assigned_admin: string;
  assignedAdmin?: { id: string; email: string };
  created_at: string;
  updated_at: string;
}

interface AutomationEntry {
  id: string;
  type: string;
  status: string;
  provider_response: string;
  created_at: string;
}

interface AppointmentData {
  id: string;
  title: string;
  description: string;
  scheduled_at: string;
  duration_minutes: number;
  type: string;
  status: string;
  outcome_notes: string;
  lead?: { id: number; name: string; email: string; company: string };
}

import { PIPELINE_STAGES, PIPELINE_STAGE_COLORS, STATUS_VALUES } from '../../constants';

const STATUS_OPTIONS = STATUS_VALUES;

function AdminLeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [automationHistory, setAutomationHistory] = useState<AutomationEntry[]>([]);
  const [appointments, setAppointments] = useState<AppointmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('');
  const [pipelineStage, setPipelineStage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'activity' | 'appointments' | 'strategy'>('info');
  const [tempHistory, setTempHistory] = useState<any[]>([]);
  const [strategyCalls, setStrategyCalls] = useState<any[]>([]);

  const fetchTempHistory = async () => {
    try {
      const res = await api.get(`/api/admin/leads/${id}/temperature-history`);
      setTempHistory(res.data.history || []);
    } catch (err) {
      // Temperature history not critical
    }
  };

  const fetchStrategyPrep = async () => {
    try {
      const res = await api.get(`/api/admin/leads/${id}/strategy-prep`);
      setStrategyCalls(res.data.strategyCalls || []);
    } catch (err) {
      // Strategy prep data not critical
    }
  };

  useEffect(() => {
    fetchLead();
    fetchAppointments();
    fetchTempHistory();
    fetchStrategyPrep();
  }, [id]); // eslint-disable-line

  const fetchLead = async () => {
    try {
      const res = await api.get(`/api/admin/leads/${id}`);
      setLead(res.data.lead);
      setAutomationHistory(res.data.automationHistory || []);
      setNotes(res.data.lead.notes || '');
      setStatus(res.data.lead.status || 'new');
      setPipelineStage(res.data.lead.pipeline_stage || 'new_lead');
    } catch (err) {
      console.error('Failed to fetch lead:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      const res = await api.get('/api/admin/appointments', { params: { leadId: id } });
      setAppointments(res.data.appointments);
    } catch (err) {
      console.error('Failed to fetch appointments:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage('');
    try {
      await api.patch(`/api/admin/leads/${id}`, { status, notes });
      setSaveMessage('Saved successfully');
      fetchLead();
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err) {
      console.error('Failed to update lead:', err);
      setSaveMessage('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handlePipelineStageChange = async (newStage: string) => {
    const oldStage = pipelineStage;
    setPipelineStage(newStage);
    try {
      await api.patch(`/api/admin/leads/${id}/pipeline`, {
        pipeline_stage: newStage,
        from_stage: oldStage,
      });
      setActivityRefreshKey((k) => k + 1);
    } catch (err) {
      console.error('Failed to update pipeline stage:', err);
      setPipelineStage(oldStage);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getScoreBadge = (score: number) => {
    if (score > 80) return 'bg-danger';
    if (score > 60) return 'bg-warning text-dark';
    if (score > 30) return 'bg-info';
    return 'bg-secondary';
  };

  const getTypeBadge = (type: string) => {
    if (type === 'email') return 'bg-info';
    if (type === 'alert') return 'bg-danger';
    return 'bg-warning text-dark';
  };

  const getTypeLabel = (type: string) => {
    if (type === 'email') return 'Email';
    if (type === 'alert') return 'Alert';
    return 'Voice Call';
  };

  const getStageBadgeColor = (stage: string) => {
    return PIPELINE_STAGE_COLORS[stage] || '#6c757d';
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">Lead not found</p>
        <Link to="/admin/leads" className="btn btn-primary">Back to Leads</Link>
      </div>
    );
  }

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/admin/dashboard' }, { label: 'Leads', to: '/admin/leads' }, { label: lead.name }]} />
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <div className="d-flex align-items-center gap-3 mt-1">
            <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
              {lead.name}
            </h1>
            <TemperatureBadge temperature={lead.lead_temperature} size="md" />
            {lead.lead_score > 0 && (
              <span className={`badge rounded-pill ${getScoreBadge(lead.lead_score)} fs-6`}>
                Score: {lead.lead_score}
              </span>
            )}
          </div>
          {lead.title && <div className="text-muted small mt-1">{lead.title}{lead.company ? ` at ${lead.company}` : ''}</div>}
        </div>
        <button
          className="btn btn-outline-primary btn-sm"
          onClick={() => setShowAppointmentModal(true)}
        >
          Schedule Appointment
        </button>
      </div>

      {/* Pipeline Stage Bar */}
      <div className="card admin-table-card mb-4">
        <div className="card-body py-2">
          <div className="d-flex align-items-center gap-2">
            <span className="text-muted small fw-bold me-2">Pipeline:</span>
            {PIPELINE_STAGES.map((stage) => (
              <button
                key={stage.key}
                className={`btn btn-sm ${pipelineStage === stage.key ? 'text-white' : 'btn-outline-secondary'}`}
                style={pipelineStage === stage.key ? { backgroundColor: getStageBadgeColor(stage.key), borderColor: getStageBadgeColor(stage.key) } : {}}
                onClick={() => handlePipelineStageChange(stage.key)}
              >
                {stage.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'info' ? 'active' : ''}`} onClick={() => setActiveTab('info')}>
            Lead Info
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
            Activity
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => setActiveTab('appointments')}>
            Appointments ({appointments.length})
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link ${activeTab === 'strategy' ? 'active' : ''}`} onClick={() => setActiveTab('strategy')}>
            Strategy Prep {strategyCalls.some((c: any) => c.intelligence) ? `(${strategyCalls.filter((c: any) => c.intelligence).length})` : ''}
          </button>
        </li>
      </ul>

      {activeTab === 'info' && (
        <div className="row g-4">
          <div className="col-lg-8">
            {/* Contact Info */}
            <div className="card admin-table-card mb-4">
              <div className="card-header fw-bold py-3">Contact Information</div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <div className="text-muted small">Email</div>
                    <div>{lead.email}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Phone</div>
                    <div>{lead.phone || '-'}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Company</div>
                    <div>{lead.company || '-'}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Title</div>
                    <div>{lead.title || lead.role || '-'}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Company Size</div>
                    <div>{lead.company_size || '-'}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Evaluating (90 Days)</div>
                    <div>{lead.evaluating_90_days ? 'Yes' : 'No'}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Interest Area</div>
                    <div>{lead.interest_area || '-'}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Source / Form</div>
                    <div>{lead.source} / {lead.form_type}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Contact Consent</div>
                    <div>{lead.consent_contact ? 'Yes' : 'No'}</div>
                  </div>
                  <div className="col-md-6">
                    <div className="text-muted small">Created</div>
                    <div>{formatDate(lead.created_at)}</div>
                  </div>
                  {lead.message && (
                    <div className="col-12">
                      <div className="text-muted small">Message</div>
                      <div className="bg-light p-3 rounded">{lead.message}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* UTM / Tracking Data */}
            {(lead.utm_source || lead.utm_campaign || lead.page_url) && (
              <div className="card admin-table-card mb-4">
                <div className="card-header fw-bold py-3">Tracking Data</div>
                <div className="card-body">
                  <div className="row g-3">
                    {lead.utm_source && (
                      <div className="col-md-6">
                        <div className="text-muted small">UTM Source</div>
                        <div><code>{lead.utm_source}</code></div>
                      </div>
                    )}
                    {lead.utm_campaign && (
                      <div className="col-md-6">
                        <div className="text-muted small">UTM Campaign</div>
                        <div><code>{lead.utm_campaign}</code></div>
                      </div>
                    )}
                    {lead.page_url && (
                      <div className="col-12">
                        <div className="text-muted small">Page URL</div>
                        <div className="text-break small"><code>{lead.page_url}</code></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Status + Notes */}
            <div className="card admin-table-card mb-4">
              <div className="card-header fw-bold py-3">Status &amp; Notes</div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label small text-muted">Status</label>
                  <select
                    className="form-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label small text-muted">Notes</label>
                  <textarea
                    className="form-control"
                    rows={5}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes about this lead..."
                  />
                </div>
                <div className="d-flex align-items-center gap-3">
                  <button
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  {saveMessage && (
                    <span className={`small ${saveMessage.includes('success') ? 'text-success' : 'text-danger'}`}>
                      {saveMessage}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Lead Score + Automation History */}
          <div className="col-lg-4">
            {lead.lead_score > 0 && (
              <div className="card admin-table-card mb-4">
                <div className="card-header fw-bold py-3">Lead Score</div>
                <div className="card-body text-center">
                  <div className={`badge ${getScoreBadge(lead.lead_score)} fs-3 px-4 py-2 mb-2`}>
                    {lead.lead_score}
                  </div>
                  <div className="text-muted small">out of 105 possible</div>
                </div>
              </div>
            )}

            {/* Temperature History */}
            {tempHistory.length > 0 && (
              <div className="card admin-table-card mb-4">
                <div className="card-header fw-bold py-3">Temperature History</div>
                <div className="card-body p-0">
                  {tempHistory.slice(0, 5).map((entry: any) => (
                    <div key={entry.id} className="d-flex align-items-center gap-2 px-3 py-2 border-bottom">
                      <TemperatureBadge temperature={entry.previous_temperature} />
                      <span className="text-muted small">&rarr;</span>
                      <TemperatureBadge temperature={entry.new_temperature} />
                      <span className="text-muted small ms-auto">
                        {entry.trigger_type === 'manual' ? 'Manual' : entry.trigger_detail?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card admin-table-card">
              <div className="card-header fw-bold py-3">Automation History</div>
              <div className="card-body">
                {automationHistory.length === 0 ? (
                  <p className="text-muted small mb-0">No automation events yet</p>
                ) : (
                  <div className="timeline">
                    {automationHistory.map((entry) => (
                      <div key={entry.id} className="mb-3 pb-3 border-bottom">
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <span className={`badge ${getTypeBadge(entry.type)} me-2`}>
                              {getTypeLabel(entry.type)}
                            </span>
                            <span className={`badge ${entry.status === 'success' ? 'bg-success' : 'bg-danger'}`}>
                              {entry.status}
                            </span>
                          </div>
                        </div>
                        <div className="text-muted small mt-1">
                          {formatDate(entry.created_at)}
                        </div>
                        {entry.provider_response && (
                          <details className="mt-1">
                            <summary className="text-muted small" style={{ cursor: 'pointer' }}>Response</summary>
                            <pre className="bg-light p-2 rounded small mt-1 mb-0" style={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                              {entry.provider_response}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="card admin-table-card mb-4">
              <div className="card-header fw-bold py-3">Add Activity</div>
              <div className="card-body">
                <AddNoteForm
                  leadId={lead.id}
                  onNoteAdded={() => setActivityRefreshKey((k) => k + 1)}
                />
              </div>
            </div>

            <div className="card admin-table-card">
              <div className="card-header fw-bold py-3">Activity Timeline</div>
              <div className="card-body">
                <ActivityTimeline leadId={lead.id} refreshKey={activityRefreshKey} />
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            {lead.lead_score > 0 && (
              <div className="card admin-table-card mb-4">
                <div className="card-header fw-bold py-3">Lead Score</div>
                <div className="card-body text-center">
                  <div className={`badge ${getScoreBadge(lead.lead_score)} fs-3 px-4 py-2 mb-2`}>
                    {lead.lead_score}
                  </div>
                  <div className="text-muted small">out of 105 possible</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'appointments' && (
        <div className="row g-4">
          <div className="col-lg-8">
            <div className="card admin-table-card">
              <div className="card-header fw-bold py-3 d-flex justify-content-between align-items-center">
                <span>Appointments</span>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowAppointmentModal(true)}
                >
                  Schedule New
                </button>
              </div>
              <div className="card-body">
                {appointments.length === 0 ? (
                  <p className="text-muted small mb-0">No appointments scheduled</p>
                ) : (
                  appointments.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      onUpdated={() => {
                        fetchAppointments();
                        setActivityRefreshKey((k) => k + 1);
                      }}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'strategy' && (
        <div>
          {strategyCalls.length === 0 ? (
            <div className="card admin-table-card">
              <div className="card-body text-center py-4">
                <p className="text-muted mb-0">No strategy calls found for this lead</p>
              </div>
            </div>
          ) : (
            strategyCalls.map((call: any) => {
              const intel = call.intelligence;
              let synthesis: any = null;
              if (intel?.ai_synthesis) {
                try { synthesis = JSON.parse(intel.ai_synthesis); } catch { /* ignore */ }
              }

              return (
                <div key={call.id} className="card admin-table-card mb-4">
                  <div className="card-header fw-bold py-3 d-flex justify-content-between align-items-center">
                    <span>
                      Strategy Call &mdash;{' '}
                      {new Date(call.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <div className="d-flex gap-2">
                      <span className={`badge ${call.status === 'scheduled' ? 'bg-primary' : call.status === 'completed' ? 'bg-success' : call.status === 'no_show' ? 'bg-danger' : 'bg-secondary'}`}>
                        {call.status}
                      </span>
                      {intel && (
                        <span className={`badge ${intel.completion_score >= 60 ? 'bg-success' : intel.completion_score >= 30 ? 'bg-warning text-dark' : 'bg-secondary'}`}>
                          Prep: {intel.completion_score}%
                        </span>
                      )}
                      {intel?.ai_confidence_score !== null && intel?.ai_confidence_score !== undefined && (
                        <span className={`badge ${intel.ai_confidence_score >= 70 ? 'bg-info' : 'bg-warning text-dark'}`}>
                          AI: {intel.ai_confidence_score}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="card-body">
                    {!intel ? (
                      <p className="text-muted small mb-0">No prep form submitted yet</p>
                    ) : (
                      <div className="row g-3">
                        {/* Completion Progress */}
                        <div className="col-12">
                          <div className="progress" style={{ height: 6 }}>
                            <div
                              className={`progress-bar ${intel.completion_score >= 60 ? 'bg-success' : 'bg-primary'}`}
                              style={{ width: `${intel.completion_score}%` }}
                            />
                          </div>
                        </div>

                        {/* Key Fields */}
                        <div className="col-md-4">
                          <div className="text-muted small">AI Maturity</div>
                          <div className="fw-semibold">{intel.ai_maturity_level || '-'}</div>
                        </div>
                        <div className="col-md-4">
                          <div className="text-muted small">Team Size</div>
                          <div className="fw-semibold">{intel.team_size || '-'}</div>
                        </div>
                        <div className="col-md-4">
                          <div className="text-muted small">Timeline</div>
                          <div className="fw-semibold">{(intel.timeline_urgency || '-').replace(/_/g, ' ')}</div>
                        </div>

                        {/* Challenges */}
                        {intel.primary_challenges?.length > 0 && (
                          <div className="col-12">
                            <div className="text-muted small mb-1">Challenges</div>
                            <div className="d-flex flex-wrap gap-1">
                              {intel.primary_challenges.map((c: string) => (
                                <span key={c} className="badge bg-light text-dark border">{c}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Tools */}
                        {intel.current_tools?.length > 0 && (
                          <div className="col-12">
                            <div className="text-muted small mb-1">Current Tools</div>
                            <div className="d-flex flex-wrap gap-1">
                              {intel.current_tools.map((t: string) => (
                                <span key={t} className="badge bg-light text-dark border">{t}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Budget & Consulting */}
                        {(intel.budget_range || intel.evaluating_consultants) && (
                          <div className="col-12">
                            <div className="text-muted small">Budget</div>
                            <div>
                              {intel.budget_range ? intel.budget_range.replace(/_/g, ' ') : 'Not specified'}
                              {intel.evaluating_consultants && <span className="badge bg-warning text-dark ms-2">Evaluating consultants</span>}
                            </div>
                          </div>
                        )}

                        {/* Priority Use Case */}
                        {intel.priority_use_case && (
                          <div className="col-12">
                            <div className="text-muted small">Priority Use Case</div>
                            <div className="bg-light p-2 rounded small">{intel.priority_use_case}</div>
                          </div>
                        )}

                        {/* Questions */}
                        {intel.specific_questions && (
                          <div className="col-12">
                            <div className="text-muted small">Questions for Call</div>
                            <div className="bg-light p-2 rounded small">{intel.specific_questions}</div>
                          </div>
                        )}

                        {/* File Upload */}
                        {intel.uploaded_file_name && (
                          <div className="col-12">
                            <div className="text-muted small">Uploaded Document</div>
                            <div className="badge bg-info">{intel.uploaded_file_name}</div>
                          </div>
                        )}

                        {/* AI Synthesis */}
                        {synthesis && (
                          <div className="col-12">
                            <details>
                              <summary className="fw-semibold small" style={{ cursor: 'pointer' }}>
                                AI Synthesis (Confidence: {intel.ai_confidence_score}%)
                              </summary>
                              <div className="mt-2 bg-light p-3 rounded">
                                <div className="mb-2">
                                  <strong className="small">Executive Summary</strong>
                                  <p className="small mb-2">{synthesis.executive_summary}</p>
                                </div>
                                {synthesis.pain_points?.length > 0 && (
                                  <div className="mb-2">
                                    <strong className="small">Pain Points</strong>
                                    <ul className="small mb-1">
                                      {synthesis.pain_points.map((p: string, i: number) => <li key={i}>{p}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {synthesis.recommended_topics?.length > 0 && (
                                  <div className="mb-2">
                                    <strong className="small">Recommended Topics</strong>
                                    <ul className="small mb-1">
                                      {synthesis.recommended_topics.map((t: string, i: number) => <li key={i}>{t}</li>)}
                                    </ul>
                                  </div>
                                )}
                                <div className="mb-2">
                                  <strong className="small">Suggested Approach</strong>
                                  <p className="small mb-1">{synthesis.suggested_approach}</p>
                                </div>
                                {synthesis.red_flags?.length > 0 && (
                                  <div className="mb-2">
                                    <strong className="small text-danger">Red Flags</strong>
                                    <ul className="small mb-1">
                                      {synthesis.red_flags.map((r: string, i: number) => <li key={i}>{r}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {intel.ai_recommended_focus?.length > 0 && (
                                  <div>
                                    <strong className="small">Focus Areas</strong>
                                    <div className="d-flex flex-wrap gap-1 mt-1">
                                      {intel.ai_recommended_focus.map((f: string) => (
                                        <span key={f} className="badge bg-primary">{f}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      <ScheduleAppointmentModal
        leadId={lead.id}
        leadName={lead.name}
        show={showAppointmentModal}
        onClose={() => setShowAppointmentModal(false)}
        onCreated={() => {
          fetchAppointments();
          setActivityRefreshKey((k) => k + 1);
        }}
      />
    </>
  );
}

export default AdminLeadDetailPage;
