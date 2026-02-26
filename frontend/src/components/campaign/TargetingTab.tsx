import React, { useState, useEffect } from 'react';

interface TargetingCriteria {
  industries?: string[];
  title_patterns?: string[];
  company_size_min?: number;
  company_size_max?: number;
  lead_score_min?: number;
  lead_score_max?: number;
  lead_source_types?: string[];
  [key: string]: any;
}

interface Props {
  campaignId: string;
  targeting_criteria: TargetingCriteria;
  headers: Record<string, string>;
  onRefresh: () => void;
}

export default function TargetingTab({ campaignId, targeting_criteria, headers, onRefresh }: Props) {
  const [criteria, setCriteria] = useState<TargetingCriteria>(targeting_criteria || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [industryInput, setIndustryInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [sourceInput, setSourceInput] = useState('');

  useEffect(() => {
    setCriteria(targeting_criteria || {});
  }, [targeting_criteria]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ targeting_criteria: criteria }),
      });
      setSaved(true);
      onRefresh();
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save targeting:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/matching-leads`, { headers });
      const data = await res.json();
      setMatchCount((data.leads || []).length);
    } catch (err) {
      console.error('Failed to preview:', err);
    }
  };

  const addTag = (field: 'industries' | 'title_patterns' | 'lead_source_types', value: string) => {
    if (!value.trim()) return;
    const current = criteria[field] || [];
    if (!current.includes(value.trim())) {
      setCriteria({ ...criteria, [field]: [...current, value.trim()] });
    }
  };

  const removeTag = (field: 'industries' | 'title_patterns' | 'lead_source_types', idx: number) => {
    const current = [...(criteria[field] || [])];
    current.splice(idx, 1);
    setCriteria({ ...criteria, [field]: current });
  };

  return (
    <>
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">Targeting Criteria</div>
        <div className="card-body">
          {/* Industries */}
          <div className="mb-3">
            <label className="form-label fw-medium">Industries</label>
            <div className="d-flex gap-2 mb-2 flex-wrap">
              {(criteria.industries || []).map((ind, i) => (
                <span key={i} className="badge bg-primary d-flex align-items-center gap-1">
                  {ind}
                  <button className="btn-close btn-close-white" style={{ fontSize: '0.5rem' }}
                    onClick={() => removeTag('industries', i)} />
                </span>
              ))}
            </div>
            <div className="input-group input-group-sm">
              <input
                className="form-control"
                placeholder="Add industry..."
                value={industryInput}
                onChange={(e) => setIndustryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag('industries', industryInput);
                    setIndustryInput('');
                  }
                }}
              />
              <button className="btn btn-outline-primary" onClick={() => {
                addTag('industries', industryInput);
                setIndustryInput('');
              }}>Add</button>
            </div>
          </div>

          {/* Title Patterns */}
          <div className="mb-3">
            <label className="form-label fw-medium">Title Patterns</label>
            <div className="d-flex gap-2 mb-2 flex-wrap">
              {(criteria.title_patterns || []).map((t, i) => (
                <span key={i} className="badge bg-info text-dark d-flex align-items-center gap-1">
                  {t}
                  <button className="btn-close" style={{ fontSize: '0.5rem' }}
                    onClick={() => removeTag('title_patterns', i)} />
                </span>
              ))}
            </div>
            <div className="input-group input-group-sm">
              <input
                className="form-control"
                placeholder="Add title pattern..."
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag('title_patterns', titleInput);
                    setTitleInput('');
                  }
                }}
              />
              <button className="btn btn-outline-info" onClick={() => {
                addTag('title_patterns', titleInput);
                setTitleInput('');
              }}>Add</button>
            </div>
          </div>

          {/* Lead Source Types */}
          <div className="mb-3">
            <label className="form-label fw-medium">Lead Source Types</label>
            <div className="d-flex gap-2 mb-2 flex-wrap">
              {(criteria.lead_source_types || []).map((s, i) => (
                <span key={i} className="badge bg-warning text-dark d-flex align-items-center gap-1">
                  {s}
                  <button className="btn-close" style={{ fontSize: '0.5rem' }}
                    onClick={() => removeTag('lead_source_types', i)} />
                </span>
              ))}
            </div>
            <div className="input-group input-group-sm">
              <input
                className="form-control"
                placeholder="Add source type (e.g. cold, warm, referral)..."
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTag('lead_source_types', sourceInput);
                    setSourceInput('');
                  }
                }}
              />
              <button className="btn btn-outline-warning" onClick={() => {
                addTag('lead_source_types', sourceInput);
                setSourceInput('');
              }}>Add</button>
            </div>
          </div>

          <div className="row g-3 mb-3">
            {/* Company Size Range */}
            <div className="col-md-6">
              <label className="form-label fw-medium">Company Size Range</label>
              <div className="d-flex gap-2">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  placeholder="Min"
                  value={criteria.company_size_min || ''}
                  onChange={(e) => setCriteria({ ...criteria, company_size_min: e.target.value ? parseInt(e.target.value) : undefined })}
                />
                <span className="align-self-center">–</span>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  placeholder="Max"
                  value={criteria.company_size_max || ''}
                  onChange={(e) => setCriteria({ ...criteria, company_size_max: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
            </div>

            {/* Lead Score Range */}
            <div className="col-md-6">
              <label className="form-label fw-medium">Lead Score Range</label>
              <div className="d-flex gap-2">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  placeholder="Min"
                  value={criteria.lead_score_min || ''}
                  onChange={(e) => setCriteria({ ...criteria, lead_score_min: e.target.value ? parseInt(e.target.value) : undefined })}
                />
                <span className="align-self-center">–</span>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  placeholder="Max"
                  value={criteria.lead_score_max || ''}
                  onChange={(e) => setCriteria({ ...criteria, lead_score_max: e.target.value ? parseInt(e.target.value) : undefined })}
                />
              </div>
            </div>
          </div>

          <div className="d-flex gap-2 mt-4">
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Targeting'}
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={handlePreview}>
              Preview Matching Leads
            </button>
            {matchCount !== null && (
              <span className="align-self-center text-muted small">
                {matchCount} matching lead{matchCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
