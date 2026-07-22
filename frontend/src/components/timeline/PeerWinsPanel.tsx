import React, { useEffect, useMemo, useState } from 'react';
import { runtimeApi, PublicRitual, RitualTile, RitualField, RitualValues } from '../../pages/portal/runtime/runtimeApi';

/**
 * PeerWinsPanel — the bespoke, self-contained Community Ritual experience for the
 * community_discussion curriculum type (render_band 'peer_wins'). Rendered in the
 * card-detail drawer AND the full workspace (identical), like CardSurveyExperience.
 *
 * It is CONFIG-DRIVEN: the backend resolves the week's ritual (Roll Call, Skill
 * Drop, Cohort Wins, Unblock Me, Hot Take, Architect Manifesto, …) and returns its
 * definition; this panel renders the composer from `ritual.fields` and the wall from
 * `ritual.variant`, so one component serves all twelve weeks. Posting is OPTIONAL —
 * it earns points and a spot on the wall, but never gates completion.
 *
 * Fully self-styled (own <style>, light + dark, accent driven by the ritual). The
 * accent is set per-ritual via the --pw-accent custom property.
 */

interface Props {
  cardId: string;
  preview?: boolean;         // admin Studio: sample ritual, non-interactive
}

const LEVEL_NAMES: Record<number, string> = { 1: 'Apprentice', 2: 'Builder', 3: 'Architect', 4: 'Principal' };
const avColor = (n: string) => { let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return `hsl(${h % 360} 46% 42%)`; };
const timeAgo = (iso: string): string => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!isFinite(d) || d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};
const asText = (v: string | string[] | undefined): string => Array.isArray(v) ? v.join(', ') : (v || '');
const asList = (v: string | string[] | undefined): string[] => Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? v.split('\n').map((s) => s.trim()).filter(Boolean) : []);

// Admin Studio preview — a representative sample (Cohort Wins) so the format is visible.
const SAMPLE_RITUAL: PublicRitual = {
  key: 'cohort_wins', week: 5, name: 'Cohort Wins', icon: '🏆', accent: '#2E6A86',
  ask: "You shipped your first MCP server. What did you build, the breakthrough, one tip for whoever's next?",
  lead: 'This card runs a different ritual each week. In the live classroom it renders the week the student is on.',
  postCta: 'Post my win', headlineField: 'built', variant: 'standard',
  reaction: { emoji: '👏', label: 'Cheer' }, mechanic: { icon: '🏆', caption: 'classmates shipped this section' }, beforeAfter: null,
  fields: [
    { key: 'built', label: 'What I built', required: true, kind: 'text' },
    { key: 'breakthrough', label: 'Breakthrough or hardest part', kind: 'textarea' },
    { key: 'tip', label: "One tip for whoever's next", kind: 'textarea' },
    { key: 'link', label: 'Link', kind: 'link' },
  ],
};
const SAMPLE_WALL: RitualTile[] = [
  { id: 's1', member: { id: 'm1', name: 'Lena Park', avatar_url: null, level: 2, initials: 'LP' }, headline: 'A read-only MCP server for my recipe pantry', values: { built: 'A read-only MCP server for my recipe pantry', breakthrough: 'Getting stdio transport to connect inside Claude Code', tip: 'Verify in Claude Code before wiring any UI' }, link: null, like_count: 7, viewer_has_liked: false, is_mine: false, created_at: new Date(Date.now() - 3600e3).toISOString() },
  { id: 's2', member: { id: 'm2', name: 'Sam Okafor', avatar_url: null, level: 1, initials: 'SO' }, headline: 'A tool that pulls open tickets into one brief', values: { built: 'A tool that pulls open tickets into one brief', tip: 'Write the output shape first' }, link: null, like_count: 4, viewer_has_liked: true, is_mine: false, created_at: new Date(Date.now() - 8 * 3600e3).toISOString() },
];

