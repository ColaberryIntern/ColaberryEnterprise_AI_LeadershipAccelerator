import React, { useState, useEffect, useCallback } from 'react';
import { useMentorContext } from '../../../contexts/MentorContext';

/* Friendly mentor face SVG — matches the FAB in PortalMentorChat */
const MentorFace = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="32" cy="32" r="30" fill="#eef2ff" stroke="#c7d2fe" strokeWidth="2" />
    <path d="M12 28c0-11 9-20 20-20s20 9 20 20" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" fill="none" />
    <circle cx="22" cy="30" r="3.5" fill="#6366f1" />
    <circle cx="42" cy="30" r="3.5" fill="#6366f1" />
    <circle cx="23.2" cy="28.8" r="1.2" fill="#fff" />
    <circle cx="43.2" cy="28.8" r="1.2" fill="#fff" />
    <path d="M22 40c3 4 8 6 10 6s7-2 10-6" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <rect x="7" y="24" width="6" height="10" rx="3" fill="#8b5cf6" />
    <rect x="51" y="24" width="6" height="10" rx="3" fill="#8b5cf6" />
    <path d="M10 34v6c0 3 2 5 5 5h3" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" fill="none" />
    <circle cx="19" cy="45" r="2" fill="#8b5cf6" />
  </svg>
);

interface RequiredArtifact {
  name: string;
  description: string;
  file_types: string[];
  validation_criteria: string;
  allow_screenshot?: boolean;
  screenshot_validation?: string;
  artifact_definition_id?: string;
}

interface OrchestrationContext {
  sectionConfig: {
    id: string;
    build_phase_flag: boolean;
    github_required_flag: boolean;
    notebooklm_required: boolean;
    notebooklm_instructions: string | null;
    implementation_task_text: string | null;
  } | null;
  artifactDefinitions: Array<{
    id: string;
    name: string;
    description: string;
    artifact_type: string;
    file_types: string[];
    evaluation_criteria: string;
    requires_screenshot: boolean;
    required_for_session: boolean;
    required_for_build_unlock: boolean;
    required_for_presentation_unlock: boolean;
  }>;
  mentorPromptTemplate: {
    system_prompt: string;
    user_prompt_template: string;
  } | null;
  resolvedVariables: Record<string, string>;
}

interface ImplementationTaskProps {
  data: {
    title?: string;
    description?: string;
    requirements?: string[];
    deliverable: string;
    estimated_minutes?: number;
    getting_started?: string[];
    required_artifacts?: RequiredArtifact[];
    scenario?: string;
    steps?: string[];
    evaluation_criteria?: string;
  };
  lessonId: string;
  onSubmit?: () => void;
  initialTaskData?: any;
}

interface ArtifactUpload {
  artifact_index: number;
  submission_id: string;
  file_name: string;
  file_type: string;
  uploaded_at: string;
}

interface GradingResult {
  name: string;
  submission_id: string;
  passed: boolean;
  feedback: string;
  strengths: string[];
  missing_items: string[];
}

