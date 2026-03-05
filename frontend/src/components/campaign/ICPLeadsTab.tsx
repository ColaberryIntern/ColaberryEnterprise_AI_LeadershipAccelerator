import React, { useState, useEffect } from 'react';
import api from '../../utils/api';

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
  role: 'primary' | 'secondary';
  person_titles: string[];
  person_seniorities: string[];
  industries: string[];
  company_size_min: number | null;
  company_size_max: number | null;
  person_locations: string[];
  keywords: string[];
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

interface Props {
  campaignId: string;
  campaignType: string;
  headers: Record<string, string>;
  onRefresh: () => void;
  onSwitchTab?: (tab: string) => void;
}

export default function ICPLeadsTab({ campaignId, campaignType, headers, onRefresh, onSwitchTab }: Props) {
  const [profiles, setProfiles] = useState<ICPProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<Record<string, ICPRecommendation[]>>({});
  const [dismissedRecs, setDismissedRecs] = useState<Set<string>>(new Set());
  const [applyingRec, setApplyingRec] = useState(false);

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

  // Apollo search
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

  // One-click import + enroll
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

  const getGradeBadge = (grade: string | null) => {
    if (!grade) return null;
    const colors: Record<string, string> = { A: 'bg-success', B: 'bg-info', C: 'bg-warning', D: 'bg-danger' };
    return <span className={`badge ${colors[grade] || 'bg-secondary'} ms-2`}>{grade}</span>;
  };

  const getTrendIcon = (trend: string | null) => {
    if (!trend) return null;
    if (trend === 'improving') return <span className="text-success ms-1" title="Improving">&#9650;</span>;
    if (trend === 'declining') return <span className="text-danger ms-1" title="Declining">&#9660;</span>;
    return <span className="text-muted ms-1" title="Stable">&#9644;</span>;
  };

  if (loading) {
    return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;
  }

  return (
    <>
      {/* Section A: ICP Profiles */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>ICP Profiles</span>
          {profiles.length === 0 && (
            <span className="text-muted small">No ICP profiles linked to this campaign</span>
          )}
        </div>
        <div className="card-body">
          {profiles.length === 0 ? (
            <p className="text-muted small mb-0">
              Create ICP profiles using the Campaign Builder to enable Apollo sourcing.
            </p>
          ) : (
            <div className="row g-3">
              {profiles.map((profile) => (
                <div key={profile.id} className="col-md-6">
                  <div className="border rounded p-3">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <div>
                        <span className={`badge ${profile.role === 'primary' ? 'bg-primary' : 'bg-secondary'} me-2`}>
                          {profile.role}
                        </span>
                        <span className="fw-medium">{profile.name}</span>
                        {getGradeBadge(profile.performance_grade)}
                      </div>
                      <div className="d-flex gap-1">
                        <button
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => handleSearchApollo(profile.id)}
                          disabled={apolloSearching}
                        >
                          Search Apollo
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => refreshProfileStats(profile.id)}
                          title="Refresh performance stats"
                        >
                          Refresh
                        </button>
                        <button
                          className="btn btn-outline-info btn-sm"
                          onClick={() => loadRecommendations(profile.id)}
                          title="Load recommendations"
                        >
                          Recs
                        </button>
                      </div>
                    </div>

                    {profile.performance_grade === 'D' && (
                      <div className="alert alert-warning py-1 px-2 mb-2 small">
                        Underperforming — consider adjusting targeting dimensions
                      </div>
                    )}

                    {profile.person_titles?.length > 0 && (
                      <div className="mb-1">
                        <span className="small text-muted">Titles:</span>{' '}
                        {profile.person_titles.map((t, i) => (
                          <span key={i} className="badge bg-light text-dark me-1 small">{t}</span>
                        ))}
                      </div>
                    )}

                    {profile.industries?.length > 0 && (
                      <div className="mb-1">
                        <span className="small text-muted">Industries:</span>{' '}
                        {profile.industries.map((ind, i) => (
                          <span key={i} className="badge bg-light text-dark me-1 small">{ind}</span>
                        ))}
                      </div>
                    )}

                    {(profile.company_size_min || profile.company_size_max) && (
                      <div className="mb-1">
                        <span className="small text-muted">Company size:</span>{' '}
                        <span className="small">{profile.company_size_min || '?'}–{profile.company_size_max || '?'}</span>
                      </div>
                    )}

                    {profile.sample_size != null && profile.sample_size > 0 && (
                      <div className="mt-2 pt-2 border-top">
                        <div className="d-flex gap-3 flex-wrap">
                          <div className="small">
                            <span className="text-muted">Response:</span>{' '}
                            <span className="fw-medium">
                              {profile.response_rate != null ? `${(profile.response_rate * 100).toFixed(1)}%` : '—'}
                            </span>
                            {getTrendIcon(profile.trend)}
                          </div>
                          <div className="small">
                            <span className="text-muted">Booking:</span>{' '}
                            <span className="fw-medium">
                              {profile.booking_rate != null ? `${(profile.booking_rate * 100).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                          <div className="small">
                            <span className="text-muted">Open:</span>{' '}
                            <span className="fw-medium">
                              {profile.open_rate != null ? `${(profile.open_rate * 100).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                          <div className="small">
                            <span className="text-muted">n=</span>
                            <span>{profile.sample_size}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* One-click import button */}
                    <div className="mt-2 pt-2 border-top">
                      <div className="d-flex align-items-center gap-2">
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleImportAndEnroll(profile.id)}
                          disabled={importing}
                        >
                          {importing && searchingProfile === profile.id ? 'Importing...' : 'Import & Enroll from Apollo'}
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
                      </div>
                      {importResult && (
                        <div className="alert alert-info py-1 px-2 mt-2 mb-0 small">
                          Imported {importResult.imported} new leads, {importResult.duplicates} duplicates, {importResult.enrolled} enrolled in campaign
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ICP Recommendations */}
      {profiles.some((p) => (recommendations[p.id] || []).length > 0) && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold">ICP Recommendations</div>
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
            <button className="btn btn-outline-secondary btn-sm" onClick={() => { setSearchingProfile(null); setApolloResults([]); }}>
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
              <p className="text-muted small mb-0">No results found. Try adjusting the ICP profile filters.</p>
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
                          <input type="checkbox" checked={selectedApollo.size === apolloResults.length && apolloResults.length > 0} onChange={toggleAllApollo} />
                        </th>
                        <th>Name</th>
                        <th>Title</th>
                        <th>Company</th>
                        <th>Industry</th>
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
                          <td className="small fw-medium">{person.name || `${person.first_name} ${person.last_name}`}</td>
                          <td className="small">{person.title || '—'}</td>
                          <td className="small">{person.organization?.name || '—'}</td>
                          <td className="small">{person.organization?.industry || '—'}</td>
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

      {/* Section C: Recently Enrolled Leads */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Enrolled Leads ({totalEnrolled})</span>
          {onSwitchTab && (
            <button className="btn btn-outline-primary btn-sm" onClick={() => onSwitchTab('leads')}>
              View All Leads
            </button>
          )}
        </div>
        <div className="card-body">
          {enrolledLeads.length === 0 ? (
            <p className="text-muted small mb-0">No leads enrolled yet. Use the ICP profiles above to import leads from Apollo.</p>
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
                        <span className={`badge bg-${cl.status === 'active' ? 'success' : cl.status === 'enrolled' ? 'info' : 'secondary'}`}>
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
