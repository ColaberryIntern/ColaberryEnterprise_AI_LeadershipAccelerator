import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import { useToast } from '../../components/ui/ToastProvider';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

interface ContentItem {
  id: string;
  platform: string;
  content: string;
  signal_title: string;
  signal_url: string;
  tracked_url: string;
  created_at: string;
  post_status: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  medium: 'Medium',
  linkedin: 'LinkedIn',
  devto: 'Dev.to',
  hashnode: 'Hashnode',
  producthunt: 'Product Hunt',
};

export default function ContentQueuePage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [platform, setPlatform] = useState('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (platform !== 'all') params.platform = platform;
      const res = await api.get('/api/admin/content-queue', { params });
      setItems(res.data.items || []);
    } catch {
      showToast('Failed to load content queue', 'error');
    } finally {
      setLoading(false);
    }
  }, [platform, showToast]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleCopy = async (item: ContentItem) => {
    try {
      await navigator.clipboard.writeText(item.content);
      setCopiedId(item.id);
      showToast('Copied to clipboard', 'success');
      setTimeout(() => setCopiedId(null), 3000);
    } catch {
      showToast('Copy failed — select and copy manually', 'error');
    }
  };

  const handleMarkPosted = async (id: string) => {
    try {
      await api.post(`/api/admin/content-queue/${id}/posted`);
      showToast('Marked as posted', 'success');
      setItems(prev => prev.filter(i => i.id !== id));
    } catch {
      showToast('Failed to update', 'error');
    }
  };

  const handleSkip = async (id: string) => {
    try {
      await api.post(`/api/admin/content-queue/${id}/skip`);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch {
      showToast('Failed to skip', 'error');
    }
  };

  // KPI summary derived from the live queue.
  const summary = useMemo(() => {
    const total = items.length;
    const pending = items.filter(i => i.post_status === 'pending').length;
    const approved = items.filter(i => i.post_status === 'approved').length;
    const published = items.filter(i => i.post_status === 'published').length;
    const platforms = new Set(items.map(i => i.platform)).size;
    return { total, pending, approved, published, platforms };
  }, [items]);

  // Per-page trust signal (Basecamp todo 10027085963) derived from the content queue.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'content queue',
    updatedAt: new Date().toISOString(),
    summary: `${summary.total} items ready to post across ${summary.platforms} platform${summary.platforms === 1 ? '' : 's'}.`,
    href: '/admin/trust',
    pillars: [
      {
        name: 'Queue',
        status: 'live',
        evidence: [
          { label: 'Ready', value: String(summary.total) },
          { label: 'Platforms', value: String(summary.platforms) },
        ],
      },
    ],
  }), [summary]);

  const platformBadge = (p: string) => (
    <StatusBadge label={PLATFORM_LABELS[p] || p} tone="neutral" />
  );

  return (
    <>
      <PageHeader
        title="Content Queue"
        icon="article-line"
        subtitle="AI-generated content ready for manual posting. Copy, paste into the platform, then mark as posted."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Content Queue' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={fetchQueue} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Ready" value={summary.total} icon="inbox-line" tone="info" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Pending" value={summary.pending} icon="time-line" tone="warning" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Approved" value={summary.approved} icon="checkbox-circle-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Platforms" value={summary.platforms} icon="apps-line" tone="primary" />
          </div>
        </div>
      </PageHeader>

      <div className="d-flex gap-2 mb-3 align-items-center">
        <select
          className="form-select form-select-sm"
          style={{ width: 160 }}
          value={platform}
          onChange={e => setPlatform(e.target.value)}
          aria-label="Filter by platform"
        >
          <option value="all">All Platforms</option>
          <option value="medium">Medium</option>
          <option value="linkedin">LinkedIn</option>
          <option value="producthunt">Product Hunt</option>
        </select>
        <span className="text-muted small">{items.length} items ready</span>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading...</span></div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-5 text-muted">No content waiting to be posted.</div>
      ) : (
        <div className="row g-3">
          {items.map(item => (
            <div key={item.id} className="col-12">
              <SectionCard padded={false}>
                <div className="d-flex justify-content-between align-items-center p-3 border-bottom">
                  <div className="d-flex gap-2 align-items-center">
                    {platformBadge(item.platform)}
                    <span className="small text-muted">{new Date(item.created_at).toLocaleDateString()}</span>
                    {item.signal_title && <span className="small text-muted">Re: {item.signal_title.slice(0, 50)}</span>}
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      className={`btn btn-sm ${copiedId === item.id ? 'btn-success' : 'btn-primary'}`}
                      onClick={() => handleCopy(item)}
                    >
                      {copiedId === item.id ? 'Copied!' : 'Copy'}
                    </button>
                    <button className="btn btn-sm btn-outline-success" onClick={() => handleMarkPosted(item.id)}>
                      Mark Posted
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => handleSkip(item.id)}>
                      Skip
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <div
                    className="small"
                    style={{
                      whiteSpace: 'pre-wrap',
                      maxHeight: expandedId === item.id ? 'none' : 120,
                      overflow: 'hidden',
                      cursor: 'pointer',
                    }}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    {item.content}
                  </div>
                  {item.content.length > 300 && expandedId !== item.id && (
                    <button className="btn btn-link btn-sm p-0 mt-1" onClick={() => setExpandedId(item.id)}>
                      Show more
                    </button>
                  )}
                  {item.signal_url && (
                    <div className="mt-2">
                      <a href={item.signal_url} target="_blank" rel="noopener noreferrer" className="small text-muted">
                        Source article
                      </a>
                    </div>
                  )}
                </div>
              </SectionCard>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
