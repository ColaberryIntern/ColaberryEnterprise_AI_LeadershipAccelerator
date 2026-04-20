import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { useToast } from '../../components/ui/ToastProvider';

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

const PLATFORM_COLORS: Record<string, { bg: string; label: string }> = {
  medium: { bg: '#000000', label: 'Medium' },
  linkedin: { bg: '#0077b5', label: 'LinkedIn' },
  devto: { bg: '#0a0a0a', label: 'Dev.to' },
  hashnode: { bg: '#2962ff', label: 'Hashnode' },
  producthunt: { bg: '#da552f', label: 'Product Hunt' },
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
      const params: any = {};
      if (platform !== 'all') params.platform = platform;
      const res = await api.get('/api/admin/content-queue', { params });
      setItems(res.data.items || []);
    } catch {
      showToast('Failed to load content queue', 'error');
    } finally {
      setLoading(false);
    }
  }, [platform]);

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

  const platformBadge = (p: string) => {
    const cfg = PLATFORM_COLORS[p] || { bg: '#6c757d', label: p };
    return <span className="badge" style={{ backgroundColor: cfg.bg, color: 'white' }}>{cfg.label}</span>;
  };

  return (
    <div>
      <h4 className="fw-semibold mb-1">Content to Post</h4>
      <p className="text-muted small mb-3">
        AI-generated content ready for manual posting. Copy, paste into the platform, then mark as posted.
      </p>

      <div className="d-flex gap-2 mb-3 align-items-center">
        <select className="form-select form-select-sm" style={{ width: 160 }} value={platform} onChange={e => setPlatform(e.target.value)}>
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
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-white d-flex justify-content-between align-items-center">
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
                <div className="card-body">
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
