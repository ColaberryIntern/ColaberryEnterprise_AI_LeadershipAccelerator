import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import LeadDetailModal from './LeadDetailModal';

const GHL_LOCATION_ID = 'JFWwp8q7l6T12NWTIOKG';
const ghlContactUrl = (contactId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`;

interface Props {
  campaignId: string;
  headers: Record<string, string>;
}

interface GhlLeadStatus {
  lead_id: number;
  name: string;
  email: string;
  ghl_contact_id: string | null;
  sync_status: 'synced' | 'not_synced' | 'failed';
}

interface CrmActivity {
  id: string;
  lead_id: number;
  lead_name: string;
  lead_email: string;
  type: string;
  subject: string;
  metadata: Record<string, any>;
  created_at: string;
}

interface GhlStatus {
  interest_group: string | null;
  total_leads: number;
  synced_leads: number;
  leads: GhlLeadStatus[];
  activities: CrmActivity[];
}

export default function CRMTab({ campaignId, headers }: Props) {
  const [ghlStatus, setGhlStatus] = useState<GhlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sendingTestSms, setSendingTestSms] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(null);
  const [selectedLeadName, setSelectedLeadName] = useState('');

  useEffect(() => {
    fetchGhlStatus();
  }, [campaignId]);

  const fetchGhlStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/admin/campaigns/${campaignId}/ghl-status`);
      setGhlStatus(res.data);
    } catch {
      // GHL may not be enabled
    } finally {
      setLoading(false);
    }
  };

  const handleBulkSync = async () => {
    setSyncing(true);
    try {
      const res = await api.post(`/api/admin/campaigns/${campaignId}/ghl-sync`);
      alert(`Sync complete: ${res.data.synced} synced, ${res.data.failed} failed`);
      fetchGhlStatus();
    } catch (err: any) {
      alert('Sync failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleTestSms = async () => {
    setSendingTestSms(true);
    try {
      await api.post(`/api/admin/campaigns/${campaignId}/ghl-test-sms`, {
        message: 'Test SMS from Colaberry Enterprise AI campaign.',
      });
      alert('Test SMS sent via GHL!');
    } catch (err: any) {
      alert('Test SMS failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSendingTestSms(false);
    }
  };

  const relTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <div className="text-muted mt-2 small">Loading CRM status...</div>
      </div>
    );
  }

  if (!ghlStatus) {
    return (
      <div className="text-center py-5 text-muted">
        <i className="bi bi-diagram-3 fs-1 d-block mb-2" />
        GoHighLevel CRM integration is not enabled. Enable it in Settings.
      </div>
    );
  }

  return (
    <>
      {/* GHL CRM Status */}
      <div className="card border-0 shadow-sm mb-4" style={{ borderLeft: '4px solid #1a365d' }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold mb-0" style={{ color: '#1a365d' }}>
              <i className="bi bi-diagram-3 me-2" />GoHighLevel CRM
            </h6>
            <div className="d-flex gap-2">
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={handleBulkSync}
                disabled={syncing}
              >
                {syncing ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" />
                    Syncing...
                  </>
                ) : (
                  'Sync All Leads'
                )}
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={handleTestSms}
                disabled={sendingTestSms}
              >
                {sendingTestSms ? 'Sending...' : 'Send Test SMS'}
              </button>
            </div>
          </div>
          <div className="row g-3">
            <div className="col-md-4">
              <div className="small text-muted">Interest Group</div>
              <div className="fw-medium">
                {ghlStatus.interest_group ? (
                  <span className="badge bg-primary bg-opacity-10 text-primary" style={{ fontSize: '0.8rem' }}>
                    {ghlStatus.interest_group}
                  </span>
                ) : (
                  <span className="text-muted fst-italic">Not generated</span>
                )}
              </div>
            </div>
            <div className="col-md-4">
              <div className="small text-muted">GHL Sync Status</div>
              <div className="fw-medium">
                <span className="text-success">{ghlStatus.synced_leads}</span>
                {' / '}
                <span>{ghlStatus.total_leads}</span>
                {' leads synced'}
                {ghlStatus.total_leads > 0 && (
                  <span className="text-muted ms-1">
                    ({Math.round((ghlStatus.synced_leads / ghlStatus.total_leads) * 100)}%)
                  </span>
                )}
              </div>
            </div>
            <div className="col-md-4">
              <div className="small text-muted">Webhook URL</div>
              <code className="small">/api/webhook/ghl/sms-reply</code>
            </div>
          </div>
        </div>
      </div>

      {/* Lead Sync Status Table */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
          <span>Lead Sync Status</span>
          <button className="btn btn-outline-secondary btn-sm" onClick={fetchGhlStatus} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-1" />Refresh
          </button>
        </div>
        <div className="card-body p-0">
          {ghlStatus.leads.length === 0 ? (
            <div className="text-center py-4 text-muted">No leads enrolled yet.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Lead Name</th>
                    <th>Email</th>
                    <th>GHL Status</th>
                    <th>GHL Link</th>
                  </tr>
                </thead>
                <tbody>
                  {ghlStatus.leads.map((lead) => (
                    <tr key={lead.lead_id}>
                      <td
                        className="fw-medium"
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          setSelectedLeadId(lead.lead_id);
                          setSelectedLeadName(lead.name);
                        }}
                      >
                        <span className="text-primary">{lead.name}</span>
                      </td>
                      <td className="small">{lead.email}</td>
                      <td>
                        <span className={`badge bg-${
                          lead.sync_status === 'synced' ? 'success' :
                          lead.sync_status === 'failed' ? 'danger' : 'secondary'
                        }`}>
                          {lead.sync_status === 'synced' ? 'Synced' :
                           lead.sync_status === 'failed' ? 'Failed' : 'Not Synced'}
                        </span>
                      </td>
                      <td>
                        {lead.ghl_contact_id ? (
                          <a
                            href={ghlContactUrl(lead.ghl_contact_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View in GoHighLevel"
                          >
                            <img src="/ghl-logo.svg" alt="GHL" width="18" height="18" style={{ borderRadius: '3px' }} />
                          </a>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* CRM Event Timeline */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">
          CRM Event Timeline
        </div>
        <div className="card-body p-0">
          {ghlStatus.activities.length === 0 ? (
            <div className="text-center py-4 text-muted">
              No CRM activity recorded yet. Sync leads to generate events.
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {ghlStatus.activities.map((activity) => (
                <div key={activity.id} className="d-flex align-items-start gap-3 p-3 border-bottom">
                  <div className="text-center" style={{ minWidth: 36 }}>
                    <i className={`bi ${
                      activity.metadata?.status === 'success' ? 'bi-check-circle text-success' :
                      activity.metadata?.status === 'failed' ? 'bi-x-circle text-danger' :
                      activity.metadata?.status === 'existing' ? 'bi-link-45deg text-info' :
                      'bi-circle text-muted'
                    } fs-5`} />
                  </div>
                  <div className="flex-grow-1">
                    <div className="d-flex justify-content-between">
                      <div>
                        <span
                          className="fw-medium small text-primary"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setSelectedLeadId(activity.lead_id);
                            setSelectedLeadName(activity.lead_name);
                          }}
                        >
                          {activity.lead_name}
                        </span>
                        <span className="text-muted small ms-2">{activity.subject}</span>
                        {activity.metadata?.test_mode && (
                          <span className="badge bg-warning bg-opacity-10 text-warning ms-2" style={{ fontSize: '0.6rem' }}>TEST</span>
                        )}
                      </div>
                      <span className="text-muted" style={{ fontSize: '0.7rem' }}>{relTime(activity.created_at)}</span>
                    </div>
                    {activity.metadata?.error && (
                      <div className="text-danger small mt-1">{activity.metadata.error}</div>
                    )}
                    {activity.metadata?.ghl_contact_id && (
                      <div className="text-muted mt-1" style={{ fontSize: '0.7rem' }}>
                        Contact: {activity.metadata.ghl_contact_id}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lead Modal */}
      {selectedLeadId && (
        <LeadDetailModal
          campaignId={campaignId}
          leadId={selectedLeadId}
          leadName={selectedLeadName}
          headers={headers}
          onClose={() => setSelectedLeadId(null)}
        />
      )}
    </>
  );
}
