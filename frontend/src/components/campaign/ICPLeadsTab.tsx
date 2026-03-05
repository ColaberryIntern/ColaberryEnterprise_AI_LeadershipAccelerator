import { useState, useEffect } from 'react';
import api from '../../utils/api';

// ── Types ──────────────────────────────────────────────────────────────

interface ICPRecommendation {
  type: 'add' | 'remove' | 'adjust';
  dimension: string;
  value: string;
  reason: string;
  metric_value: number;
  metric_name: string;
  sample_size: number;
  confidence: number;
}

interface ICPProfile {
  id: string;
  name: string;
  description: string;
  role: 'primary' | 'secondary';
  person_titles: string[];
  person_seniorities: string[];
  industries: string[];
  company_size_min: number | null;
  company_size_max: number | null;
  person_locations: string[];
  keywords: string[];
  pain_indicators: string[];
  buying_signals: string[];
  apollo_filters: Record<string, any>;
  response_rate: number | null;
  booking_rate: number | null;
  open_rate: number | null;
  conversion_rate: number | null;
  sample_size: number | null;
  confidence_score: number | null;
  performance_grade: string | null;
  trend: string | null;
  recommendation_data: ICPRecommendation[] | null;
  last_computed_at: string | null;
}

interface ApolloResult {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string;
  linkedin_url?: string;
  organization?: {
    name: string;
    industry: string;
    estimated_num_employees?: number;
    annual_revenue_printed?: string;
  };
}

interface EnrolledLead {
  id: string;
  lead_id: number;
  enrolled_at: string;
  status: string;
  lead: {
    id: number;
    name: string;
    email: string;
    company: string;
    title: string;
  };
}

interface ICPFormState {
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

interface Props {
  campaignId: string;
  campaignType: string;
  headers: Record<string, string>;
  onRefresh: () => void;
  onSwitchTab?: (tab: string) => void;
}

const SENIORITY_OPTIONS = [
  { value: 'c_suite', label: 'C-Suite' },
  { value: 'vp', label: 'VP' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'senior', label: 'Senior' },
  { value: 'entry', label: 'Entry' },
];

const EMPTY_FORM: ICPFormState = {
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

// ── Tag Input Component ────────────────────────────────────────────────

function TagInput({
  tags,
  onAdd,
  onRemove,
  placeholder,
  badgeClass = 'bg-primary',
}: {
  tags: string[];
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
  placeholder: string;
  badgeClass?: string;
}) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    if (input.trim()) {
      onAdd(input.trim());
      setInput('');
    }
  };

  return (
    <div>
      {tags.length > 0 && (
        <div className="d-flex gap-1 mb-2 flex-wrap">
          {tags.map((tag, i) => (
            <span key={i} className={`badge ${badgeClass} d-flex align-items-center gap-1`}>
              {tag}
              <button
                className="btn-close btn-close-white"
                style={{ fontSize: '0.45rem' }}
                onClick={() => onRemove(i)}
              />
            </span>
          ))}
        </div>
      )}
      <div className="input-group input-group-sm">
        <input
          className="form-control"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <button className="btn btn-outline-secondary" onClick={handleAdd}>
          Add
        </button>
      </div>
    </div>
  );
}

// ── ICP Form (Create or Edit) ──────────────────────────────────────────

function ICPForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  submitLabel,
}: {
  form: ICPFormState;
  setForm: React.Dispatch<React.SetStateAction<ICPFormState>>;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const addTag = (field: keyof ICPFormState, value: string) => {
    const current = form[field] as string[];
    if (!current.includes(value)) {
      setForm((prev) => ({ ...prev, [field]: [...current, value] }));
    }
  };

  const removeTag = (field: keyof ICPFormState, index: number) => {
    const current = [...(form[field] as string[])];
    current.splice(index, 1);
    setForm((prev) => ({ ...prev, [field]: current }));
  };

  const toggleSeniority = (value: string) => {
    setForm((prev) => ({
      ...prev,
      person_seniorities: prev.person_seniorities.includes(value)
        ? prev.person_seniorities.filter((s) => s !== value)
        : [...prev.person_seniorities, value],
    }));
  };

  return (
    <div className="border rounded p-3">
      {/* Row 1: Name, Role */}
      <div className="row g-3 mb-3">
        <div className="col-md-8">
          <label className="form-label small fw-medium">Profile Name</label>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. Enterprise AI Executives"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>
        <div className="col-md-4">
          <label className="form-label small fw-medium">Role</label>
          <select
            className="form-select form-select-sm"
            value={form.role}
            onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as 'primary' | 'secondary' }))}
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>
        </div>
      </div>

      {/* Description */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Description</label>
        <textarea
          className="form-control form-control-sm"
          rows={2}
          placeholder="Describe who this ICP targets..."
          value={form.description}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />
      </div>

      {/* Apollo Targeting Section */}
      <div className="mb-2">
        <h6 className="text-muted small text-uppercase fw-semibold mb-3" style={{ letterSpacing: '0.05em' }}>
          Apollo Targeting Criteria
        </h6>
      </div>

      {/* Job Titles */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Job Titles</label>
        <TagInput
          tags={form.person_titles}
          onAdd={(v) => addTag('person_titles', v)}
          onRemove={(i) => removeTag('person_titles', i)}
          placeholder="e.g. CTO, VP Engineering, Director of AI..."
          badgeClass="bg-primary"
        />
        <div className="form-text">People with these exact titles will be matched in Apollo</div>
      </div>

      {/* Seniority Levels */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Seniority Levels</label>
        <div className="d-flex gap-2 flex-wrap">
          {SENIORITY_OPTIONS.map((opt) => (
            <div key={opt.value} className="form-check form-check-inline">
              <input
                className="form-check-input"
                type="checkbox"
                id={`seniority-${opt.value}`}
                checked={form.person_seniorities.includes(opt.value)}
                onChange={() => toggleSeniority(opt.value)}
              />
              <label className="form-check-label small" htmlFor={`seniority-${opt.value}`}>
                {opt.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Industries */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Industries</label>
        <TagInput
          tags={form.industries}
          onAdd={(v) => addTag('industries', v)}
          onRemove={(i) => removeTag('industries', i)}
          placeholder="e.g. SaaS, Financial Services, Healthcare..."
          badgeClass="bg-info text-dark"
        />
      </div>

      {/* Company Size */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Company Size (Employees)</label>
        <div className="d-flex gap-2 align-items-center">
          <input
            type="number"
            className="form-control form-control-sm"
            style={{ width: '120px' }}
            placeholder="Min"
            value={form.company_size_min}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                company_size_min: e.target.value ? parseInt(e.target.value) : '',
              }))
            }
          />
          <span className="text-muted">to</span>
          <input
            type="number"
            className="form-control form-control-sm"
            style={{ width: '120px' }}
            placeholder="Max"
            value={form.company_size_max}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                company_size_max: e.target.value ? parseInt(e.target.value) : '',
              }))
            }
          />
          <span className="text-muted small">employees</span>
        </div>
      </div>

      {/* Locations */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Person Locations</label>
        <TagInput
          tags={form.person_locations}
          onAdd={(v) => addTag('person_locations', v)}
          onRemove={(i) => removeTag('person_locations', i)}
          placeholder="e.g. United States, California, New York..."
          badgeClass="bg-secondary"
        />
      </div>

      {/* Keywords */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Keywords</label>
        <TagInput
          tags={form.keywords}
          onAdd={(v) => addTag('keywords', v)}
          onRemove={(i) => removeTag('keywords', i)}
          placeholder="e.g. enterprise ai, digital transformation, machine learning..."
          badgeClass="bg-dark"
        />
        <div className="form-text">Keywords searched across profiles and company descriptions</div>
      </div>

      {/* Intelligence Section */}
      <div className="mb-2 mt-4">
        <h6 className="text-muted small text-uppercase fw-semibold mb-3" style={{ letterSpacing: '0.05em' }}>
          AI Personalization Intelligence
        </h6>
        <div className="form-text mb-3">
          These fields are passed to the AI when generating outreach messages — they help the AI craft highly personalized, relevant content for each lead.
        </div>
      </div>

      {/* Pain Indicators */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Pain Indicators</label>
        <TagInput
          tags={form.pain_indicators}
          onAdd={(v) => addTag('pain_indicators', v)}
          onRemove={(i) => removeTag('pain_indicators', i)}
          placeholder="e.g. Manual data processes, AI adoption pressure, Compliance burden..."
          badgeClass="bg-warning text-dark"
        />
        <div className="form-text">Business challenges these leads likely face</div>
      </div>

      {/* Buying Signals */}
      <div className="mb-3">
        <label className="form-label small fw-medium">Buying Signals</label>
        <TagInput
          tags={form.buying_signals}
          onAdd={(v) => addTag('buying_signals', v)}
          onRemove={(i) => removeTag('buying_signals', i)}
          placeholder="e.g. Hiring AI roles, Budget season, Recent funding..."
          badgeClass="bg-success"
        />
        <div className="form-text">Signals that indicate readiness to purchase</div>
      </div>

      {/* Actions */}
      <div className="d-flex gap-2 mt-4">
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving || !form.name.trim()}>
          {saving ? 'Saving...' : submitLabel}
        </button>
        <button className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Profile Detail Card (Read-only with Edit toggle) ───────────────────

function ProfileCard({
  profile,
  onEdit,
  onDelete,
  onSearchApollo,
  onImportAndEnroll,
  onRefreshStats,
  onLoadRecs,
  apolloSearching,
  importing,
  maxLeads,
  setMaxLeads,
  importResult,
}: {
  profile: ICPProfile;
  onEdit: () => void;
  onDelete: () => void;
  onSearchApollo: () => void;
  onImportAndEnroll: () => void;
  onRefreshStats: () => void;
  onLoadRecs: () => void;
  apolloSearching: boolean;
  importing: boolean;
  maxLeads: number;
  setMaxLeads: (n: number) => void;
  importResult: { imported: number; duplicates: number; enrolled: number } | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const getGradeBadge = (grade: string | null) => {
    if (!grade) return null;
    const colors: Record<string, string> = { A: 'bg-success', B: 'bg-info', C: 'bg-warning', D: 'bg-danger' };
    return <span className={`badge ${colors[grade] || 'bg-secondary'} ms-1`}>{grade}</span>;
  };

  const getTrendIcon = (trend: string | null) => {
    if (!trend) return null;
    if (trend === 'improving') return <span className="text-success ms-1" title="Improving">&#9650;</span>;
    if (trend === 'declining') return <span className="text-danger ms-1" title="Declining">&#9660;</span>;
    return <span className="text-muted ms-1" title="Stable">&#9644;</span>;
  };

  const hasTargeting =
    profile.person_titles?.length > 0 ||
    profile.person_seniorities?.length > 0 ||
    profile.industries?.length > 0 ||
    profile.person_locations?.length > 0 ||
    profile.keywords?.length > 0 ||
    profile.company_size_min ||
    profile.company_size_max;

  return (
    <div className="border rounded p-3 mb-3">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-start mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <span className={`badge ${profile.role === 'primary' ? 'bg-primary' : 'bg-secondary'}`}>
              {profile.role}
            </span>
            <span className="fw-semibold">{profile.name}</span>
            {getGradeBadge(profile.performance_grade)}
            {getTrendIcon(profile.trend)}
          </div>
          {profile.description && <p className="text-muted small mb-0 mt-1">{profile.description}</p>}
        </div>
        <div className="d-flex gap-1">
          <button className="btn btn-outline-secondary btn-sm" onClick={onEdit} title="Edit profile">
            Edit
          </button>
          {!confirmDelete ? (
            <button className="btn btn-outline-danger btn-sm" onClick={() => setConfirmDelete(true)} title="Delete profile">
              Delete
            </button>
          ) : (
            <>
              <button className="btn btn-danger btn-sm" onClick={onDelete}>Confirm</button>
              <button className="btn btn-outline-secondary btn-sm" onClick={() => setConfirmDelete(false)}>No</button>
            </>
          )}
        </div>
      </div>

      {profile.performance_grade === 'D' && (
        <div className="alert alert-warning py-1 px-2 mb-3 small">
          Underperforming profile — consider adjusting targeting or reviewing recommendations
        </div>
      )}

      {/* Targeting Details Grid */}
      {hasTargeting ? (
        <div className="row g-2 mb-3">
          {profile.person_titles?.length > 0 && (
            <div className="col-md-6">
              <div className="small text-muted fw-medium mb-1">Job Titles</div>
              <div className="d-flex gap-1 flex-wrap">
                {profile.person_titles.map((t, i) => (
                  <span key={i} className="badge bg-primary">{t}</span>
                ))}
              </div>
            </div>
          )}
          {profile.person_seniorities?.length > 0 && (
            <div className="col-md-6">
              <div className="small text-muted fw-medium mb-1">Seniority</div>
              <div className="d-flex gap-1 flex-wrap">
                {profile.person_seniorities.map((s, i) => {
                  const opt = SENIORITY_OPTIONS.find((o) => o.value === s);
                  return <span key={i} className="badge bg-secondary">{opt?.label || s}</span>;
                })}
              </div>
            </div>
          )}
          {profile.industries?.length > 0 && (
            <div className="col-md-6">
              <div className="small text-muted fw-medium mb-1">Industries</div>
              <div className="d-flex gap-1 flex-wrap">
                {profile.industries.map((ind, i) => (
                  <span key={i} className="badge bg-info text-dark">{ind}</span>
                ))}
              </div>
            </div>
          )}
          {(profile.company_size_min || profile.company_size_max) && (
            <div className="col-md-6">
              <div className="small text-muted fw-medium mb-1">Company Size</div>
              <span className="small">{profile.company_size_min || 'Any'} – {profile.company_size_max || 'Any'} employees</span>
            </div>
          )}
          {profile.person_locations?.length > 0 && (
            <div className="col-md-6">
              <div className="small text-muted fw-medium mb-1">Locations</div>
              <div className="d-flex gap-1 flex-wrap">
                {profile.person_locations.map((loc, i) => (
                  <span key={i} className="badge bg-secondary">{loc}</span>
                ))}
              </div>
            </div>
          )}
          {profile.keywords?.length > 0 && (
            <div className="col-md-6">
              <div className="small text-muted fw-medium mb-1">Keywords</div>
              <div className="d-flex gap-1 flex-wrap">
                {profile.keywords.map((kw, i) => (
                  <span key={i} className="badge bg-dark">{kw}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="alert alert-info py-1 px-2 mb-3 small">
          No targeting criteria defined yet — click Edit to add job titles, industries, company size, and more.
        </div>
      )}

      {/* Intelligence (Pain / Buying Signals) */}
      {(profile.pain_indicators?.length > 0 || profile.buying_signals?.length > 0) && (
        <div className="row g-2 mb-3">
          {profile.pain_indicators?.length > 0 && (
            <div className="col-md-6">
              <div className="small text-muted fw-medium mb-1">Pain Indicators</div>
              <div className="d-flex gap-1 flex-wrap">
                {profile.pain_indicators.map((p, i) => (
                  <span key={i} className="badge bg-warning text-dark">{p}</span>
                ))}
              </div>
            </div>
          )}
          {profile.buying_signals?.length > 0 && (
            <div className="col-md-6">
              <div className="small text-muted fw-medium mb-1">Buying Signals</div>
              <div className="d-flex gap-1 flex-wrap">
                {profile.buying_signals.map((b, i) => (
                  <span key={i} className="badge bg-success">{b}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Performance Metrics */}
      {profile.sample_size != null && profile.sample_size > 0 && (
        <div className="border-top pt-2 mb-3">
          <div className="d-flex gap-4 flex-wrap">
            <div className="small">
              <span className="text-muted">Response Rate:</span>{' '}
              <span className="fw-medium">{profile.response_rate != null ? `${(profile.response_rate * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="small">
              <span className="text-muted">Booking Rate:</span>{' '}
              <span className="fw-medium">{profile.booking_rate != null ? `${(profile.booking_rate * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="small">
              <span className="text-muted">Open Rate:</span>{' '}
              <span className="fw-medium">{profile.open_rate != null ? `${(profile.open_rate * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="small">
              <span className="text-muted">Conversion:</span>{' '}
              <span className="fw-medium">{profile.conversion_rate != null ? `${(profile.conversion_rate * 100).toFixed(1)}%` : '—'}</span>
            </div>
            <div className="small">
              <span className="text-muted">Leads sampled:</span> <span>{profile.sample_size}</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="d-flex gap-2 flex-wrap align-items-center border-top pt-3">
        <button className="btn btn-primary btn-sm" onClick={onSearchApollo} disabled={apolloSearching}>
          {apolloSearching ? 'Searching...' : 'Search Apollo'}
        </button>
        <button className="btn btn-success btn-sm" onClick={onImportAndEnroll} disabled={importing}>
          {importing ? 'Importing...' : 'Import & Enroll'}
        </button>
        <div className="d-flex align-items-center gap-1">
          <label className="small text-muted mb-0">Max:</label>
          <input
            type="number"
            className="form-control form-control-sm"
            style={{ width: '70px' }}
            value={maxLeads}
            onChange={(e) => setMaxLeads(parseInt(e.target.value) || 100)}
            min={1}
            max={1000}
          />
        </div>
        <div className="ms-auto d-flex gap-1">
          <button className="btn btn-outline-secondary btn-sm" onClick={onRefreshStats} title="Refresh performance stats">
            Refresh Stats
          </button>
          <button className="btn btn-outline-info btn-sm" onClick={onLoadRecs} title="Load AI recommendations">
            Recommendations
          </button>
        </div>
      </div>

      {importResult && (
        <div className="alert alert-info py-1 px-2 mt-2 mb-0 small">
          Imported {importResult.imported} new leads, {importResult.duplicates} duplicates skipped, {importResult.enrolled} enrolled in campaign
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export default function ICPLeadsTab({ campaignId, headers, onRefresh, onSwitchTab }: Props) {
  const [profiles, setProfiles] = useState<ICPProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Record<string, ICPRecommendation[]>>({});
  const [dismissedRecs, setDismissedRecs] = useState<Set<string>>(new Set());
  const [applyingRec, setApplyingRec] = useState(false);

  // Create / Edit form state
  const [showForm, setShowForm] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [form, setForm] = useState<ICPFormState>({ ...EMPTY_FORM });
  const [formSaving, setFormSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Apollo search state
  const [searchingProfile, setSearchingProfile] = useState<string | null>(null);
  const [apolloResults, setApolloResults] = useState<ApolloResult[]>([]);
  const [apolloTotal, setApolloTotal] = useState(0);
  const [apolloSearching, setApolloSearching] = useState(false);
  const [selectedApollo, setSelectedApollo] = useState<Set<string>>(new Set());

  // Import + enroll state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; duplicates: number; enrolled: number } | null>(null);
  const [maxLeads, setMaxLeads] = useState(100);

  // Enrolled leads summary
  const [enrolledLeads, setEnrolledLeads] = useState<EnrolledLead[]>([]);
  const [totalEnrolled, setTotalEnrolled] = useState(0);

  useEffect(() => {
    loadProfiles();
    loadEnrolledLeads();
  }, [campaignId]);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/admin/icp-profiles', { params: { campaign_id: campaignId } });
      setProfiles(res.data.profiles || []);
    } catch (err) {
      console.error('Failed to load ICP profiles:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEnrolledLeads = async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/leads?limit=5`, { headers });
      const data = await res.json();
      setEnrolledLeads(data.leads || []);
      setTotalEnrolled(data.total || (data.leads || []).length);
    } catch (err) {
      console.error('Failed to load enrolled leads:', err);
    }
  };

  // ── Create / Edit ────────────────────────────────────────────────────

  const openCreateForm = async () => {
    setEditingProfileId(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
    setGenerating(true);
    try {
      const res = await api.post(`/api/admin/campaigns/${campaignId}/generate-icp`);
      const p = res.data.profile;
      if (p) {
        setForm({
          name: p.name || '',
          description: p.description || '',
          role: 'primary',
          person_titles: p.person_titles || [],
          person_seniorities: p.person_seniorities || [],
          industries: p.industries || [],
          company_size_min: p.company_size_min || '',
          company_size_max: p.company_size_max || '',
          person_locations: p.person_locations || [],
          keywords: p.keywords || [],
          pain_indicators: p.pain_indicators || [],
          buying_signals: p.buying_signals || [],
        });
      }
    } catch (err) {
      console.error('Failed to generate ICP profile:', err);
    } finally {
      setGenerating(false);
    }
  };

  const openEditForm = (profile: ICPProfile) => {
    setEditingProfileId(profile.id);
    setForm({
      name: profile.name,
      description: profile.description || '',
      role: profile.role,
      person_titles: profile.person_titles || [],
      person_seniorities: profile.person_seniorities || [],
      industries: profile.industries || [],
      company_size_min: profile.company_size_min || '',
      company_size_max: profile.company_size_max || '',
      person_locations: profile.person_locations || [],
      keywords: profile.keywords || [],
      pain_indicators: profile.pain_indicators || [],
      buying_signals: profile.buying_signals || [],
    });
    setShowForm(true);
  };

  const handleSaveForm = async () => {
    setFormSaving(true);
    try {
      const payload: any = {
        name: form.name,
        description: form.description,
        role: form.role,
        person_titles: form.person_titles,
        person_seniorities: form.person_seniorities,
        industries: form.industries,
        company_size_min: form.company_size_min || null,
        company_size_max: form.company_size_max || null,
        person_locations: form.person_locations,
        keywords: form.keywords,
        pain_indicators: form.pain_indicators,
        buying_signals: form.buying_signals,
      };

      if (editingProfileId) {
        await api.patch(`/api/admin/icp-profiles/${editingProfileId}`, payload);
      } else {
        payload.campaign_id = campaignId;
        await api.post('/api/admin/icp-profiles', payload);
      }

      setShowForm(false);
      setEditingProfileId(null);
      await loadProfiles();
    } catch (err) {
      console.error('Failed to save ICP profile:', err);
    } finally {
      setFormSaving(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    try {
      await api.delete(`/api/admin/icp-profiles/${profileId}`);
      await loadProfiles();
    } catch (err) {
      console.error('Failed to delete ICP profile:', err);
    }
  };

  // ── Recommendations ──────────────────────────────────────────────────

  const refreshProfileStats = async (profileId: string) => {
    try {
      await api.post(`/api/admin/icp-profiles/${profileId}/refresh-stats`);
      await loadProfiles();
    } catch (err) {
      console.error('Failed to refresh stats:', err);
    }
  };

  const loadRecommendations = async (profileId: string) => {
    try {
      const res = await api.get(`/api/admin/icp-profiles/${profileId}/recommendations`);
      setRecommendations((prev) => ({ ...prev, [profileId]: res.data.recommendations || [] }));
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    }
  };

  const handleApplyRec = async (profileId: string, rec: ICPRecommendation) => {
    setApplyingRec(true);
    try {
      await api.post(`/api/admin/icp-profiles/${profileId}/apply-recommendation`, rec);
      await loadProfiles();
      await loadRecommendations(profileId);
    } catch (err) {
      console.error('Failed to apply recommendation:', err);
    } finally {
      setApplyingRec(false);
    }
  };

  const dismissRec = (profileId: string, rec: ICPRecommendation) => {
    setDismissedRecs((prev) => new Set(prev).add(`${profileId}:${rec.type}:${rec.dimension}:${rec.value}`));
  };

  // ── Apollo Search ────────────────────────────────────────────────────

  const handleSearchApollo = async (profileId: string) => {
    setSearchingProfile(profileId);
    setApolloSearching(true);
    setApolloResults([]);
    setSelectedApollo(new Set());
    setImportResult(null);
    try {
      const res = await api.post(`/api/admin/icp-profiles/${profileId}/search`, { page: 1, per_page: 25 });
      setApolloResults(res.data.people || []);
      setApolloTotal(res.data.total || 0);
    } catch (err) {
      console.error('Apollo search failed:', err);
    } finally {
      setApolloSearching(false);
    }
  };

  const handleImportAndEnroll = async (profileId: string) => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.post(`/api/admin/icp-profiles/${profileId}/search-and-enroll`, {
        campaign_id: campaignId,
        max_leads: maxLeads,
      });
      setImportResult({
        imported: res.data.imported,
        duplicates: res.data.duplicates,
        enrolled: res.data.enrolled,
      });
      await loadEnrolledLeads();
      onRefresh();
    } catch (err) {
      console.error('Import and enroll failed:', err);
    } finally {
      setImporting(false);
    }
  };

  const toggleApolloSelect = (id: string) => {
    setSelectedApollo((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllApollo = () => {
    if (selectedApollo.size === apolloResults.length) {
      setSelectedApollo(new Set());
    } else {
      setSelectedApollo(new Set(apolloResults.map((r) => r.id)));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Section A: ICP Profiles */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>ICP Profiles ({profiles.length})</span>
          {!showForm && (
            <button className="btn btn-primary btn-sm" onClick={openCreateForm} disabled={generating}>
              {generating ? 'Generating...' : '+ Add ICP Profile'}
            </button>
          )}
        </div>
        <div className="card-body">
          {/* Create / Edit Form */}
          {showForm && (
            <div className="mb-4">
              <div className="d-flex align-items-center gap-2 mb-3">
                <h6 className="fw-semibold mb-0">
                  {editingProfileId ? 'Edit ICP Profile' : 'Create ICP Profile'}
                </h6>
                {generating && (
                  <span className="d-flex align-items-center gap-1 text-primary small">
                    <span className="spinner-border spinner-border-sm" role="status">
                      <span className="visually-hidden">Generating...</span>
                    </span>
                    AI is generating your ideal customer profile...
                  </span>
                )}
              </div>
              <ICPForm
                form={form}
                setForm={setForm}
                onSave={handleSaveForm}
                onCancel={() => {
                  setShowForm(false);
                  setEditingProfileId(null);
                }}
                saving={formSaving}
                submitLabel={editingProfileId ? 'Save Changes' : 'Create Profile'}
              />
            </div>
          )}

          {/* Profile Cards */}
          {profiles.length === 0 && !showForm ? (
            <div className="text-center py-4">
              <p className="text-muted mb-2">No ICP profiles linked to this campaign yet.</p>
              <p className="text-muted small">
                Click below and AI will generate the perfect customer profile based on your campaign — titles, industries, company size, pain points, and buying signals.
              </p>
              <button className="btn btn-primary" onClick={openCreateForm} disabled={generating}>
                {generating ? (
                  <span className="d-flex align-items-center gap-2">
                    <span className="spinner-border spinner-border-sm" role="status">
                      <span className="visually-hidden">Generating...</span>
                    </span>
                    Generating Ideal Customer Profile...
                  </span>
                ) : (
                  'Generate Ideal Customer Profile'
                )}
              </button>
            </div>
          ) : (
            profiles.map((profile) => (
              <ProfileCard
                key={profile.id}
                profile={profile}
                onEdit={() => openEditForm(profile)}
                onDelete={() => handleDeleteProfile(profile.id)}
                onSearchApollo={() => handleSearchApollo(profile.id)}
                onImportAndEnroll={() => handleImportAndEnroll(profile.id)}
                onRefreshStats={() => refreshProfileStats(profile.id)}
                onLoadRecs={() => loadRecommendations(profile.id)}
                apolloSearching={apolloSearching && searchingProfile === profile.id}
                importing={importing && searchingProfile === profile.id}
                maxLeads={maxLeads}
                setMaxLeads={setMaxLeads}
                importResult={searchingProfile === profile.id ? importResult : null}
              />
            ))
          )}
        </div>
      </div>

      {/* ICP Recommendations */}
      {profiles.some((p) => (recommendations[p.id] || []).length > 0) && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">AI Recommendations</div>
          <div className="card-body">
            {profiles.map((profile) => {
              const recs = (recommendations[profile.id] || []).filter(
                (r) => !dismissedRecs.has(`${profile.id}:${r.type}:${r.dimension}:${r.value}`),
              );
              if (recs.length === 0) return null;
              return (
                <div key={profile.id} className="mb-3">
                  <div className="small fw-medium text-muted mb-2">{profile.name}</div>
                  {recs.map((rec, i) => (
                    <div key={i} className="d-flex align-items-center gap-2 mb-2 p-2 border rounded">
                      <span className={`badge ${rec.type === 'add' ? 'bg-success' : rec.type === 'remove' ? 'bg-danger' : 'bg-info'}`}>
                        {rec.type === 'add' ? '+' : rec.type === 'remove' ? '-' : '~'}
                      </span>
                      <div className="flex-grow-1 small">
                        <span className="fw-medium">{rec.type === 'add' ? 'Add' : rec.type === 'remove' ? 'Remove' : 'Adjust'}</span>{' '}
                        <span className="fw-medium">{rec.value}</span>{' '}
                        <span className="text-muted">({rec.dimension})</span>
                        <br />
                        <span className="text-muted">{rec.reason}</span>
                      </div>
                      <div className="d-flex gap-1">
                        <button
                          className="btn btn-outline-success btn-sm"
                          onClick={() => handleApplyRec(profile.id, rec)}
                          disabled={applyingRec}
                        >
                          Apply
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => dismissRec(profile.id, rec)}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section B: Apollo Search Results */}
      {searchingProfile && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Apollo Search Results</span>
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={() => {
                setSearchingProfile(null);
                setApolloResults([]);
              }}
            >
              Close
            </button>
          </div>
          <div className="card-body">
            {apolloSearching ? (
              <div className="text-center py-3">
                <div className="spinner-border spinner-border-sm" role="status">
                  <span className="visually-hidden">Searching Apollo...</span>
                </div>
                <span className="ms-2 small text-muted">Searching Apollo...</span>
              </div>
            ) : apolloResults.length === 0 ? (
              <p className="text-muted small mb-0">
                No results found. Try adjusting the ICP profile targeting criteria.
              </p>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="small text-muted">
                    Showing {apolloResults.length} of {apolloTotal} results
                    {selectedApollo.size > 0 && ` (${selectedApollo.size} selected)`}
                  </span>
                  <button
                    className="btn btn-success btn-sm"
                    onClick={() => handleImportAndEnroll(searchingProfile)}
                    disabled={importing}
                  >
                    {importing ? 'Importing...' : `Import & Enroll All (up to ${maxLeads})`}
                  </button>
                </div>
                <div className="table-responsive">
                  <table className="table table-hover table-sm mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: '30px' }}>
                          <input
                            type="checkbox"
                            checked={selectedApollo.size === apolloResults.length && apolloResults.length > 0}
                            onChange={toggleAllApollo}
                          />
                        </th>
                        <th>Name</th>
                        <th>Title</th>
                        <th>Company</th>
                        <th>Industry</th>
                        <th>Size</th>
                        <th>Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apolloResults.map((person) => (
                        <tr key={person.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedApollo.has(person.id)}
                              onChange={() => toggleApolloSelect(person.id)}
                            />
                          </td>
                          <td className="small fw-medium">
                            {person.name || `${person.first_name} ${person.last_name}`}
                            {person.linkedin_url && (
                              <a href={person.linkedin_url} target="_blank" rel="noreferrer" className="ms-1 text-primary" title="LinkedIn">
                                &#128279;
                              </a>
                            )}
                          </td>
                          <td className="small">{person.title || '—'}</td>
                          <td className="small">{person.organization?.name || '—'}</td>
                          <td className="small">{person.organization?.industry || '—'}</td>
                          <td className="small">{person.organization?.estimated_num_employees?.toLocaleString() || '—'}</td>
                          <td className="small">{person.email || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Section C: Enrolled Leads */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Enrolled Leads ({totalEnrolled})</span>
          {onSwitchTab && totalEnrolled > 0 && (
            <button className="btn btn-outline-primary btn-sm" onClick={() => onSwitchTab('leads')}>
              View All Leads
            </button>
          )}
        </div>
        <div className="card-body">
          {enrolledLeads.length === 0 ? (
            <p className="text-muted small mb-0">
              No leads enrolled yet. Create an ICP profile above and use "Import & Enroll" to source leads from Apollo.
            </p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover table-sm mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Enrolled</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledLeads.map((cl) => (
                    <tr key={cl.id}>
                      <td className="small fw-medium">{cl.lead?.name || '—'}</td>
                      <td className="small">{cl.lead?.company || '—'}</td>
                      <td className="small">{cl.lead?.title || '—'}</td>
                      <td>
                        <span
                          className={`badge bg-${cl.status === 'active' ? 'success' : cl.status === 'enrolled' ? 'info' : 'secondary'}`}
                        >
                          {cl.status}
                        </span>
                      </td>
                      <td className="small text-muted">
                        {cl.enrolled_at ? new Date(cl.enrolled_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalEnrolled > 5 && (
                <div className="text-center mt-2">
                  <span className="small text-muted">Showing 5 of {totalEnrolled} leads</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