const PeerWinsPanel: React.FC<Props> = ({ cardId, preview }) => {
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState('');
  const [ritual, setRitual] = useState<PublicRitual | null>(preview ? SAMPLE_RITUAL : null);
  const [wall, setWall] = useState<RitualTile[]>(preview ? SAMPLE_WALL : []);
  const [myPost, setMyPost] = useState<RitualTile | null>(null);
  const [split, setSplit] = useState<{ choices: string[]; counts: number[] } | null>(null);
  const [topic, setTopic] = useState<string | null>(null);

  const [form, setForm] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [justPosted, setJustPosted] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (preview) { setLoading(false); return; }
    try {
      const v = await runtimeApi.ritualWall(cardId);
      setRitual(v.ritual); setWall(v.wall); setMyPost(v.my_post); setSplit(v.split); setTopic(v.title);
      if (v.my_post) {
        const f: Record<string, string> = {};
        for (const fld of v.ritual.fields) f[fld.key] = asText(v.my_post.values[fld.key]);
        setForm(f); setEditing(false);
      } else { setEditing(true); }
      setLoading(false);
    } catch { setLoading(false); setError('Couldn’t load this week’s ritual — try again shortly.'); }
  }, [cardId, preview]);

  useEffect(() => { load(); }, [load]);

  const shipped = wall.length;
  const setF = (k: string, v: string) => setForm((m) => ({ ...m, [k]: v }));
  const requiredMet = ritual ? ritual.fields.filter((f) => f.required).every((f) => (form[f.key] || '').trim()) : false;
  const canPost = requiredMet && !saving;

  const submit = async () => {
    if (!canPost || !ritual) return;
    if (preview) { setJustPosted(true); setEditing(false); return; }
    setSaving(true); setError('');
    try {
      const values: RitualValues = {};
      for (const f of ritual.fields) { const raw = (form[f.key] || '').trim(); if (raw) values[f.key] = raw; }
      const { post, created } = await runtimeApi.postRitual(cardId, values);
      setMyPost(post); setEditing(false); if (created) setJustPosted(true);
      // Re-load so the wall order, counts, and debate split stay authoritative.
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Couldn’t post — please try again.');
    } finally { setSaving(false); }
  };

  const cheer = async (t: RitualTile) => {
    if (preview || t.is_mine || !ritual) return;
    const next = !t.viewer_has_liked;
    setWall((prev) => prev.map((w) => w.id === t.id ? { ...w, viewer_has_liked: next, like_count: w.like_count + (next ? 1 : -1) } : w));
    try {
      const r = await runtimeApi.cheerRitual(cardId, t.id);
      setWall((prev) => prev.map((w) => w.id === t.id ? { ...w, viewer_has_liked: r.liked, like_count: r.like_count } : w));
    } catch { setWall((prev) => prev.map((w) => w.id === t.id ? { ...w, viewer_has_liked: t.viewer_has_liked, like_count: t.like_count } : w)); }
  };

  const copy = (id: string, text: string) => { try { navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied((c) => c === id ? null : c), 1400); } catch { /* clipboard blocked */ } };

  const topWinId = useMemo(() => {
    const top = wall.reduce<RitualTile | null>((best, w) => (w.like_count > 0 && (!best || w.like_count > best.like_count) ? w : best), null);
    return top?.id ?? null;
  }, [wall]);

  const styleBlock = (
    <style>{`
      .pw{--pw-accent:#367895;--pw-gold:#E8920C;--pw-ink:#1A1A1A;--pw-muted:#6B6B6B;--pw-line:#E4E4E3;--pw-panel:#FFFFFF;--pw-sunken:#F6F7F8;font-family:inherit;color:var(--pw-ink)}
      @media (prefers-color-scheme:dark){.pw{--pw-ink:#FFFFFF;--pw-muted:#B4B4B4;--pw-line:rgba(255,255,255,.14);--pw-panel:#141414;--pw-sunken:#1C1C1C}}
      :root[data-theme="dark"] .pw,.tl-de[data-theme="dark"] .pw{--pw-ink:#FFFFFF;--pw-muted:#B4B4B4;--pw-line:rgba(255,255,255,.14);--pw-panel:#141414;--pw-sunken:#1C1C1C}
      .tl-de[data-theme="light"] .pw,:root[data-theme="light"] .pw{--pw-ink:#1A1A1A;--pw-muted:#6B6B6B;--pw-line:#E4E4E3;--pw-panel:#FFFFFF;--pw-sunken:#F6F7F8}
      .pw-head{margin-bottom:14px}
      .pw-eyebrow{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pw-accent);margin-bottom:6px;display:flex;align-items:center;gap:7px}
      .pw-title{font-size:19px;font-weight:750;line-height:1.25;margin:0 0 6px}
      .pw-ask{font-size:14px;color:var(--pw-ink);margin:0;line-height:1.5;font-weight:550}
      .pw-lead{font-size:12.5px;color:var(--pw-muted);margin:6px 0 0;line-height:1.5}
      .pw-counter{display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:7px 12px;border-radius:999px;background:var(--pw-sunken);font-size:12.5px;font-weight:700;color:var(--pw-ink);font-variant-numeric:tabular-nums}
      .pw-compose{border:1.5px solid var(--pw-line);border-radius:16px;padding:16px;margin:16px 0 20px;background:var(--pw-panel)}
      .pw-compose.on{border-color:var(--pw-accent);box-shadow:0 6px 20px color-mix(in srgb,var(--pw-accent) 22%,transparent)}
      .pw-clab{font-size:12.5px;font-weight:700;margin:0 0 5px;display:block}
      .pw-clab .req{color:var(--pw-gold);margin-left:3px}
      .pw-field{margin-bottom:12px}.pw-field:last-of-type{margin-bottom:0}
      .pw-in,.pw-ta{width:100%;padding:10px 12px;border:1px solid var(--pw-line);border-radius:10px;font-size:13.5px;font-family:inherit;background:var(--pw-panel);color:var(--pw-ink);box-sizing:border-box}
      .pw-ta{min-height:58px;resize:vertical;line-height:1.45}
      .pw-ta.mono,.pw-in.mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
      .pw-in:focus,.pw-ta:focus{outline:none;border-color:var(--pw-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--pw-accent) 20%,transparent)}
      .pw-choices{display:flex;gap:8px;flex-wrap:wrap}
      .pw-choice{border:1.5px solid var(--pw-line);border-radius:10px;padding:9px 15px;font-size:13px;font-weight:700;background:var(--pw-panel);color:var(--pw-muted);cursor:pointer}
      .pw-choice.sel{border-color:var(--pw-accent);color:var(--pw-accent);background:color-mix(in srgb,var(--pw-accent) 10%,transparent)}
      .pw-hint{font-size:11.5px;color:var(--pw-muted);margin:4px 2px 0}
      .pw-post{width:100%;margin-top:4px;padding:13px;border:none;border-radius:12px;background:var(--pw-accent);color:#fff;font-size:15px;font-weight:750;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
      .pw-post:disabled{opacity:.45;cursor:not-allowed}
      .pw-pts{font-size:12px;font-weight:800;background:rgba(255,255,255,.22);padding:2px 8px;border-radius:999px}
      .pw-err{color:#C20E1E;font-size:12.5px;margin-top:8px;text-align:center}
      .pw-mine{border:1.5px solid var(--pw-accent);border-radius:16px;padding:14px 16px;margin:16px 0 20px;background:linear-gradient(180deg,color-mix(in srgb,var(--pw-accent) 9%,transparent),transparent)}
      .pw-mine-top{display:flex;align-items:center;gap:8px;margin-bottom:8px}
      .pw-mine-badge{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--pw-accent)}
      .pw-mine-built{font-size:15px;font-weight:700;line-height:1.35;margin:0}
      .pw-edit{margin-left:auto;background:none;border:1px solid var(--pw-line);border-radius:9px;padding:6px 12px;font-size:12.5px;font-weight:600;color:var(--pw-ink);cursor:pointer}
      .pw-gridlab{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--pw-muted);margin:0 0 10px}
      .pw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
      .pw-tile{border:1px solid var(--pw-line);border-radius:14px;padding:13px;background:var(--pw-panel);display:flex;flex-direction:column;gap:9px;position:relative;overflow:hidden}
      .pw-tile.mine{border-color:var(--pw-accent)}
      .pw-tile.top{border-color:var(--pw-gold)}
      .pw-tile.big{grid-column:1/-1;background:linear-gradient(180deg,color-mix(in srgb,var(--pw-accent) 7%,transparent),transparent)}
      .pw-ribbon{position:absolute;top:9px;right:-30px;transform:rotate(38deg);background:var(--pw-gold);color:#fff;font-size:9px;font-weight:800;letter-spacing:.05em;padding:2px 30px;text-transform:uppercase}
      .pw-who{display:flex;align-items:center;gap:9px}
      .pw-av{flex:none;width:34px;height:34px;border-radius:50%;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;object-fit:cover}
      .pw-name{font-size:13px;font-weight:700;line-height:1.15}
      .pw-sub{font-size:11px;color:var(--pw-muted)}
      .pw-you{font-size:10px;font-weight:800;color:var(--pw-accent);background:color-mix(in srgb,var(--pw-accent) 12%,transparent);padding:2px 7px;border-radius:999px;margin-left:auto}
      .pw-built{font-size:13.5px;font-weight:650;line-height:1.4;text-align:left;background:none;border:none;padding:0;margin:0;color:var(--pw-ink);cursor:pointer}
      .pw-built.big{font-size:16px;font-weight:750}
      .pw-story{border-top:1px dashed var(--pw-line);padding-top:9px;display:flex;flex-direction:column;gap:8px}
      .pw-slab{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--pw-muted);margin-bottom:2px}
      .pw-stext{font-size:12.5px;line-height:1.45;color:var(--pw-ink)}
      .pw-chips{display:flex;gap:6px;flex-wrap:wrap}
      .pw-chip{background:var(--pw-sunken);border:1px solid var(--pw-line);border-radius:7px;padding:5px 9px;font-size:11.5px;font-weight:600}
      .pw-mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;background:var(--pw-sunken);border:1px solid var(--pw-line);border-radius:8px;padding:9px;color:var(--pw-ink);white-space:pre-wrap;line-height:1.4;position:relative}
      .pw-copy{position:absolute;top:6px;right:6px;font-size:10px;font-weight:700;border:1px solid var(--pw-line);background:var(--pw-panel);border-radius:6px;padding:3px 8px;cursor:pointer;color:var(--pw-accent)}
      .pw-ba{display:flex;border:1px solid var(--pw-line);border-radius:8px;overflow:hidden}
      .pw-ba div{flex:1;padding:7px 9px;font-size:11.5px}
      .pw-ba .b4{background:var(--pw-sunken);color:var(--pw-muted)}
      .pw-ba .af{background:color-mix(in srgb,#5BA63C 14%,transparent);color:var(--pw-ink);font-weight:600}
      .pw-ba .lbl{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.08em;opacity:.7;margin-bottom:2px}
      .pw-vbar{display:flex;height:24px;border-radius:7px;overflow:hidden;border:1px solid var(--pw-line);font-size:10.5px;font-weight:700}
      .pw-vbar .ag{background:color-mix(in srgb,var(--pw-accent) 34%,transparent);color:var(--pw-ink);display:flex;align-items:center;padding:0 8px}
      .pw-vbar .di{background:color-mix(in srgb,#D97757 34%,transparent);color:var(--pw-ink);display:flex;align-items:center;justify-content:flex-end;padding:0 8px}
      .pw-sidebadge{align-self:flex-start;font-size:10.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--pw-accent);background:color-mix(in srgb,var(--pw-accent) 12%,transparent);padding:3px 9px;border-radius:6px}
      .pw-foot{display:flex;align-items:center;gap:8px;margin-top:auto}
      .pw-cheer{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--pw-line);border-radius:999px;padding:5px 11px;font-size:12px;font-weight:700;color:var(--pw-muted);background:var(--pw-panel);cursor:pointer}
      .pw-cheer.on{background:color-mix(in srgb,var(--pw-gold) 13%,transparent);border-color:var(--pw-gold);color:var(--pw-gold)}
      .pw-cheer:disabled{cursor:default;opacity:.8}
      .pw-cheer .em{font-size:14px;line-height:1}
      .pw-more{font-size:11px;color:var(--pw-muted);margin-left:auto}
      .pw-empty{text-align:center;padding:26px 14px;border:1.5px dashed var(--pw-line);border-radius:16px;color:var(--pw-muted)}
      .pw-empty .big{font-size:30px;margin-bottom:8px}
      .pw-empty h4{font-size:15px;font-weight:750;color:var(--pw-ink);margin:0 0 4px}
      .pw-empty p{font-size:13px;margin:0;line-height:1.5}
      .pw-load{padding:28px 10px;text-align:center;color:var(--pw-muted);font-size:13.5px}
      @media (prefers-reduced-motion:reduce){*{transition:none!important}}
    `}</style>
  );

  if (loading) return <div className="pw">{styleBlock}<div className="pw-load">Loading this week’s ritual…</div></div>;
  if (!ritual) return <div className="pw">{styleBlock}<div className="pw-empty"><p>{error || 'This ritual isn’t ready yet.'}</p></div></div>;

  const accentStyle = { ['--pw-accent' as any]: ritual.accent } as React.CSSProperties;
  const listField = ritual.fields.find((f) => f.kind === 'list');
  const monoField = ritual.fields.find((f) => f.mono);
  const choiceField = ritual.fields.find((f) => f.kind === 'choice');
  const storyFields = ritual.fields.filter((f) => f.kind !== 'link' && f.key !== ritual.headlineField && f.kind !== 'list' && !f.mono && f.kind !== 'choice');

  const renderField = (f: RitualField) => {
    const v = form[f.key] || '';
    if (f.kind === 'choice') return (
      <div className="pw-choices">{(f.choices || []).map((c) => (
        <button type="button" key={c} className={`pw-choice${v === c ? ' sel' : ''}`} onClick={() => setF(f.key, c)}>{c}</button>
      ))}</div>
    );
    if (f.kind === 'textarea' || f.kind === 'list') return (
      <textarea className={`pw-ta${f.mono ? ' mono' : ''}`} placeholder={f.placeholder} value={v} onChange={(e) => setF(f.key, e.target.value)} />
    );
    return <input className={`pw-in${f.mono ? ' mono' : ''}`} placeholder={f.placeholder} value={v} onChange={(e) => setF(f.key, e.target.value)} />;
  };

  const composer = (
    <div className={`pw-compose${requiredMet ? ' on' : ''}`}>
      {ritual.fields.map((f) => (
        <div className="pw-field" key={f.key}>
          <label className="pw-clab">{f.label}{f.required && <span className="req">*</span>}{f.kind === 'list' && <span style={{ color: 'var(--pw-muted)', fontWeight: 400 }}> · one per line</span>}{f.kind === 'link' && <span style={{ color: 'var(--pw-muted)', fontWeight: 400 }}> (optional)</span>}</label>
          {renderField(f)}
        </div>
      ))}
      <button type="button" className="pw-post" disabled={!canPost} onClick={submit}>
        {saving ? 'Posting…' : myPost ? 'Update my post' : ritual.postCta}
        {!saving && !myPost && <span className="pw-pts">+ points</span>}
      </button>
      {error && <div className="pw-err">{error}</div>}
      <div className="pw-hint">Posts to the cohort wall (auto-tagged Week {ritual.week}) and your Community feed. Optional.</div>
    </div>
  );

  const mineSummary = myPost && !editing && (
    <div className="pw-mine">
      <div className="pw-mine-top"><span className="pw-mine-badge">{justPosted ? '🎉 Posted to the wall' : 'Your post'}</span><button type="button" className="pw-edit" onClick={() => setEditing(true)}>Edit</button></div>
      <p className="pw-mine-built">{myPost.headline}</p>
    </div>
  );

  const renderTile = (t: RitualTile) => {
    const isOpen = !!expanded[t.id];
    const stories = storyFields.map((f) => ({ f, v: asText(t.values[f.key]) })).filter((x) => x.v);
    const hasExtra = stories.length > 0 || (listField && asList(t.values[listField.key]).length) || (monoField && asText(t.values[monoField.key])) || !!t.link;
    const isBig = ritual.variant === 'manifesto';
    return (
      <article key={t.id} className={`pw-tile${t.is_mine ? ' mine' : ''}${t.id === topWinId ? ' top' : ''}${isBig ? ' big' : ''}`}>
        {t.id === topWinId && <span className="pw-ribbon">Top</span>}
        <div className="pw-who">
          {t.member.avatar_url ? <img className="pw-av" src={t.member.avatar_url} alt="" /> : <span className="pw-av" style={{ background: avColor(t.member.name) }}>{t.member.initials}</span>}
          <div><div className="pw-name">{t.is_mine ? 'You' : t.member.name}</div><div className="pw-sub">{LEVEL_NAMES[t.member.level] || 'Builder'} · {timeAgo(t.created_at)} · Wk {ritual.week}</div></div>
          {t.is_mine && <span className="pw-you">You</span>}
        </div>

        {/* debate: side badge + split */}
        {ritual.variant === 'debate' && choiceField && asText(t.values[choiceField.key]) && (
          <span className="pw-sidebadge">{asText(t.values[choiceField.key])}</span>
        )}

        <button type="button" className={`pw-built${isBig ? ' big' : ''}`} onClick={() => hasExtra && setExpanded((m) => ({ ...m, [t.id]: !m[t.id] }))}>{t.headline}</button>

        {/* chips (skills / agents) */}
        {ritual.variant === 'chips' && listField && (
          <div className="pw-chips">{asList(t.values[listField.key]).map((s, i) => <span className="pw-chip" key={i}>{s}</span>)}</div>
        )}

        {/* before → after */}
        {ritual.variant === 'before_after' && ritual.beforeAfter && (asText(t.values[ritual.beforeAfter[0]]) || asText(t.values[ritual.beforeAfter[1]])) && (
          <div className="pw-ba"><div className="b4"><span className="lbl">Before</span>{asText(t.values[ritual.beforeAfter[0]]) || '—'}</div><div className="af"><span className="lbl">After</span>{asText(t.values[ritual.beforeAfter[1]]) || '—'}</div></div>
        )}

        {/* prompt: mono box + copy */}
        {ritual.variant === 'prompt' && monoField && asText(t.values[monoField.key]) && (
          <div className="pw-mono">{asText(t.values[monoField.key])}<button type="button" className="pw-copy" onClick={() => copy(t.id, asText(t.values[monoField.key]))}>{copied === t.id ? 'Copied ✓' : 'Copy'}</button></div>
        )}

        {/* expandable story fields */}
        {isOpen && stories.length > 0 && (
          <div className="pw-story">{stories.map(({ f, v }) => <div key={f.key}><div className="pw-slab">{f.label}</div><div className="pw-stext">{v}</div></div>)}
            {t.link && <a className="pw-slab" style={{ color: 'var(--pw-accent)' }} href={t.link} target="_blank" rel="noopener noreferrer">View what they shared →</a>}
          </div>
        )}

        <div className="pw-foot">
          <button type="button" className={`pw-cheer${t.viewer_has_liked ? ' on' : ''}`} disabled={preview || t.is_mine} onClick={() => cheer(t)} aria-pressed={t.viewer_has_liked}>
            <span className="em">{ritual.reaction.emoji}</span>{t.like_count > 0 ? t.like_count : ritual.reaction.label}
          </button>
          {ritual.variant === 'qa' && <span className="pw-more">answer in comments</span>}
          {hasExtra && ritual.variant !== 'qa' && <span className="pw-more">{isOpen ? 'Hide' : 'Read'}</span>}
        </div>
      </article>
    );
  };

  const total = split ? split.counts.reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="pw" style={accentStyle}>
      {styleBlock}
      <div className="pw-head">
        <div className="pw-eyebrow"><span>{ritual.icon}</span> Week {ritual.week} · {ritual.name}</div>
        {topic && <h2 className="pw-title">{topic}</h2>}
        <p className="pw-ask">{ritual.ask}</p>
        <p className="pw-lead">{ritual.lead}</p>
        <div className="pw-counter"><span>{shipped > 0 ? ritual.mechanic.icon : '👋'}</span>{shipped > 0 ? `${shipped} ${ritual.mechanic.caption}` : 'No posts yet — set the pace for your cohort'}</div>
        {/* debate: live split bar in the header */}
        {ritual.variant === 'debate' && split && total > 0 && (
          <div className="pw-vbar" style={{ marginTop: 12 }}>
            <div className="ag" style={{ flex: `0 0 ${Math.round((split.counts[0] / total) * 100)}%` }}>{split.choices[0]} {Math.round((split.counts[0] / total) * 100)}%</div>
            <div className="di" style={{ flex: `1 1 auto` }}>{Math.round((split.counts[1] / total) * 100)}% {split.choices[1]}</div>
          </div>
        )}
      </div>

      {editing ? composer : mineSummary}

      <div className="pw-gridlab">The wall {shipped > 0 ? `· ${shipped}` : ''}</div>
      {shipped === 0 ? (
        <div className="pw-empty"><div className="big">🚀</div><h4>Be the first this week</h4><p>The first post sets the tone. Share yours and your classmates will follow.</p></div>
      ) : (
        <div className="pw-grid">{wall.map(renderTile)}</div>
      )}
    </div>
  );
};

export default PeerWinsPanel;
