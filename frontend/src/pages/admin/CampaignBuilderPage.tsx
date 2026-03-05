import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

interface ICPProfileInput {
  name: string;
  description: string;
  role: 'primary' | 'secondary';
  person_titles: string[];
  person_seniorities: string[];
  industries: string[];
  company_size_min: number | '';
  company_size_max: number | '';
  person_locations: string[];
  keywords: string[];
  pain_indicators: string[];
  buying_signals: string[];
}

interface SequenceTemplate {
  id: string;
  name: string;
  stepCount: number;
  steps: any[];
}

interface ApolloPreview {
  profileIndex: number;
  people: any[];
  total: number;
  loading: boolean;
}

const EMPTY_ICP: ICPProfileInput = {
  name: '',
  description: '',
  role: 'primary',
  person_titles: [],
  person_seniorities: [],
  industries: [],
  company_size_min: '',
  company_size_max: '',
  person_locations: [],
  keywords: [],
  pain_indicators: [],
  buying_signals: [],
};

const SENIORITY_OPTIONS = [
  { value: 'c_suite', label: 'C-Suite' },
  { value: 'vp', label: 'VP' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior', label: 'Senior' },
  { value: 'entry', label: 'Entry' },
];

export default function CampaignBuilderPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: ICP Profiles
  const [profiles, setProfiles] = useState<ICPProfileInput[]>([
    { ...EMPTY_ICP, name: 'Executive Decision Makers', role: 'primary' },
  ]);

  // Step 2: Apollo preview
  const [apolloImport, setApolloImport] = useState(true);
  const [maxLeads, setMaxLeads] = useState(100);
  const [apolloPreviews, setApolloPreviews] = useState<ApolloPreview[]>([]);

  // Step 3: Sequence
  const [templates, setTemplates] = useState<SequenceTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('standard_cold');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');

  // Step 4: Campaign info
  const [campaignName, setCampaignName] = useState('');
  const [campaignDescription, setCampaignDescription] = useState('');
  const [createAsActive, setCreateAsActive] = useState(false);

  useEffect(() => {
    api.get('/api/admin/campaigns/sequence-templates').then((res) => {
      setTemplates(res.data.templates || []);
    }).catch(() => {});
  }, []);

  // ── Tag input helper ──────────────────────────────────────────────────

  const TagInput = ({
    label,
    values,
    onChange,
    placeholder,
    badgeClass = 'bg-primary',
  }: {
    label: string;
    values: string[];
    onChange: (v: string[]) => void;
    placeholder: string;
    badgeClass?: string;
  }) => {
    const [input, setInput] = useState('');
    return (
      <div className="mb-3">
        <label className="form-label small fw-medium">{label}</label>
        <div className="d-flex gap-1 mb-2 flex-wrap">
          {values.map((v, i) => (
            <span key={i} className={`badge ${badgeClass} d-flex align-items-center gap-1`}>
              {v}
              <button
                className="btn-close btn-close-white"
                style={{ fontSize: '0.45rem' }}
                onClick={() => onChange(values.filter((_, j) => j !== i))}
              />
            </span>
          ))}
        </div>
        <div className="input-group input-group-sm">
          <input
            className="form-control"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && input.trim()) {
                e.preventDefault();
                if (!values.includes(input.trim())) onChange([...values, input.trim()]);
                setInput('');
              }
            }}
          />
          <button
            className="btn btn-outline-secondary"
            onClick={() => {
              if (input.trim() && !values.includes(input.trim())) onChange([...values, input.trim()]);
              setInput('');
            }}
          >
            Add
          </button>
        </div>
      </div>
    );
  };

  // ── Profile form ──────────────────────────────────────────────────────

  const updateProfile = (idx: number, updates: Partial<ICPProfileInput>) => {
    setProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, ...updates } : p)));
  };

  const renderProfileForm = (profile: ICPProfileInput, idx: number) => (
    <div key={idx} className="card border-0 shadow-sm mb-3">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="fw-semibold">
          {profile.role === 'primary' ? 'Primary ICP' : 'Secondary ICP'} — {profile.name || 'Untitled'}
        </span>
        {profiles.length > 1 && (
          <button
            className="btn btn-outline-danger btn-sm"
            onClick={() => setProfiles((p) => p.filter((_, i) => i !== idx))}
          >
            Remove
          </button>
        )}
      </div>
      <div className="card-body">
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label small fw-medium">Profile Name</label>
            <input
              className="form-control form-control-sm"
              value={profile.name}
              onChange={(e) => updateProfile(idx, { name: e.target.value })}
              placeholder="e.g. Enterprise AI Executives"
            />
          </div>
          <div className="col-md-6">
            <label className="form-label small fw-medium">Role</label>
            <select
              className="form-select form-select-sm"
              value={profile.role}
              onChange={(e) => updateProfile(idx, { role: e.target.value as any })}
            >
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium">Description</label>
          <textarea
            className="form-control form-control-sm"
            rows={2}
            value={profile.description}
            onChange={(e) => updateProfile(idx, { description: e.target.value })}
            placeholder="Describe this ICP segment..."
          />
        </div>

        <TagInput
          label="Job Titles"
          values={profile.person_titles}
          onChange={(v) => updateProfile(idx, { person_titles: v })}
          placeholder="e.g. CTO, VP Engineering, Director AI"
          badgeClass="bg-primary"
        />

        <div className="mb-3">
          <label className="form-label small fw-medium">Seniority Levels</label>
          <div className="d-flex gap-2 flex-wrap">
            {SENIORITY_OPTIONS.map((opt) => (
              <div key={opt.value} className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id={`sen-${idx}-${opt.value}`}
                  checked={profile.person_seniorities.includes(opt.value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...profile.person_seniorities, opt.value]
                      : profile.person_seniorities.filter((s) => s !== opt.value);
                    updateProfile(idx, { person_seniorities: next });
                  }}
                />
                <label className="form-check-label small" htmlFor={`sen-${idx}-${opt.value}`}>
                  {opt.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        <TagInput
          label="Industries"
          values={profile.industries}
          onChange={(v) => updateProfile(idx, { industries: v })}
          placeholder="e.g. SaaS, Financial Services, Healthcare"
          badgeClass="bg-info text-dark"
        />

        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label small fw-medium">Company Size Range</label>
            <div className="d-flex gap-2 align-items-center">
              <input
                type="number"
                className="form-control form-control-sm"
                placeholder="Min"
                value={profile.company_size_min}
                onChange={(e) =>
                  updateProfile(idx, { company_size_min: e.target.value ? parseInt(e.target.value) : '' })
                }
              />
              <span>–</span>
              <input
                type="number"
                className="form-control form-control-sm"
                placeholder="Max"
                value={profile.company_size_max}
                onChange={(e) =>
                  updateProfile(idx, { company_size_max: e.target.value ? parseInt(e.target.value) : '' })
                }
              />
            </div>
          </div>
        </div>

        <TagInput
          label="Locations"
          values={profile.person_locations}
          onChange={(v) => updateProfile(idx, { person_locations: v })}
          placeholder="e.g. United States, United Kingdom"
          badgeClass="bg-secondary"
        />

        <TagInput
          label="Keywords"
          values={profile.keywords}
          onChange={(v) => updateProfile(idx, { keywords: v })}
          placeholder="e.g. enterprise ai, digital transformation"
          badgeClass="bg-dark"
        />

        <TagInput
          label="Pain Indicators"
          values={profile.pain_indicators}
          onChange={(v) => updateProfile(idx, { pain_indicators: v })}
          placeholder="e.g. Manual data processes, AI adoption pressure"
          badgeClass="bg-warning text-dark"
        />

        <TagInput
          label="Buying Signals"
          values={profile.buying_signals}
          onChange={(v) => updateProfile(idx, { buying_signals: v })}
          placeholder="e.g. Hiring AI roles, Budget season"
          badgeClass="bg-success"
        />
      </div>
    </div>
  );

  // ── Apollo preview ────────────────────────────────────────────────────

  const previewApollo = async (profileIdx: number) => {
    const profile = profiles[profileIdx];
    setApolloPreviews((prev) => {
      const next = prev.filter((p) => p.profileIndex !== profileIdx);
      return [...next, { profileIndex: profileIdx, people: [], total: 0, loading: true }];
    });

    try {
      // We need to create a temp profile or just call Apollo directly with filters
      const res = await api.post('/api/admin/apollo/search', {
        q_person_title: profile.person_titles,
        person_seniorities: profile.person_seniorities,
        q_organization_industries: profile.industries,
        organization_num_employees_ranges:
          profile.company_size_min || profile.company_size_max
            ? [`${profile.company_size_min || 1},${profile.company_size_max || 10000}`]
            : undefined,
        person_locations: profile.person_locations,
        q_keywords: profile.keywords.join(' ') || undefined,
        per_page: 10,
        page: 1,
      });

      setApolloPreviews((prev) =>
        prev.map((p) =>
          p.profileIndex === profileIdx
            ? { ...p, people: res.data.people || [], total: res.data.total || 0, loading: false }
            : p,
        ),
      );
    } catch (err: any) {
      setApolloPreviews((prev) =>
        prev.map((p) =>
          p.profileIndex === profileIdx ? { ...p, loading: false } : p,
        ),
      );
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!campaignName.trim()) {
      setError('Campaign name is required');
      return;
    }
    if (profiles.some((p) => !p.name.trim())) {
      setError('All ICP profiles must have a name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const body = {
        name: campaignName.trim(),
        description: campaignDescription.trim(),
        icpProfiles: profiles.map((p) => ({
          ...p,
          company_size_min: p.company_size_min || undefined,
          company_size_max: p.company_size_max || undefined,
        })),
        apolloImport,
        maxLeads,
        sequenceTemplate: selectedTemplate,
        aiSystemPrompt: aiSystemPrompt || undefined,
      };

      const res = await api.post('/api/admin/campaigns/build-cold', body);
      const campaignId = res.data.campaign?.id;

      if (createAsActive && campaignId) {
        await api.post(`/api/admin/campaigns/${campaignId}/activate`);
      }

      navigate(campaignId ? `/admin/campaigns/${campaignId}` : '/admin/campaigns');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create campaign');
    } finally {
      setLoading(false);
    }
  };

  // ── Render steps ──────────────────────────────────────────────────────

  const selectedTemplateData = templates.find((t) => t.id === selectedTemplate);

  return (
    <div>
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/admin/dashboard' },
          { label: 'Campaigns', to: '/admin/campaigns' },
          { label: 'Build Cold Campaign' },
        ]}
      />

      <h2 className="mb-4">Build Cold Outbound Campaign</h2>

      {/* Step indicators */}
      <div className="d-flex gap-2 mb-4">
        {['Define ICPs', 'Source Leads', 'Configure Sequence', 'Review & Create'].map((label, i) => (
          <button
            key={i}
            className={`btn btn-sm ${step === i + 1 ? 'btn-primary' : step > i + 1 ? 'btn-outline-success' : 'btn-outline-secondary'}`}
            onClick={() => setStep(i + 1)}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="alert alert-danger alert-dismissible" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError('')} />
        </div>
      )}

      {/* ── Step 1: Define ICPs ────────────────────────────────────────── */}
      {step === 1 && (
        <>
          <p className="text-muted small mb-3">
            Define your Ideal Customer Profiles. These will be used to search Apollo for matching leads.
          </p>
          {profiles.map((p, i) => renderProfileForm(p, i))}
          <button
            className="btn btn-outline-primary btn-sm mb-4"
            onClick={() =>
              setProfiles((prev) => [
                ...prev,
                { ...EMPTY_ICP, name: 'Technical Decision Makers', role: 'secondary' },
              ])
            }
          >
            + Add Secondary ICP
          </button>
          <div className="d-flex justify-content-end">
            <button className="btn btn-primary" onClick={() => setStep(2)}>
              Next: Source Leads
            </button>
          </div>
        </>
      )}

      {/* ── Step 2: Source Leads ───────────────────────────────────────── */}
      {step === 2 && (
        <>
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">Apollo Lead Sourcing</div>
            <div className="card-body">
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="apolloImport"
                  checked={apolloImport}
                  onChange={(e) => setApolloImport(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="apolloImport">
                  Search and import leads from Apollo on campaign creation
                </label>
              </div>

              {apolloImport && (
                <div className="mb-3">
                  <label className="form-label small fw-medium">Max Leads to Import</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    style={{ maxWidth: '200px' }}
                    value={maxLeads}
                    onChange={(e) => setMaxLeads(parseInt(e.target.value) || 100)}
                    min={1}
                    max={1000}
                  />
                  <div className="form-text">
                    Leads will be split evenly across ICP profiles ({Math.ceil(maxLeads / profiles.length)} per profile)
                  </div>
                </div>
              )}

              <h6 className="mt-4 mb-3">Preview Apollo Results</h6>
              {profiles.map((p, i) => {
                const preview = apolloPreviews.find((ap) => ap.profileIndex === i);
                return (
                  <div key={i} className="mb-3 p-3 border rounded">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <span className="fw-medium">{p.name || `Profile ${i + 1}`}</span>
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={() => previewApollo(i)}
                        disabled={preview?.loading}
                      >
                        {preview?.loading ? 'Searching...' : 'Preview in Apollo'}
                      </button>
                    </div>

                    {preview && !preview.loading && (
                      <>
                        <div className="text-muted small mb-2">
                          {preview.total.toLocaleString()} total matches found
                        </div>
                        {preview.people.length > 0 && (
                          <div className="table-responsive">
                            <table className="table table-sm table-hover mb-0">
                              <thead className="table-light">
                                <tr>
                                  <th>Name</th>
                                  <th>Title</th>
                                  <th>Company</th>
                                  <th>Industry</th>
                                </tr>
                              </thead>
                              <tbody>
                                {preview.people.slice(0, 5).map((person: any, j: number) => (
                                  <tr key={j}>
                                    <td className="small">{person.name || `${person.first_name} ${person.last_name}`}</td>
                                    <td className="small">{person.title}</td>
                                    <td className="small">{person.organization?.name}</td>
                                    <td className="small">{person.organization?.industry}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="d-flex justify-content-between">
            <button className="btn btn-outline-secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>
              Next: Configure Sequence
            </button>
          </div>
        </>
      )}

      {/* ── Step 3: Configure Sequence ────────────────────────────────── */}
      {step === 3 && (
        <>
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">Outreach Sequence</div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label small fw-medium">Sequence Template</label>
                <div className="d-flex gap-2 flex-wrap">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      className={`btn btn-sm ${selectedTemplate === t.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                      onClick={() => setSelectedTemplate(t.id)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {selectedTemplateData && (
                <div className="mb-3">
                  <label className="form-label small fw-medium">Sequence Timeline</label>
                  <div className="list-group list-group-flush">
                    {selectedTemplateData.steps.map((s: any, i: number) => (
                      <div key={i} className="list-group-item px-0 py-2">
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className={`badge ${s.channel === 'voice' ? 'bg-warning text-dark' : s.channel === 'sms' ? 'bg-info text-dark' : 'bg-primary'}`}
                          >
                            {s.channel || 'email'}
                          </span>
                          <span className="small fw-medium">Day {s.delay_days}</span>
                          <span className="small text-muted">— {s.step_goal?.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="small text-muted mt-1" style={{ maxWidth: '600px' }}>
                          {s.ai_instructions?.substring(0, 120)}...
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-3">
                <label className="form-label small fw-medium">Campaign AI System Prompt (optional)</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={4}
                  value={aiSystemPrompt}
                  onChange={(e) => setAiSystemPrompt(e.target.value)}
                  placeholder="Custom instructions for AI-generated content across all steps..."
                />
                <div className="form-text">
                  Leave empty to use the default cold outbound prompt. This prompt guides how AI generates
                  personalized email/voice content for each lead.
                </div>
              </div>
            </div>
          </div>
          <div className="d-flex justify-content-between">
            <button className="btn btn-outline-secondary" onClick={() => setStep(2)}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => setStep(4)}>
              Next: Review & Create
            </button>
          </div>
        </>
      )}

      {/* ── Step 4: Review & Create ───────────────────────────────────── */}
      {step === 4 && (
        <>
          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">Campaign Details</div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label small fw-medium">Campaign Name *</label>
                <input
                  className="form-control form-control-sm"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="e.g. Q1 2026 Enterprise AI Outreach"
                />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-medium">Description</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={2}
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  placeholder="Campaign objectives and notes..."
                />
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">Summary</div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-md-4">
                  <div className="small text-muted">ICP Profiles</div>
                  <div className="fw-medium">
                    {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
                  </div>
                  <ul className="list-unstyled small mt-1">
                    {profiles.map((p, i) => (
                      <li key={i}>
                        <span className={`badge ${p.role === 'primary' ? 'bg-primary' : 'bg-secondary'} me-1`}>
                          {p.role}
                        </span>
                        {p.name}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="col-md-4">
                  <div className="small text-muted">Lead Sourcing</div>
                  <div className="fw-medium">
                    {apolloImport ? `Apollo import (up to ${maxLeads} leads)` : 'Manual enrollment'}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="small text-muted">Sequence</div>
                  <div className="fw-medium">
                    {selectedTemplateData?.name || selectedTemplate}
                  </div>
                  <div className="small text-muted">
                    {selectedTemplateData?.stepCount} steps over{' '}
                    {selectedTemplateData?.steps?.[selectedTemplateData.steps.length - 1]?.delay_days || '?'} days
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-between align-items-center">
            <button className="btn btn-outline-secondary" onClick={() => setStep(3)}>
              Back
            </button>
            <div className="d-flex gap-2 align-items-center">
              <div className="form-check me-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="createActive"
                  checked={createAsActive}
                  onChange={(e) => setCreateAsActive(e.target.checked)}
                />
                <label className="form-check-label small" htmlFor="createActive">
                  Activate immediately
                </label>
              </div>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" />
                    Building Campaign...
                  </>
                ) : (
                  'Create Campaign'
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
