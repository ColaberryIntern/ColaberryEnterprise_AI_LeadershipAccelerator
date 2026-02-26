import React, { useState } from 'react';
import TemperatureBadge from '../TemperatureBadge';
import LeadDetailModal from './LeadDetailModal';

interface CampaignLead {
  id: string;
  lead_id: number;
  status: string;
  enrolled_at: string;
  outcome: string | null;
  current_step_index?: number;
  total_steps?: number;
  touchpoint_count?: number;
  response_count?: number;
  last_activity_at?: string | null;
  lead: {
    id: number;
    name: string;
    email: string;
    company: string;
    title: string;
    lead_score: number;
    lead_source_type: string;
    lead_temperature?: string;
  };
}

interface Props {
  campaignId: string;
  leads: CampaignLead[];
  headers: Record<string, string>;
  onShowMatchingLeads: () => void;
  onRemoveLead: (leadId: number) => void;
  onRefresh: () => void;
}

export default function LeadsOutreachTab({
  campaignId, leads, headers, onShowMatchingLeads, onRemoveLead, onRefresh,
}: Props) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterTemp, setFilterTemp] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedLead, setSelectedLead] = useState<CampaignLead | null>(null);
  const [bulkAction, setBulkAction] = useState('');
  const [processing, setProcessing] = useState(false);

  const filtered = leads.filter((cl) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      cl.lead?.name?.toLowerCase().includes(q) ||
      cl.lead?.email?.toLowerCase().includes(q) ||
      cl.lead?.company?.toLowerCase().includes(q);
    const matchesStatus = filterStatus === 'all' || cl.status === filterStatus;
    const matchesTemp = filterTemp === 'all' || cl.lead?.lead_temperature === filterTemp;
    return matchesSearch && matchesStatus && matchesTemp;
  });

  const toggleSelect = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((cl) => cl.lead_id)));
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setProcessing(true);
    try {
      const ids = Array.from(selectedIds);
      if (bulkAction === 'remove') {
        for (const id of ids) {
          await fetch(`/api/admin/campaigns/${campaignId}/leads/${id}`, { method: 'DELETE', headers });
        }
      } else if (bulkAction === 'pause' || bulkAction === 'resume') {
        const newStatus = bulkAction === 'pause' ? 'paused' : 'active';
        for (const id of ids) {
          await fetch(`/api/admin/campaigns/${campaignId}/leads/${id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: newStatus }),
          });
        }
      }
      setSelectedIds(new Set());
      setBulkAction('');
      onRefresh();
    } catch (err) {
      console.error('Bulk action failed:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = () => {
    const csvHeader = 'Name,Email,Company,Title,Score,Temperature,Status,Enrolled\n';
    const csvRows = leads.map((cl) =>
      `"${cl.lead?.name}","${cl.lead?.email}","${cl.lead?.company}","${cl.lead?.title}",${cl.lead?.lead_score},"${cl.lead?.lead_temperature || 'cold'}","${cl.status}","${new Date(cl.enrolled_at).toLocaleDateString()}"`
    ).join('\n');
    const blob = new Blob([csvHeader + csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-leads-export.csv`;
    a.click();
  };

  const statusCounts: Record<string, number> = {};
  leads.forEach((cl) => {
    statusCounts[cl.status] = (statusCounts[cl.status] || 0) + 1;
  });

  return (
    <>
      {/* Controls */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 250 }}
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 150 }}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="removed">Removed</option>
        </select>
        <select
          className="form-select form-select-sm"
          style={{ maxWidth: 150 }}
          value={filterTemp}
          onChange={(e) => setFilterTemp(e.target.value)}
        >
          <option value="all">All Temps</option>
          <option value="cold">Cold</option>
          <option value="cool">Cool</option>
          <option value="warm">Warm</option>
          <option value="hot">Hot</option>
          <option value="qualified">Qualified</option>
        </select>
        <div className="ms-auto d-flex gap-2">
          <button className="btn btn-outline-primary btn-sm" onClick={onShowMatchingLeads}>
            + Enroll Matching
          </button>
          <button className="btn btn-outline-secondary btn-sm" onClick={handleExport}>
            Export CSV
          </button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="alert alert-info d-flex align-items-center gap-2 py-2 mb-3">
          <span className="small fw-medium">{selectedIds.size} selected</span>
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 150 }}
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
          >
            <option value="">Choose action...</option>
            <option value="pause">Pause</option>
            <option value="resume">Resume</option>
            <option value="remove">Remove</option>
          </select>
          <button
            className="btn btn-sm btn-primary"
            disabled={!bulkAction || processing}
            onClick={handleBulkAction}
          >
            {processing ? 'Processing...' : 'Apply'}
          </button>
        </div>
      )}

      {/* Status mini counts */}
      <div className="d-flex gap-3 mb-3">
        {Object.entries(statusCounts).map(([s, c]) => (
          <span key={s} className="text-muted small">
            <span className="fw-medium text-dark">{c}</span> {s}
          </span>
        ))}
      </div>

      {/* Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
                  </th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Temperature</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Touchpoints</th>
                  <th>Enrolled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cl) => (
                  <tr key={cl.id}>
                    <td>
                      <input type="checkbox" checked={selectedIds.has(cl.lead_id)} onChange={() => toggleSelect(cl.lead_id)} />
                    </td>
                    <td
                      className="fw-medium"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedLead(cl)}
                    >
                      {cl.lead?.name}
                    </td>
                    <td>{cl.lead?.company}</td>
                    <td><TemperatureBadge temperature={cl.lead?.lead_temperature} /></td>
                    <td>{cl.lead?.lead_score}</td>
                    <td>
                      <span className={`badge bg-${
                        cl.status === 'active' ? 'success' :
                        cl.status === 'completed' ? 'info' :
                        cl.status === 'paused' ? 'warning' : 'secondary'
                      }`}>
                        {cl.status}
                      </span>
                    </td>
                    <td>{cl.touchpoint_count || 0}</td>
                    <td className="small">{new Date(cl.enrolled_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => onRemoveLead(cl.lead_id)}
                        title="Remove"
                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                      >
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-4 text-muted small">
              {leads.length === 0 ? 'No leads enrolled yet.' : 'No leads match your filters.'}
            </div>
          )}
        </div>
      </div>

      {/* Lead Modal */}
      {selectedLead && (
        <LeadDetailModal
          campaignId={campaignId}
          leadId={selectedLead.lead_id}
          leadName={selectedLead.lead?.name || 'Lead'}
          headers={headers}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </>
  );
}
