import React, { useState } from 'react';
import { authorInternshipProject, AuthoredProjectResult } from '../../../services/adminInternshipApi';

/**
 * The manager's project-delivery surface: author a project (releases + stories)
 * and assign it to the intern. On submit it creates a fresh active project on
 * their enrollment and materialises the releases/stories onto their profile —
 * the same rows a generated build produces, so it renders identically for them.
 *
 * Kept a collapsible panel so it never competes with the read-only Activity view;
 * a manager opens it only when assigning a project (the first one comes from them,
 * after the first three weeks are cleared).
 */
interface StoryDraft { title: string; narrative: string; build: string; acceptance: string; }
interface ReleaseDraft { key: string; name: string; stories: StoryDraft[]; }

const emptyStory = (): StoryDraft => ({ title: '', narrative: '', build: '', acceptance: '' });
const emptyRelease = (i: number): ReleaseDraft => ({ key: `r${i}`, name: `Release ${i}`, stories: [emptyStory()] });

const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280' };

const InternshipProjectAuthor: React.FC<{ applicationId: string; onAuthored: () => void }> = ({ applicationId, onAuthored }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [releases, setReleases] = useState<ReleaseDraft[]>([emptyRelease(0)]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<AuthoredProjectResult | null>(null);

  const patchRelease = (ri: number, patch: Partial<ReleaseDraft>) =>
    setReleases((rs) => rs.map((r, i) => (i === ri ? { ...r, ...patch } : r)));
  const patchStory = (ri: number, si: number, patch: Partial<StoryDraft>) =>
    setReleases((rs) => rs.map((r, i) => (i === ri
      ? { ...r, stories: r.stories.map((s, j) => (j === si ? { ...s, ...patch } : s)) }
      : r)));

  const storyCount = releases.reduce((n, r) => n + r.stories.filter((s) => s.title.trim()).length, 0);
  const canSubmit = name.trim().length > 0 && releases.some((r) => r.key.trim() && r.stories.some((s) => s.title.trim()));

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        industry: industry.trim() || null,
        releases: releases
          .filter((r) => r.key.trim() && r.stories.some((s) => s.title.trim()))
          .map((r) => ({
            key: r.key.trim(),
            name: r.name.trim(),
            stories: r.stories.filter((s) => s.title.trim()).map((s) => ({
              title: s.title.trim(),
              narrative: s.narrative.trim() || null,
              build: s.build.trim() || null,
              acceptance: s.acceptance.split('\n').map((x) => x.trim()).filter(Boolean),
            })),
          })),
      };
      setDone(await authorInternshipProject(applicationId, payload));
      onAuthored();
    } catch {
      setError('Could not author the project. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-2 pt-2" style={{ borderTop: '1px solid #f1f3f5', fontSize: 13.5 }}>
        <span className="badge" style={{ background: '#2e7d5b', color: '#fff' }}>Assigned</span>{' '}
        <strong>{done.name}</strong> — {done.releases} release{done.releases === 1 ? '' : 's'}, {done.stories} stor{done.stories === 1 ? 'y' : 'ies'} on their profile.
        <button type="button" className="btn btn-sm btn-link" onClick={() => { setDone(null); setOpen(false); setName(''); setIndustry(''); setReleases([emptyRelease(0)]); }}>
          Author another
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-2 pt-2" style={{ borderTop: '1px solid #f1f3f5' }}>
        <button type="button" className="btn btn-sm btn-dark" onClick={() => setOpen(true)}>Author &amp; assign a project</button>
        <span className="text-muted ms-2" style={{ fontSize: 12.5 }}>Build releases and stories and put them on this intern&apos;s profile.</span>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 d-flex flex-column gap-3" style={{ borderTop: '1px solid #f1f3f5' }}>
      {error && <div className="alert alert-danger py-2 mb-0" role="alert">{error}</div>}

      <div className="d-flex flex-wrap gap-2">
        <div style={{ flex: '2 1 240px' }}>
          <div style={label}>Project name</div>
          <input className="form-control form-control-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="PropertyPulse AI" />
        </div>
        <div style={{ flex: '1 1 160px' }}>
          <div style={label}>Industry (optional)</div>
          <input className="form-control form-control-sm" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Real estate" />
        </div>
      </div>

      {releases.map((r, ri) => (
        <div key={ri} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }} className="d-flex flex-column gap-2">
          <div className="d-flex flex-wrap gap-2 align-items-end">
            <div style={{ flex: '0 0 90px' }}>
              <div style={label}>Key</div>
              <input className="form-control form-control-sm" value={r.key} onChange={(e) => patchRelease(ri, { key: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <div style={label}>Release name</div>
              <input className="form-control form-control-sm" value={r.name} onChange={(e) => patchRelease(ri, { name: e.target.value })} />
            </div>
            {releases.length > 1 && (
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setReleases((rs) => rs.filter((_, i) => i !== ri))}>Remove release</button>
            )}
          </div>

          {r.stories.map((s, si) => (
            <div key={si} className="d-flex flex-column gap-1" style={{ paddingLeft: 10, borderLeft: '2px solid #f1f3f5' }}>
              <div className="d-flex gap-2 align-items-center">
                <input className="form-control form-control-sm" style={{ fontWeight: 600 }} value={s.title} onChange={(e) => patchStory(ri, si, { title: e.target.value })} placeholder={`Story ${si + 1} title`} />
                {r.stories.length > 1 && (
                  <button type="button" className="btn btn-sm btn-link text-muted p-0" title="Remove story" onClick={() => patchRelease(ri, { stories: r.stories.filter((_, j) => j !== si) })}>&times;</button>
                )}
              </div>
              <textarea className="form-control form-control-sm" rows={2} value={s.narrative} onChange={(e) => patchStory(ri, si, { narrative: e.target.value })} placeholder="What the intern is building and why (shown on the card)" />
              <textarea className="form-control form-control-sm" rows={2} value={s.build} onChange={(e) => patchStory(ri, si, { build: e.target.value })} placeholder="The build prompt they run in the story workspace (optional)" style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
              <textarea className="form-control form-control-sm" rows={2} value={s.acceptance} onChange={(e) => patchStory(ri, si, { acceptance: e.target.value })} placeholder="Acceptance criteria, one per line (optional)" />
            </div>
          ))}
          <button type="button" className="btn btn-sm btn-outline-dark align-self-start" onClick={() => patchRelease(ri, { stories: [...r.stories, emptyStory()] })}>+ Story</button>
        </div>
      ))}

      <div className="d-flex gap-2 align-items-center flex-wrap">
        <button type="button" className="btn btn-sm btn-outline-dark" onClick={() => setReleases((rs) => [...rs, emptyRelease(rs.length)])}>+ Release</button>
        <button type="button" className="btn btn-sm btn-dark ms-auto" onClick={submit} disabled={!canSubmit || busy}>
          {busy ? 'Assigning…' : `Assign to intern (${storyCount} stor${storyCount === 1 ? 'y' : 'ies'})`}
        </button>
        <button type="button" className="btn btn-sm btn-link text-muted" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
};

export default InternshipProjectAuthor;
