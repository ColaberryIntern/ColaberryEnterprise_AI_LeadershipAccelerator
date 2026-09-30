import React, { useCallback, useEffect, useState } from 'react';
import api from '../../../utils/api';
import { SectionCard, StatusBadge } from '../shell';

/**
 * Strategy call prep, lifted VERBATIM out of AdminLeadDetailPage.
 *
 * The 360 profile is replacing that page, so this had to move with its rendering
 * intact — the AI synthesis block, the completion and confidence badges, the
 * challenge and tool chips. Retyping it would have quietly dropped a branch;
 * lifting it means both pages render the same thing because it IS the same
 * thing.
 *
 * It fetches for itself, so a caller needs only a leadId.
 */

interface Props { leadId: number; }

export default function LeadStrategyPrep({ leadId }: Props) {
  // eslint-disable-next-line
  const [strategyCalls, setStrategyCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await api.get(`/api/admin/leads/${leadId}/strategy-prep`);
      const rows = Array.isArray(res.data) ? res.data : res.data?.strategyCalls;
      setStrategyCalls(Array.isArray(rows) ? rows : []);
    } catch {
      // "No strategy calls" and "could not load" are different statements, and
      // rendering the first for the second is the failure this whole workstream
      // has been removing.
      setStrategyCalls([]);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <div className="text-center py-4"><div className="spinner-border text-primary" /></div>;
  }

  if (failed) {
    return (
      <SectionCard>
        <p className="text-danger small mb-0 text-center py-3">
          Could not load strategy prep. This is not the same as there being none.
        </p>
      </SectionCard>
    );
  }

  return (
<div>

        {strategyCalls.length === 0 ? (

          <SectionCard>

            <div className="text-center py-4">

              <p className="text-muted mb-0">No strategy calls found for this lead</p>

            </div>

          </SectionCard>

        ) : (

          strategyCalls.map((call: any) => {

            const intel = call.intelligence;

            let synthesis: any = null;

            if (intel?.ai_synthesis) {

              try { synthesis = JSON.parse(intel.ai_synthesis); } catch { /* ignore */ }

            }



            return (

              <div key={call.id} className="mb-4">

                <SectionCard

                  title={`Strategy Call — ${new Date(call.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}

                  actions={

                    <div className="d-flex gap-2">

                      <StatusBadge

                        label={call.status}

                        tone={call.status === 'scheduled' ? 'primary' : call.status === 'completed' ? 'success' : call.status === 'no_show' ? 'danger' : 'neutral'}

                      />

                      {intel && (

                        <StatusBadge

                          label={`Prep: ${intel.completion_score}%`}

                          tone={intel.completion_score >= 60 ? 'success' : intel.completion_score >= 30 ? 'warning' : 'neutral'}

                        />

                      )}

                      {intel?.ai_confidence_score !== null && intel?.ai_confidence_score !== undefined && (

                        <StatusBadge

                          label={`AI: ${intel.ai_confidence_score}%`}

                          tone={intel.ai_confidence_score >= 70 ? 'info' : 'warning'}

                        />

                      )}

                    </div>

                  }

                >

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

                              <StatusBadge key={c} label={c} tone="neutral" />

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

                              <StatusBadge key={t} label={t} tone="neutral" />

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

                            {intel.evaluating_consultants && <span className="ms-2"><StatusBadge label="Evaluating consultants" tone="warning" /></span>}

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

                          <StatusBadge label={intel.uploaded_file_name} tone="info" />

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

                                      <StatusBadge key={f} label={f} tone="primary" />

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

                </SectionCard>

              </div>

            );

          })

        )}

      </div>
  );
}