function resolveVariablesInText(text: string, vars: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export default function ImplementationTask({ data, lessonId, onSubmit, initialTaskData }: ImplementationTaskProps) {
  const { sendToMentor, onMentorResponded, updateLessonContext } = useMentorContext();

  const [orchContext, setOrchContext] = useState<OrchestrationContext | null>(null);

  // Fetch orchestration context on mount
  useEffect(() => {
    const token = localStorage.getItem('participant_token');
    if (!token || !lessonId) return;
    fetch(`/api/portal/curriculum/lessons/${lessonId}/orchestration-context`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(ctx => { if (ctx) setOrchContext(ctx); })
      .catch(() => {});
  }, [lessonId]);

  // Use admin-defined artifacts if available, otherwise fall back to LLM-generated
  const effectiveArtifacts: RequiredArtifact[] = orchContext?.artifactDefinitions?.length
    ? orchContext.artifactDefinitions.map(a => ({
        name: a.name,
        description: a.description,
        file_types: a.file_types || ['.pdf', '.docx', '.png', '.jpg'],
        validation_criteria: a.evaluation_criteria || '',
        allow_screenshot: a.requires_screenshot || false,
        artifact_definition_id: a.id,
      }))
    : (data.required_artifacts || []);

  const vars = orchContext?.resolvedVariables || {};
  const title = resolveVariablesInText(data.title || 'Implementation Task', vars);
  const description = resolveVariablesInText(data.description || data.scenario || '', vars);
  const requirements = data.requirements || data.steps || [];
  const deliverable = resolveVariablesInText(data.deliverable, vars);
  const estimatedMinutes = data.estimated_minutes || 30;
  const artifacts = effectiveArtifacts;

  const [briefingReceived, setBriefingReceived] = useState(initialTaskData?.briefing_received || false);
  const [briefingWaiting, setBriefingWaiting] = useState(false);
  const [uploads, setUploads] = useState<ArtifactUpload[]>(initialTaskData?.uploads || []);
  const [uploading, setUploading] = useState<number | null>(null);
  const [grading, setGrading] = useState(false);
  // Only restore grading results if they all passed (don't show stale failures on reload)
  const initialGrading = initialTaskData?.grading || [];
  const initialAllPassed = initialGrading.length > 0 && initialGrading.every((r: any) => r.passed);
  const [gradingResults, setGradingResults] = useState<GradingResult[]>(initialAllPassed ? initialGrading : []);
  const [taskCompleted, setTaskCompleted] = useState(initialTaskData?.completed || false);
  const [simulating, setSimulating] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [hasGradedThisSession, setHasGradedThisSession] = useState(initialAllPassed);
  const [notebookUploading, setNotebookUploading] = useState(false);
  const [researchBrief, setResearchBrief] = useState<string | null>(initialTaskData?.research_brief || null);

  const saveProgress = useCallback((extra: Record<string, any> = {}) => {
    const token = localStorage.getItem('participant_token');
    if (!token) return;
    const taskData = {
      briefing_received: briefingReceived, uploads, grading: gradingResults, completed: taskCompleted,
      ...extra,
    };
    fetch(`/api/portal/curriculum/lessons/${lessonId}/task-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(taskData),
    }).catch(() => {});
  }, [briefingReceived, uploads, gradingResults, taskCompleted, lessonId]);

  useEffect(() => {
    updateLessonContext({
      currentSection: 'implementation_task',
      implementationTaskData: {
        title, description, deliverable, requirements,
        artifacts: artifacts.map(a => ({ name: a.name, description: a.description, file_types: a.file_types, validation_criteria: a.validation_criteria })),
      },
    });
    return () => updateLessonContext({ currentSection: '', implementationTaskData: undefined });
  }, [title, description, deliverable, requirements, artifacts, updateLessonContext]);

  const handleMentorResponse = useCallback(() => {
    setBriefingReceived(true);
    setBriefingWaiting(false);
    saveProgress({ briefing_received: true });
  }, [saveProgress]);

  useEffect(() => {
    onMentorResponded.current = handleMentorResponse;
    return () => {
      if (onMentorResponded.current === handleMentorResponse) {
        onMentorResponded.current = null;
      }
    };
  }, [handleMentorResponse, onMentorResponded]);

  const requestBriefing = () => {
    setBriefingWaiting(true);
    const artifactsList = artifacts.length > 0
      ? `\n\nREQUIRED ARTIFACTS TO SUBMIT:\n${artifacts.map((a, i) => `${i + 1}. ${a.name}: ${a.description} (accepted: ${a.file_types.join(', ')})`).join('\n')}`
      : '';

    // Use admin-defined mentor prompt template if available
    let prompt: string;
    if (orchContext?.mentorPromptTemplate?.user_prompt_template) {
      prompt = orchContext.mentorPromptTemplate.user_prompt_template
        + `\n\nASSIGNMENT: ${title}\nDESCRIPTION: ${description}\nDELIVERABLE: ${deliverable}`
        + `\nREQUIREMENTS:\n${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
        + artifactsList;
    } else {
      prompt = `I have an implementation assignment to complete. Break it down for me with a structured action plan.

ASSIGNMENT: ${title}
DESCRIPTION: ${description}

REQUIREMENTS:
${requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

DELIVERABLE: ${deliverable}
${artifactsList}

Please provide a structured briefing with:
1. **Project Overview** -- What this assignment is about and why it matters for my role
2. **Outside Tools Needed** -- What software/tools I'll need (Excel, PowerPoint, etc.)
3. **Task Breakdown** -- A numbered checklist of specific tasks I need to complete. For each task, clearly label it as either:
   - [HUMAN] -- Tasks I must do myself (strategic thinking, decision-making, domain expertise)
   - [AI-ASSISTED] -- Tasks where AI can help (research, drafting, analysis, formatting)
4. **Tips for Success** -- Key things to keep in mind

Format the task breakdown as a clear numbered list with [HUMAN] or [AI-ASSISTED] labels.`;
    }
    sendToMentor(prompt, 'implementation_briefing');
  };

  const handleNotebookUpload = async (file: File) => {
    setNotebookUploading(true);
    const token = localStorage.getItem('participant_token');
    if (!token) { setNotebookUploading(false); return; }
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/portal/curriculum/lessons/${lessonId}/notebooklm-upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const result = await res.json();
        setResearchBrief(result.summary);
        saveProgress({ research_brief: result.summary });
      } else {
        alert('Upload failed. Please try again.');
      }
    } catch {
      alert('Upload failed. Please try again.');
    } finally {
      setNotebookUploading(false);
    }
  };

  const handleFileUpload = async (artifactIndex: number, file: File) => {
    setUploading(artifactIndex);
    const token = localStorage.getItem('participant_token');
    if (!token) { setUploading(null); return; }
    try {
      const createRes = await fetch('/api/portal/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ assignment_type: 'build_lab', title: artifacts[artifactIndex]?.name || `Artifact ${artifactIndex + 1}` }),
      });
      const { submission } = await createRes.json();
      const formData = new FormData();
      formData.append('file', file);
      await fetch(`/api/portal/submissions/${submission.id}/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const newUpload: ArtifactUpload = {
        artifact_index: artifactIndex, submission_id: submission.id,
        file_name: file.name, file_type: file.name.split('.').pop() || '', uploaded_at: new Date().toISOString(),
      };
      const updatedUploads = [...uploads.filter(u => u.artifact_index !== artifactIndex), newUpload];
      setUploads(updatedUploads);
      saveProgress({ uploads: updatedUploads });
    } catch {
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  const handleSubmitForReview = async () => {
    setGrading(true);
    const token = localStorage.getItem('participant_token');
    if (!token) { setGrading(false); return; }
    try {
      const artifactData = uploads.map(u => {
        const artifact = artifacts[u.artifact_index];
        return {
          name: artifact?.name || `Artifact ${u.artifact_index + 1}`,
          submission_id: u.submission_id, file_name: u.file_name, file_type: u.file_type,
          validation_criteria: artifact?.validation_criteria || '',
          is_screenshot: artifact?.allow_screenshot && ['.png', '.jpg', '.jpeg'].includes(`.${u.file_type.toLowerCase()}`),
          artifact_definition_id: artifact?.artifact_definition_id,
        };
      });
      const res = await fetch(`/api/portal/curriculum/lessons/${lessonId}/grade-artifacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ artifacts: artifactData }),
      });
      const result = await res.json();
      setGradingResults(result.grading);
      setHasGradedThisSession(true);
      // Always mark task complete after grading — feedback is informational, not a gate
      setTaskCompleted(true);
      onSubmit?.();
      saveProgress({ grading: result.grading, completed: true });
    } catch {
      alert('Grading failed. Please try again.');
    } finally {
      setGrading(false);
    }
  };

  const simulateSubmission = async (isRetry = false) => {
    setSimulating(true);
    if (isRetry) {
      setGradingResults([]);
      setRetryCount(prev => prev + 1);
    }
    const token = localStorage.getItem('participant_token');
    if (!token) { setSimulating(false); return; }
    const currentRetry = isRetry ? retryCount + 1 : retryCount;
    try {
      const newUploads: ArtifactUpload[] = [];
      for (let ai = 0; ai < artifacts.length; ai++) {
        const artifact = artifacts[ai];
        // On retry, generate richer content that satisfies validation criteria
        const content = currentRetry > 0
          ? `${artifact.name}\n\nAssignment: ${title}\nDescription: ${artifact.description}\n\nThis submission addresses the validation criteria: ${artifact.validation_criteria}\n\nKey deliverables included:\n${(artifact.validation_criteria || '').split(/[,;.]/).filter(Boolean).map(c => `- ${c.trim()}: Completed and verified`).join('\n')}\n\nAll requirements have been met and validated.\nGenerated: ${new Date().toISOString()}`
          : `[SIMULATED] ${artifact.name}\n\nAssignment: ${title}\nDescription: ${artifact.description}\nValidation: ${artifact.validation_criteria}\n\nThis is a simulated submission for testing purposes.\nGenerated at: ${new Date().toISOString()}`;
        const fileName = `${artifact.name.replace(/\s+/g, '_')}_simulated.txt`;
        const blob = new Blob([content], { type: 'text/plain' });
        const file = new File([blob], fileName, { type: 'text/plain' });

        const createRes = await fetch('/api/portal/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ assignment_type: 'build_lab', title: artifact.name }),
        });
        const { submission } = await createRes.json();
        const formData = new FormData();
        formData.append('file', file);
        await fetch(`/api/portal/submissions/${submission.id}/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
        newUploads.push({
          artifact_index: ai, submission_id: submission.id,
          file_name: fileName, file_type: 'txt', uploaded_at: new Date().toISOString(),
        });
      }
      setUploads(newUploads);
      saveProgress({ uploads: newUploads });
      setSimulating(false);

      // Auto-grade after simulation
      if (isRetry) {
        // Small delay so state updates before grading
        setTimeout(() => {
          handleSubmitForReview();
        }, 500);
      }
    } catch {
      alert('Simulation failed. Please try again.');
      setSimulating(false);
    }
  };

  const allArtifactsUploaded = artifacts.length > 0
    ? artifacts.every((_, i) => uploads.some(u => u.artifact_index === i))
    : false;
  const allPassed = gradingResults.length > 0 && gradingResults.every(r => r.passed);
  const failedArtifacts = gradingResults.filter(r => !r.passed);
  const passedCount = gradingResults.filter(r => r.passed).length;
  const scorePercent = gradingResults.length > 0 ? Math.round(passedCount / gradingResults.length * 100) : 0;

  // Workflow steps
  const step2Done = briefingReceived;
  const step3Active = briefingReceived || uploads.length > 0;

  return (
    <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #8b5cf6' }}>
      {/* Pulse animation for briefing button */}
      <style>{`@keyframes mentorPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.02); } }`}</style>

      {/* Header */}
      <div className="card-header bg-white border-bottom d-flex align-items-center gap-2" style={{ padding: '14px 20px' }}>
        <div className="d-flex align-items-center justify-content-center rounded" style={{ width: 28, height: 28, background: '#f5f3ff' }}>
          <i className="bi bi-rocket" style={{ color: '#8b5cf6', fontSize: 14 }}></i>
        </div>
        <span className="fw-semibold" style={{ color: '#1e293b', fontSize: 14 }}>Implementation Task</span>
        <span className="badge" style={{ background: '#f5f3ff', color: '#8b5cf6', fontSize: 10 }}>Hands-On</span>
        {estimatedMinutes > 0 && (
          <span className="ms-auto small" style={{ color: '#94a3b8' }}>
            <i className="bi bi-clock me-1"></i>{estimatedMinutes} min
          </span>
        )}
      </div>

      <div className="card-body" style={{ padding: 20 }}>
        {/* Assignment Brief */}
        <h6 className="fw-bold mb-2" style={{ color: '#1e293b', fontSize: 15 }}>{title}</h6>
        {description && <p className="mb-3" style={{ fontSize: 13, color: '#334155', lineHeight: 1.7 }}>{description}</p>}

        {requirements.length > 0 && (
          <div className="mb-3">
            <span className="text-uppercase fw-bold d-block mb-2" style={{ fontSize: 10, color: '#8b5cf6', letterSpacing: 1 }}>Requirements</span>
            {requirements.map((req, ri) => (
              <div key={ri} className="d-flex align-items-start gap-2 mb-1">
                <span className="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0"
                  style={{ width: 18, height: 18, background: '#eef2ff', color: '#6366f1', fontSize: 10, fontWeight: 700, marginTop: 1 }}>
                  {ri + 1}
                </span>
                <span style={{ fontSize: 12, color: '#334155' }}>{req}</span>
              </div>
            ))}
          </div>
        )}

        <div className="p-2 rounded mb-4" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
          <span className="text-uppercase fw-bold d-block mb-1" style={{ fontSize: 10, color: '#8b5cf6', letterSpacing: 1 }}>Deliverable</span>
          <span style={{ fontSize: 12, color: '#4c1d95' }}>{deliverable}</span>
        </div>

        {/* GitHub required indicator */}
        {orchContext?.sectionConfig?.github_required_flag && (
          <div className="d-flex align-items-center gap-2 p-2 rounded mb-3" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
            <i className="bi bi-github" style={{ fontSize: 16, color: '#1e293b' }}></i>
            <span style={{ fontSize: 12, color: '#0c4a6e', fontWeight: 500 }}>
              GitHub repository required for this task
            </span>
          </div>
        )}

        {/* NotebookLM research upload */}
        {orchContext?.sectionConfig?.notebooklm_required && (
          <div className="p-3 rounded mb-3" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
            <div className="d-flex align-items-center gap-2 mb-2">
              <i className="bi bi-journal-text" style={{ fontSize: 16, color: '#92400e' }}></i>
              <span className="fw-semibold" style={{ fontSize: 12, color: '#92400e' }}>Research Document Upload</span>
            </div>
            {orchContext.sectionConfig.notebooklm_instructions && (
              <p className="mb-2" style={{ fontSize: 11, color: '#78350f' }}>{orchContext.sectionConfig.notebooklm_instructions}</p>
            )}
            {researchBrief ? (
              <div>
                <div className="d-flex align-items-center gap-1 mb-1">
                  <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 12 }}></i>
                  <span style={{ fontSize: 11, color: '#047857', fontWeight: 600 }}>Research brief generated</span>
                </div>
                <div className="p-2 rounded" style={{ background: '#fff', border: '1px solid #e5e7eb', maxHeight: 120, overflow: 'auto', fontSize: 11, color: '#374151' }}>
                  {researchBrief.substring(0, 500)}{researchBrief.length > 500 ? '...' : ''}
                </div>
              </div>
            ) : (
              <label className="d-flex flex-column align-items-center justify-content-center p-3 rounded" style={{
                border: '2px dashed #fbbf24', background: '#fffbeb', cursor: 'pointer', minHeight: 60,
              }}>
                {notebookUploading ? (
                  <><span className="spinner-border spinner-border-sm mb-1" style={{ width: 14, height: 14, color: '#d97706' }}></span>
                  <span style={{ fontSize: 11, color: '#d97706' }}>Processing document...</span></>
                ) : (
                  <>
                    <i className="bi bi-cloud-arrow-up mb-1" style={{ fontSize: 16, color: '#d97706' }}></i>
                    <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>Upload PDF or document for research</span>
                    <span style={{ fontSize: 10, color: '#b45309' }}>PDF, DOCX, TXT (max 10MB)</span>
                  </>
                )}
                <input type="file" className="d-none" accept=".pdf,.docx,.doc,.txt,.md"
                  onChange={(e) => e.target.files?.[0] && handleNotebookUpload(e.target.files[0])}
                  disabled={notebookUploading} />
              </label>
            )}
          </div>
        )}

        {/* Divider */}
        <hr style={{ borderColor: '#e2e8f0', margin: '0 0 16px 0' }} />

        {/* YOUR WORKFLOW */}
        <span className="text-uppercase fw-bold d-block mb-3" style={{ fontSize: 10, color: '#64748b', letterSpacing: 1 }}>Your Workflow</span>

        <div style={{ paddingLeft: 4 }}>
          {/* Step 1: Review Assignment */}
          <div className="d-flex align-items-start gap-3 mb-1">
            <div className="d-flex flex-column align-items-center" style={{ width: 24 }}>
              <div className="d-flex align-items-center justify-content-center rounded-circle"
                style={{ width: 24, height: 24, background: '#10b981', flexShrink: 0 }}>
                <i className="bi bi-check-lg" style={{ color: '#fff', fontSize: 12 }}></i>
              </div>
            </div>
            <span className="fw-semibold" style={{ fontSize: 13, color: '#047857' }}>Review Assignment</span>
          </div>
          {/* Connector */}
          <div style={{ width: 24, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 2, height: 16, background: '#10b981' }} />
          </div>

          {/* Step 2: Get AI Mentor Briefing */}
          <div className="d-flex align-items-start gap-3 mb-1">
            <div className="d-flex flex-column align-items-center" style={{ width: 24 }}>
              <div className="d-flex align-items-center justify-content-center rounded-circle"
                style={{
                  width: 24, height: 24, flexShrink: 0,
                  background: step2Done ? '#10b981' : '#fff',
                  border: step2Done ? 'none' : '2px solid #8b5cf6',
                }}>
                {step2Done ? (
                  <i className="bi bi-check-lg" style={{ color: '#fff', fontSize: 12 }}></i>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#8b5cf6' }}>2</span>
                )}
              </div>
            </div>
            <div className="flex-grow-1">
              <span className="fw-semibold" style={{ fontSize: 13, color: step2Done ? '#047857' : '#1e293b' }}>
                Get AI Mentor Briefing
              </span>
              {!step2Done && !briefingWaiting && (
                <div className="mt-2">
                  <button
                    className="btn btn-sm d-flex align-items-center gap-2 px-3 py-2"
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                      color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none',
                    }}
                    onClick={requestBriefing}
                  >
                    <MentorFace size={20} /> Ask AI Mentor
                  </button>
                  <p className="mb-0 mt-1" style={{ fontSize: 11, color: '#94a3b8' }}>
                    Your mentor will prepare a plan and open your workspace
                  </p>
                </div>
              )}
              {briefingWaiting && (
                <div className="mt-2">
                  <button
                    className="btn btn-sm d-flex align-items-center gap-2 px-3 py-2"
                    disabled
                    style={{
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                      color: '#fff', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none',
                      animation: 'mentorPulse 1.5s ease-in-out infinite',
                    }}
                  >
                    <MentorFace size={20} /> Preparing briefing...
                  </button>
                </div>
              )}
              {step2Done && (
                <span style={{ fontSize: 11, color: '#047857' }}>
                  <i className="bi bi-check-circle me-1"></i>Briefing received in AI Mentor chat
                </span>
              )}
            </div>
          </div>
          {/* Connector */}
          <div style={{ width: 24, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 2, height: 16, background: step2Done ? '#10b981' : '#e2e8f0' }} />
          </div>

          {/* Step 3: Submit & Get Graded */}
          <div className="d-flex align-items-start gap-3">
            <div className="d-flex flex-column align-items-center" style={{ width: 24 }}>
              <div className="d-flex align-items-center justify-content-center rounded-circle"
                style={{
                  width: 24, height: 24, flexShrink: 0,
                  background: taskCompleted ? '#10b981' : '#fff',
                  border: taskCompleted ? 'none' : `2px solid ${step3Active ? '#8b5cf6' : '#cbd5e1'}`,
                }}>
                {taskCompleted ? (
                  <i className="bi bi-check-lg" style={{ color: '#fff', fontSize: 12 }}></i>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 700, color: step3Active ? '#8b5cf6' : '#94a3b8' }}>3</span>
                )}
              </div>
            </div>
            <div className="flex-grow-1">
              <span className="fw-semibold" style={{ fontSize: 13, color: step3Active ? '#1e293b' : '#94a3b8' }}>
                Submit & Get Graded
              </span>

              {!step3Active && (
                <p className="mb-0 mt-1" style={{ fontSize: 11, color: '#94a3b8' }}>
                  Upload your required artifacts for AI grading
                </p>
              )}

              {step3Active && artifacts.length > 0 && (
                <div className="mt-3">
                  {artifacts.map((artifact, ai) => {
                    const upload = uploads.find(u => u.artifact_index === ai);
                    const gradingResult = gradingResults.find(g => g.name === artifact.name);
                    const failed = gradingResult && !gradingResult.passed;

                    return (
                      <div key={ai} className="mb-3">
                        {/* Artifact header */}
                        <div className="d-flex align-items-center gap-2 mb-1">
                          <div className="d-flex align-items-center justify-content-center rounded-circle"
                            style={{ width: 18, height: 18, background: upload && !failed ? '#ecfdf5' : '#f8fafc', border: `1px solid ${upload && !failed ? '#a7f3d0' : '#e2e8f0'}` }}>
                            {upload && !failed ? (
                              <i className="bi bi-check" style={{ color: '#10b981', fontSize: 10 }}></i>
                            ) : failed ? (
                              <i className="bi bi-x" style={{ color: '#ef4444', fontSize: 10 }}></i>
                            ) : null}
                          </div>
                          <span className="text-uppercase fw-bold" style={{ fontSize: 10, color: '#475569', letterSpacing: 0.5 }}>
                            {artifact.name}
                          </span>
                        </div>
                        <p className="mb-2" style={{ fontSize: 11, color: '#64748b' }}>{artifact.description}</p>

                        {/* Upload area */}
                        {upload ? (
                          <div className="d-flex align-items-center gap-2 p-2 rounded" style={{ background: failed ? '#fef2f2' : '#ecfdf5', border: `1px solid ${failed ? '#fecaca' : '#a7f3d0'}` }}>
                            <i className="bi bi-file-earmark-check" style={{ color: failed ? '#ef4444' : '#047857', fontSize: 14 }}></i>
                            <span style={{ fontSize: 12, color: failed ? '#991b1b' : '#047857' }}>{upload.file_name}</span>
                            <label className="btn btn-sm ms-auto" style={{ fontSize: 11, color: '#6366f1', cursor: 'pointer', padding: '2px 8px', border: '1px solid #c7d2fe', borderRadius: 6 }}>
                              Replace
                              <input type="file" className="d-none" accept={artifact.file_types.join(',')}
                                onChange={(e) => e.target.files?.[0] && handleFileUpload(ai, e.target.files[0])} />
                            </label>
                          </div>
                        ) : (
                          <label className="d-flex flex-column align-items-center justify-content-center p-3 rounded" style={{
                            border: '2px dashed #c7d2fe', background: '#faf9ff', cursor: 'pointer', minHeight: 70,
                          }}>
                            {uploading === ai ? (
                              <><span className="spinner-border spinner-border-sm mb-1" style={{ width: 16, height: 16, color: '#8b5cf6' }}></span>
                              <span style={{ fontSize: 11, color: '#8b5cf6' }}>Uploading...</span></>
                            ) : (
                              <>
                                <i className="bi bi-cloud-arrow-up mb-1" style={{ fontSize: 18, color: '#8b5cf6' }}></i>
                                <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>Click to upload</span>
                                <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                  {artifact.file_types.join(', ')}{artifact.allow_screenshot ? ', screenshots' : ''} (max 10MB)
                                </span>
                              </>
                            )}
                            <input type="file" className="d-none" accept={artifact.file_types.join(',')}
                              onChange={(e) => e.target.files?.[0] && handleFileUpload(ai, e.target.files[0])}
                              disabled={uploading === ai} />
                          </label>
                        )}
                      </div>
                    );
                  })}

                  {/* Submit for AI Grading */}
                  <button
                    className="btn d-flex align-items-center justify-content-center gap-2 w-100 py-2 mt-2"
                    style={{
                      background: allArtifactsUploaded ? 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' : '#94a3b8',
                      color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none',
                    }}
                    disabled={!allArtifactsUploaded || grading}
                    onClick={handleSubmitForReview}
                  >
                    {grading ? (
                      <><span className="spinner-border spinner-border-sm"></span> Reviewing submissions...</>
                    ) : (
                      <><i className="bi bi-send"></i> Submit for AI Grading</>
                    )}
                  </button>
                  {!allArtifactsUploaded && (
                    <p className="text-center mb-0 mt-1" style={{ fontSize: 10, color: '#94a3b8' }}>
                      Upload all required artifacts to enable submission
                    </p>
                  )}

                  {/* Simulate Submission */}
                  <button
                    className="btn d-flex align-items-center justify-content-center gap-2 w-100 py-2 mt-2"
                    style={{
                      background: '#fff', color: '#8b5cf6', borderRadius: 8, fontSize: 12, fontWeight: 500,
                      border: '1px dashed #c7d2fe',
                    }}
                    onClick={() => simulateSubmission(false)}
                    disabled={simulating}
                  >
                    {simulating ? (
                      <><span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }}></span> Simulating...</>
                    ) : (
                      <><i className="bi bi-lightning"></i> Simulate Submission (Demo)</>
                    )}
                  </button>
                </div>
              )}

              {/* No artifacts -- just mark complete */}
              {step3Active && artifacts.length === 0 && !taskCompleted && (
                <button
                  className="btn d-flex align-items-center gap-2 px-4 py-2 mt-3"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none',
                  }}
                  onClick={() => { setTaskCompleted(true); onSubmit?.(); saveProgress({ completed: true }); }}
                >
                  <i className="bi bi-check-circle"></i> Mark Task as Complete
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Grading Report Card — only show after user actively grades */}
        {hasGradedThisSession && gradingResults.length > 0 && (
          <div className="mt-4 p-3 rounded" style={{
            background: allPassed ? '#ecfdf5' : '#fefce8',
            border: `1px solid ${allPassed ? '#a7f3d0' : '#fde68a'}`,
          }}>
            {/* Score */}
            <div className="text-center mb-3">
              <div style={{
                fontSize: 40, fontWeight: 800, lineHeight: 1,
                color: allPassed ? '#10b981' : scorePercent >= 50 ? '#f59e0b' : '#ef4444',
              }}>
                {scorePercent}%
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                {passedCount}/{gradingResults.length} artifact{gradingResults.length > 1 ? 's' : ''} passed
              </div>
              {allPassed && (
                <div className="d-flex align-items-center justify-content-center gap-2 mt-2">
                  <i className="bi bi-check-circle-fill" style={{ color: '#10b981', fontSize: 16 }}></i>
                  <span className="fw-bold" style={{ color: '#047857', fontSize: 14 }}>All artifacts approved!</span>
                </div>
              )}
              {!allPassed && (
                <div className="d-flex align-items-center justify-content-center gap-2 mt-2">
                  <i className="bi bi-exclamation-triangle" style={{ color: '#f59e0b', fontSize: 16 }}></i>
                  <span className="fw-bold" style={{ color: '#92400e', fontSize: 13 }}>
                    {failedArtifacts.length} artifact{failedArtifacts.length > 1 ? 's' : ''} need{failedArtifacts.length === 1 ? 's' : ''} revision
                  </span>
                </div>
              )}
            </div>

            {/* Per-artifact results */}
            {gradingResults.map((result, ri) => (
              <div key={ri} className="p-2 rounded mb-2" style={{
                background: result.passed ? '#f0fdf4' : '#fff7ed',
                border: `1px solid ${result.passed ? '#bbf7d0' : '#fed7aa'}`,
              }}>
                <div className="d-flex align-items-center gap-2 mb-1">
                  {result.passed ? (
                    <span className="badge" style={{ background: '#dcfce7', color: '#166534', fontSize: 10 }}>PASS</span>
                  ) : (
                    <span className="badge" style={{ background: '#fee2e2', color: '#991b1b', fontSize: 10 }}>NEEDS WORK</span>
                  )}
                  <span className="fw-semibold" style={{ fontSize: 12, color: '#1e293b' }}>{result.name}</span>
                </div>
                <p className="mb-1" style={{ fontSize: 11, color: '#475569' }}>{result.feedback}</p>
                {result.strengths.length > 0 && (
                  <div className="mb-1">
                    <span style={{ fontSize: 10, color: '#047857', fontWeight: 600 }}>Strengths:</span>
                    <ul className="mb-0 ps-3" style={{ fontSize: 11, color: '#047857' }}>
                      {result.strengths.map((s, si) => <li key={si}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {result.missing_items.length > 0 && (
                  <div>
                    <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 600 }}>Missing:</span>
                    <ul className="mb-0 ps-3" style={{ fontSize: 11, color: '#dc2626' }}>
                      {result.missing_items.map((item, mi) => <li key={mi}>{item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            {/* Retry button when not all passed */}
            {!allPassed && (
              <button
                className="btn d-flex align-items-center justify-content-center gap-2 w-100 py-2 mt-2"
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none',
                }}
                onClick={() => simulateSubmission(true)}
                disabled={simulating || grading}
              >
                {simulating || grading ? (
                  <><span className="spinner-border spinner-border-sm"></span> Retrying...</>
                ) : (
                  <><i className="bi bi-arrow-clockwise"></i> Retry Simulation</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
