import React, { useEffect, useState } from 'react';
import {
  composerApi, composerCss, Blueprint, Course, Plan, Assessment, PlanCard,
  Chip, Lab, Btn, Meter, Ring, money, bandTone, initials,
} from './composerKit';

/**
 * CurriculumComposerTab — the AI Curriculum Operating System. A four-pane
 * workspace (Blueprint · Timeline Canvas · AI Architect · Evidence) over a
 * validation/publishing status bar. The instructor describes an outcome; the AI
 * Architect assembles a week from real Experience Studio components, scores it,
 * recommends fixes, and — only when validation passes — publishes real cards to
 * the Timeline. Backed by /api/admin/composer/*.
 */

const BUCKETS: Array<[string, string]> = [
  ['pre_class', 'Pre-Class'], ['learn', 'Learn'], ['practice', 'Practice'],
  ['build', 'Build'], ['reflect', 'Reflect'], ['share', 'Share'], ['advance', 'Advance'],
];
const csv = (v?: string[] | null) => (v || []).join(', ');
const parseCsv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

const CurriculumComposerTab: React.FC = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState<string>('');
  const [list, setList] = useState<Blueprint[]>([]);
  const [sel, setSel] = useState<Blueprint | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [assess, setAssess] = useState<Assessment | null>(null);
  const [instruction, setInstruction] = useState('Teach Prompt Engineering during Week 4');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // Load the courses once, then default to the AI Systems Architect Accelerator.
  useEffect(() => {
    (async () => {
      try {
        const cs = await composerApi.courses();
        setCourses(cs);
        const def = cs.find((c) => /architect/i.test(c.name)) || cs.find((c) => c.is_active) || cs[0];
        setCourseId(def?.id || '');
      } catch { setError('Failed to load courses.'); }
    })();
  }, []);

  // (Re)load the blueprints for the selected course — the Composer is scoped to one.
  useEffect(() => {
    if (!courseId) return;
    (async () => {
      try {
        const bps = await composerApi.list(courseId);
        setList(bps);
        if (bps.length) {
          const bp = await composerApi.get(bps[0].id);
          setSel(bp); setPlan(bp.generated_plan || null); setAssess(bp.assessment || null);
          if (bp.title) setInstruction(`Generate a week for ${bp.title}`);
        } else { setSel(null); setPlan(null); setAssess(null); }
      } catch { setError('Failed to load the Composer.'); }
    })();
  }, [courseId]);

  const addCourse = async () => {
    const name = window.prompt('Name the new course');
    if (!name || !name.trim()) return;
    setBusy('course');
    try {
      const c = await composerApi.createCourse(name.trim());
      setCourses((cs) => [...cs, { id: c.id, name: c.name, is_active: c.is_active }]);
      setCourseId(c.id); // switch to the new (empty) course
      setList([]); setSel(null); setPlan(null); setAssess(null);
    } catch { setError('Could not create the course.'); } finally { setBusy(''); }
  };

  const openBlueprint = async (id: string) => {
    setError(''); setNote('');
    try {
      const bp = await composerApi.get(id);
      setSel(bp); setPlan(bp.generated_plan || null); setAssess(bp.assessment || null);
      if (bp.title) setInstruction(`Generate a week for ${bp.title}`);
    } catch { setError('Failed to open blueprint.'); }
  };

  const newBlueprint = async () => {
    setBusy('new');
    try {
      const bp = await composerApi.create({ title: 'New curriculum', week: 1, difficulty: 'core', scope: 'week', competencies: [], architect_domains: [], learning_objectives: [], program_id: courseId || null });
      setList((l) => [bp, ...l]); setSel(bp); setPlan(null); setAssess(null);
    } catch { setError('Create failed.'); } finally { setBusy(''); }
  };

  const setField = (f: string, v: any) => sel && setSel({ ...sel, [f]: v });
  const saveBlueprint = async () => {
    if (!sel) return; setBusy('save');
    try {
      const saved = await composerApi.update(sel.id, {
        title: sel.title, purpose: sel.purpose, week: sel.week, difficulty: sel.difficulty, estimated_hours: sel.estimated_hours,
        competencies: sel.competencies, architect_domains: sel.architect_domains, learning_objectives: sel.learning_objectives,
      });
      setSel({ ...saved, assessment: assess }); setList((l) => l.map((b) => (b.id === saved.id ? saved : b))); setNote('Blueprint saved.');
    } catch { setError('Save failed.'); } finally { setBusy(''); }
  };

  const deleteBlueprint = async () => {
    if (!sel) return;
    const label = `${sel.title}${sel.week != null ? ` · Wk ${sel.week}` : ''}`;
    if (!window.confirm(`Delete "${label}"? This removes the week from this course. It can't be undone.`)) return;
    setBusy('delete'); setError(''); setNote('');
    try {
      await composerApi.remove(sel.id);
      const bps = await composerApi.list(courseId);
      setList(bps);
      if (bps.length) { const bp = await composerApi.get(bps[0].id); setSel(bp); setPlan(bp.generated_plan || null); setAssess(bp.assessment || null); }
      else { setSel(null); setPlan(null); setAssess(null); }
      setNote('Week deleted.');
    } catch { setError('Delete failed.'); } finally { setBusy(''); }
  };

  const generate = async (extra?: string) => {
    if (!sel) return; setBusy('generate'); setError(''); setNote('');
    try {
      const r = await composerApi.generate(sel.id, extra ? `${instruction}. Also: ${extra}` : instruction);
      setPlan(r.plan); setAssess(r.assessment);
      setSel({ ...sel, status: 'generated', quality_score: r.assessment.validation.quality });
      setNote(`${r.source === 'ai' ? 'AI' : 'Scaffold'} generated ${r.plan.cards.length} cards · ${money(r.cost_usd)}`);
    } catch (e: any) { setError(e?.response?.data?.error || 'Generation failed.'); } finally { setBusy(''); }
  };

  const publish = async () => {
    if (!sel) return; setBusy('publish'); setError('');
    try {
      const r = await composerApi.publish(sel.id);
      setNote(r.already ? `Already published (${r.card_ids.length} cards).` : `Published ${r.created} cards to the Timeline ✓`);
      setSel({ ...sel, status: 'published' });
    } catch (e: any) { setError(e?.response?.data?.error || 'Publish failed.'); } finally { setBusy(''); }
  };

  const v = assess?.validation; const ev = assess?.evidence; const jr = assess?.journey;
  const lanes = BUCKETS.map(([b, label]) => [label, (plan?.cards || []).filter((c) => c.bucket === b)] as [string, PlanCard[]]).filter(([, cs]) => cs.length);
  const depIssue = (t: string) => assess?.dependencies.issues.find((i) => i.type === t);

  return (
    <div className="cc">
      <style>{composerCss}</style>
      {error && <div className="cc-err">{error}</div>}

      {/* blueprint bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.02em' }}>Curriculum Composer</div>
          <div className="cc-muted">Describe an outcome — the AI Architect assembles, validates, and publishes a week from your components.</div></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="cc-muted" style={{ fontSize: 12, fontWeight: 600 }}>Course</label>
          <select className="cc-in" style={{ width: 'auto', fontWeight: 600 }} value={courseId} onChange={(e) => setCourseId(e.target.value)} title="The Composer and Timeline are scoped to one course">
            {courses.length === 0 && <option value="">— loading —</option>}
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Btn tone="ghost" disabled={busy === 'course'} onClick={addCourse}>＋ Course</Btn>
          <span style={{ width: 1, height: 22, background: 'var(--border-default, #E4E4E4)' }} />
          <select className="cc-in" style={{ width: 'auto' }} value={sel?.id || ''} onChange={(e) => e.target.value && openBlueprint(e.target.value)}>
            <option value="">— select week —</option>
            {[...list]
              .sort((a, b) =>
                (a.week ?? 999) - (b.week ?? 999) ||
                Number(b.status === 'published') - Number(a.status === 'published') ||
                (a.title || '').localeCompare(b.title || ''))
              .map((b) => <option key={b.id} value={b.id}>{b.title}{b.week != null ? ` · Wk ${b.week}` : ''} ({b.status})</option>)}
          </select>
          <Btn tone="ghost" disabled={busy === 'new'} onClick={newBlueprint}>＋ New</Btn>
        </div>
      </div>
      {note && <div style={{ background: 'var(--leaf-soft)', color: 'var(--leaf-deep)', padding: '7px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{note}</div>}

      {!sel ? (
        <div className="cc-genbox">Create or select a blueprint to begin — the blueprint is the source of truth for the whole experience.</div>
      ) : (
      <>
      <div className="cc-cols">
        {/* LEFT — Blueprint */}
        <div className="cc-pane left">
          <h5><svg viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4z" stroke="var(--berry)" strokeWidth="2" /><path d="M8 9h8M8 13h5" stroke="var(--berry)" strokeWidth="2" strokeLinecap="round" /></svg> Blueprint <span className="cc-chip grey" style={{ marginLeft: 'auto' }}>{sel.status}</span></h5>
          <div className="cc-field"><label>Title</label><input className="cc-in" value={sel.title} onChange={(e) => setField('title', e.target.value)} /></div>
          <div className="cc-field"><label>Purpose</label><textarea className="cc-in" style={{ minHeight: 46 }} value={sel.purpose || ''} onChange={(e) => setField('purpose', e.target.value)} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="cc-field"><label>Week</label><input className="cc-in" type="number" value={sel.week ?? ''} onChange={(e) => setField('week', e.target.value ? Number(e.target.value) : null)} /></div>
            <div className="cc-field"><label>Difficulty</label><select className="cc-in" value={sel.difficulty || 'core'} onChange={(e) => setField('difficulty', e.target.value)}>{['intro', 'core', 'stretch'].map((d) => <option key={d}>{d}</option>)}</select></div>
          </div>
          <div className="cc-field"><label>Est. hours</label><input className="cc-in" type="number" value={sel.estimated_hours ?? ''} onChange={(e) => setField('estimated_hours', e.target.value ? Number(e.target.value) : null)} /></div>
          <div className="cc-field"><label>Competencies (comma)</label><input className="cc-in mono" value={csv(sel.competencies)} onChange={(e) => setField('competencies', parseCsv(e.target.value))} placeholder="prompt_engineering, testing" /></div>
          <div className="cc-field"><label>Architect domains (comma)</label><input className="cc-in mono" value={csv(sel.architect_domains)} onChange={(e) => setField('architect_domains', parseCsv(e.target.value))} /></div>
          <div className="cc-field"><label>Learning objectives (one per line)</label><textarea className="cc-in" style={{ minHeight: 56 }} value={(sel.learning_objectives || []).join('\n')} onChange={(e) => setField('learning_objectives', e.target.value.split('\n').filter(Boolean))} /></div>
          <Btn tone="berry" style={{ width: '100%' }} disabled={busy === 'save'} onClick={saveBlueprint}>{busy === 'save' ? 'Saving…' : 'Save blueprint'}</Btn>
          <button type="button" onClick={deleteBlueprint} disabled={busy === 'delete'} style={{ width: '100%', marginTop: 8, background: 'none', border: '1px solid #E4B4B4', color: '#C20E1E', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{busy === 'delete' ? 'Deleting…' : 'Delete this week'}</button>
        </div>

        {/* CENTER — Canvas */}
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="cc-canvastop"><Chip tone="cherry">{sel.week != null ? `Week ${sel.week}` : sel.scope || 'week'}</Chip><b style={{ fontSize: 14 }}>Timeline canvas</b>
            {plan && <Btn tone="ghost" style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 10px' }} disabled={busy === 'generate'} onClick={() => generate()}>↻ Regenerate</Btn>}</div>
          <div style={{ padding: 15, overflowY: 'auto', maxHeight: 610 }}>
            {!plan ? (
              <div className="cc-genbox">
                <Lab>AI Curriculum Generator</Lab>
                <p className="cc-muted" style={{ margin: '6px 0 0' }}>Describe the week; the Architect assembles the cards from real components.</p>
                <div className="cc-prompt"><span style={{ color: '#7d8b92' }}>›</span><input value={instruction} onChange={(e) => setInstruction(e.target.value)} /><Btn tone="cta" style={{ padding: '7px 12px' }} disabled={busy === 'generate'} onClick={() => generate()}>{busy === 'generate' ? 'Generating…' : 'Generate'}</Btn></div>
                <p className="cc-muted mono" style={{ marginTop: 10, fontSize: 11 }}>no hardcoded curriculum — every card is a real component instance</p>
              </div>
            ) : lanes.map(([label, cards]) => (
              <div className="cc-lane" key={label}>
                <div className="lh"><span className="b">{label}</span></div>
                {cards.map((c, i) => { const di = depIssue(c.type); return (
                  <div className="cc-tcard" key={`${c.type}-${i}`}>
                    <span className="ic" style={{ background: bandTone(c.bucket === 'learn' && c.type === 'video' ? 'media' : c.type) }}>{initials(c.type)}</span>
                    <div className="body"><div className="t" title={c.title}>{c.title}</div><div className="s">{c.type} · {c.estimated_time}m · {c.difficulty}</div></div>
                    {di && <span className="warn" title={`needs ${di.missing.join(', ')}`}>⛓ dep</span>}
                    <span className="xp">+{(c.points.learning || 0) + (c.points.builder || 0) + (c.points.community || 0)}</span>
                  </div>); })}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER-RIGHT — AI Architect */}
        <div className="cc-pane side">
          <h5><svg viewBox="0 0 24 24" fill="none"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2" stroke="var(--cherry)" strokeWidth="2" strokeLinecap="round" /></svg> AI Architect</h5>
          {!v ? <div className="cc-muted">Generate to see quality, coverage, and recommendations.</div> : (
            <>
              <div style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 11, padding: 11, marginBottom: 12 }}><Ring value={v.quality} label="quality" /></div>
              <Meter label="Competency coverage" value={v.competency_coverage * 100} />
              <Meter label="Architect domains" value={v.domain_coverage * 100} />
              <Meter label="Certification" value={(ev?.certification_coverage || 0) * 100} tone="leaf" />
              <Meter label="Architect readiness" value={(ev?.architect_readiness || 0) * 100} tone="amber" />
              {jr && <div style={{ margin: '12px 0', fontSize: 11.5, color: 'var(--muted)' }}><Lab>Focus stage</Lab><b style={{ color: 'var(--cherry-deep)' }}>{jr.focus_stage}</b> — {jr.why}</div>}
              <h5 style={{ marginTop: 14 }}>Recommendations</h5>
              {assess!.recommendations.length === 0 ? <div className="cc-muted">No fixes — this week is sound.</div> : assess!.recommendations.slice(0, 5).map((r) => (
                <div className="cc-rec" key={r.rank}><div className="rt"><Chip tone={r.severity === 'high' ? 'cherry' : r.severity === 'medium' ? 'amber' : 'berry'}>{r.severity}</Chip>{r.title}</div><p>{r.why}</p><button className="ap" disabled={busy === 'generate'} onClick={() => generate(r.title)}>＋ Apply</button></div>
              ))}
            </>
          )}
        </div>

        {/* RIGHT — Evidence */}
        <div className="cc-pane side">
          <h5><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="var(--leaf)" strokeWidth="2.5" strokeLinecap="round" /></svg> Evidence &amp; outcomes</h5>
          {!ev ? <div className="cc-muted">The proof students will produce appears here.</div> : (
            <>
              <Lab>GitHub</Lab>
              <div className="cc-ev"><span className="k">Repositories</span><span className="v">{ev.github.repos}</span></div>
              <div className="cc-ev"><span className="k">Commits</span><span className="v">{ev.github.commits}</span></div>
              <div className="cc-ev"><span className="k">Pull requests</span><span className="v">{ev.github.prs}</span></div>
              <Lab style={{ marginTop: 12 }}>Portfolio</Lab>
              <div className="cc-ev"><span className="k">Entries</span><span className="v">{ev.portfolio.entries}</span></div>
              <div className="cc-ev"><span className="k">Artifacts</span><span className="v">{ev.portfolio.artifacts}</span></div>
              <div className="cc-ev"><span className="k">Presentations</span><span className="v">{ev.portfolio.presentations}</span></div>
              <Lab style={{ marginTop: 12 }}>Produced</Lab>
              <div className="cc-ev"><span className="k">Labs</span><span className="v">{ev.counts.labs}</span></div>
              <div className="cc-ev"><span className="k">Reflections</span><span className="v">{ev.counts.reflections}</span></div>
              <div className="cc-ev"><span className="k">Evaluations</span><span className="v">{ev.counts.evaluations}</span></div>
              <Lab style={{ marginTop: 12 }}>XP + value</Lab>
              <div className="cc-ev"><span className="k">Builder XP</span><span className="v">{ev.xp.builder}</span></div>
              <div className="cc-ev"><span className="k">Learning XP</span><span className="v">{ev.xp.learning}</span></div>
              <div className="cc-ev"><span className="k">Employment value</span><span className="v" style={{ textTransform: 'capitalize' }}>{ev.employment_value}</span></div>
            </>
          )}
        </div>
      </div>

      {/* STATUS BAR */}
      <div className="cc-bar">
        <div className="st"><span className="l">Validation</span><span className={`v ${v ? (v.publishable ? 'ok' : 'bad') : ''}`}>{v ? (v.publishable ? '✓ passes' : '✗ blocked') : '—'}</span></div>
        <div className="st"><span className="l">Workload</span><span className="v">{v ? `${v.workload_hours}h` : '—'}</span></div>
        <div className="st"><span className="l">GitHub</span><span className="v">{ev ? `${ev.github.commits} commits` : '—'}</span></div>
        <div className="st"><span className="l">Portfolio</span><span className="v">{ev ? `+${ev.portfolio.entries}` : '—'}</span></div>
        <div className="st"><span className="l">Quality</span><span className={`v ${v && v.quality >= 70 ? 'ok' : v ? 'warn' : ''}`}>{v ? `${v.quality}/100` : '—'}</span></div>
        <div className="st"><span className="l">Readiness</span><span className="v">{v ? `${v.readiness}%` : '—'}</span></div>
        <Btn tone="cta" style={{ marginLeft: 'auto' }} disabled={!v || !v.publishable || busy === 'publish'} onClick={publish}>{busy === 'publish' ? 'Publishing…' : 'Publish to Timeline'}</Btn>
      </div>

      {/* ARCHITECT JOURNEY */}
      {jr && (
        <div className="cc-journey">
          {jr.stages.map((s, i) => (
            <React.Fragment key={s.name}>
              {i > 0 && <div className={`cc-jbar ${s.contributes ? 'on' : ''}`} />}
              <div className="cc-jstep">
                <div className={`cc-jdot ${s.name === jr.focus_stage ? 'focus' : s.contributes ? 'on' : ''}`}>{s.contributes ? '✓' : i}</div>
                <div className="cc-jlabel">{s.name}</div>
              </div>
            </React.Fragment>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default CurriculumComposerTab;
