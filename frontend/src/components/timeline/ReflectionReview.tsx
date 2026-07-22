import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runtimeApi, WeekReview, WrActivity, WrSignalsInput } from '../../pages/portal/runtime/runtimeApi';
import './ReflectionReview.css';

/**
 * ReflectionReview — the bespoke renderer for the weekly "Week in Review"
 * Reflection card. Where the card's generated body_html is class-wide (the roster
 * of what the week contained), this shows what THIS student actually did — real
 * completions, quiz/evaluation scores, survey, and skill movement — then captures
 * two strategic signals (readiness + application) that save as the student picks.
 * Renders in the drawer and the workspace (same component, `variant` widens it).
 */

interface Props {
  cardId: string;
  variant?: 'drawer' | 'workspace';
  preview?: boolean;
}

const EMOJI: Record<string, string> = {
  announcement: '📣', warmup: '📖', knowledge_check: '✅', architect_mindset: '🧭', video: '🎬',
  live_class: '👥', deep_dive: '🔎', anthropic_skills_jar: '🎓', prompt_lab: '🧪', setup_lab: '🖥️',
  implementation_task: '🏗️', github_sync: '🔁', artifact_submission: '📦', community_discussion: '🤝',
  evaluation: '📊', survey: '📝', reflection: '🪞',
};
const emojiFor = (t: string) => EMOJI[t] || '•';

const READY: Record<number, [string, string]> = {
  1: ['Not yet', "We'll queue a guided walkthrough for you."],
  2: ['Getting there', "We'll reinforce this in the next section."],
  3: ['Steady', 'You have the basics; the next week builds on it.'],
  4: ['Confident', "We'll hand you a real brief and check in lightly."],
  5: ['Fluent', "We'll route you a real build for your portfolio."],
};
const APPLICATION = [
  { value: 'at_my_job', label: 'At my job' },
  { value: 'side_project', label: 'A side project' },
  { value: 'not_sure', label: 'Not sure yet' },
];
const DIRECTION = [
  { value: 'ai_architect', label: 'AI Architect' },
  { value: 'ai_engineer', label: 'AI Engineer' },
  { value: 'ai_consultant', label: 'AI Consultant' },
  { value: 'exploring', label: 'Still exploring' },
];

// A small illustrative dataset for admin/Experience-Studio preview (no live student).
const PREVIEW: WeekReview = {
  program_id: null, week: 1, week_title: 'Claude Code Foundations + Workspace',
  stats: { total: 8, completed: 6, time_invested_min: 210, points: 180, growth_score: 75 },
  activities: [
    { card_id: '1', type: 'knowledge_check', label: 'Knowledge Check', title: 'Knowledge Check: core concepts', bucket: 'pre_class', phase: 'Prep', minutes: 15, completed: true, status: 'completed', quiz_score: 0.9 },
    { card_id: '2', type: 'anthropic_skills_jar', label: 'Skills Course', title: 'Claude Code 101', bucket: 'learn', phase: 'Learn', minutes: 90, completed: true, status: 'completed', quiz_score: null },
    { card_id: '3', type: 'deep_dive', label: 'Deep Dive', title: 'Deep Dive: context engineering', bucket: 'learn', phase: 'Learn', minutes: 15, completed: true, status: 'completed', quiz_score: null },
    { card_id: '4', type: 'implementation_task', label: 'Build', title: 'Build Your First Claude Code Project', bucket: 'build', phase: 'Build', minutes: 60, completed: true, status: 'completed', quiz_score: null },
    { card_id: '5', type: 'github_sync', label: 'GitHub Sync', title: 'Sync Your Project to GitHub', bucket: 'build', phase: 'Build', minutes: 20, completed: false, status: 'available', quiz_score: null },
    { card_id: '6', type: 'evaluation', label: 'Evaluation', title: 'Week 1 Evaluation', bucket: 'reflect', phase: 'Reflect', minutes: 20, completed: true, status: 'completed', quiz_score: 0.88 },
  ],
  skills: [
    { domain: 'claude_code', label: 'Claude Code', beginning: 0.2, current: 0.6, delta: 0.4 },
    { domain: 'build_discipline', label: 'Build Discipline', beginning: 0.1, current: 0.45, delta: 0.35 },
  ],
  evaluation: { score: 0.88, passed: true, growth: 0.3 },
  survey: { avg_rating: 4.2, open: 'Pace felt right; setup was the hard part.' },
  signals: null,
  generated_at: new Date().toISOString(),
};

const pct = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100));

const ReflectionReview: React.FC<Props> = ({ cardId, variant = 'drawer', preview = false }) => {
  const [data, setData] = useState<WeekReview | null>(preview ? PREVIEW : null);
  const [loading, setLoading] = useState(!preview);
  const [readiness, setReadiness] = useState<number>(3);
  const [application, setApplication] = useState<string | null>(null);
  const [direction, setDirection] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const completedOnce = useRef(false);

  useEffect(() => {
    if (preview) return;
    let alive = true;
    setLoading(true);
    runtimeApi.weekReview(cardId)
      .then((wr) => {
        if (!alive) return;
        setData(wr);
        if (wr.signals) {
          if (wr.signals.readiness != null) setReadiness(wr.signals.readiness);
          setApplication(wr.signals.application ?? null);
          setDirection(wr.signals.direction ?? null);
        }
      })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [cardId, preview]);

  const save = useCallback((patch: WrSignalsInput) => {
    if (preview) return;
    setSaveState('saving');
    runtimeApi.saveReflectionSignals(cardId, patch)
      .then(() => {
        setSaveState('saved');
        // The reflection completes on submit — mark it done once (best-effort; points).
        if (!completedOnce.current) {
          completedOnce.current = true;
          runtimeApi.complete(cardId).catch(() => { /* best-effort */ });
        }
      })
      .catch(() => setSaveState('idle'));
  }, [cardId, preview]);

  const activitiesByPhase = useMemo(() => {
    const groups: Array<{ phase: string; items: WrActivity[] }> = [];
    (data?.activities || []).forEach((a) => {
      let g = groups.find((x) => x.phase === a.phase);
      if (!g) { g = { phase: a.phase, items: [] }; groups.push(g); }
      g.items.push(a);
    });
    return groups;
  }, [data]);

  if (loading) {
    return <div className="rfx"><div className="rfx__loading">Gathering your week…</div></div>;
  }
  if (!data) {
    return (
      <div className={`rfx${variant === 'workspace' ? ' rfx--workspace' : ''}`}>
        <div className="rfx__wrap">
          <p className="rfx__ey">Reflection</p>
          <h2 className="rfx__h">Your week in review</h2>
          <p className="rfx__sub">Your personalized recap will appear here as you complete this week's activities.</p>
        </div>
      </div>
    );
  }

  const { stats, evaluation, survey } = data;
  const readyPct = ((readiness - 1) / 4) * 100;
  const headline = stats.total > 0 && stats.completed >= stats.total
    ? 'You finished the whole week.'
    : stats.completed > 0
      ? `You completed ${stats.completed} of ${stats.total} activities this week.`
      : "Here's your week — let's make it count.";

  return (
    <div className={`rfx${variant === 'workspace' ? ' rfx--workspace' : ''}`}>
      <div className="rfx__wrap">
        {preview && <span className="rfx__ribbon">Preview · each student sees their own</span>}

        <p className="rfx__ey">Week {data.week} · {data.week_title}</p>
        <h2 className="rfx__h">{headline}</h2>
        <p className="rfx__sub">A recap of what you did and how far you moved — then two quick things only you can tell us.</p>

        <div className="rfx__stats">
          <span className="rfx__stat"><b>{stats.completed}/{stats.total}</b> activities</span>
          <span className="rfx__stat"><b>{Math.round(stats.time_invested_min / 6) / 10}</b> hrs invested</span>
          {stats.points > 0 && <span className="rfx__stat"><b>{stats.points}</b> points</span>}
        </div>

        <div className="rfx__gs">
          <div className="rfx__gsrow">
            <span className="l">Growth this week</span>
            <span className="v">{stats.growth_score}%
              {evaluation?.score != null && (
                <span className={`rfx__evalchip${evaluation.passed === false ? ' warn' : ''}`}>
                  Eval {pct(evaluation.score)}%{evaluation.passed === false ? ' · retry' : ''}
                </span>
              )}
            </span>
          </div>
          <div className="rfx__track"><i style={{ width: `${stats.growth_score}%` }} /></div>
          <p className="rfx__gsnote">Share of this week's activities you've completed.</p>
        </div>

        <div className={variant === 'workspace' ? 'rfx__grid' : ''}>
          <div>
            <div className="rfx__sl">What you did this week</div>
            {activitiesByPhase.map((g) => (
              <React.Fragment key={g.phase}>
                <div className="rfx__ph">{g.phase} · {g.items.length}</div>
                <div className="rfx__block">
                  {g.items.map((a) => (
                    <div className="rfx__row" key={a.card_id}>
                      <span className="g">{emojiFor(a.type)}</span>
                      <span className="t">{a.title}<span className="m">{a.label} · {a.minutes}m</span></span>
                      {a.quiz_score != null ? (
                        <span className="rfx__res score">{pct(a.quiz_score)}%</span>
                      ) : a.completed ? (
                        <span className="rfx__res done">Done</span>
                      ) : (
                        <span className="rfx__res todo">To do</span>
                      )}
                    </div>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>

          <div>
            <div className="rfx__sl">How your skills moved</div>
            {data.skills.length > 0 ? (
              data.skills.map((s) => {
                const cur = pct(s.current) ?? 0;
                const delta = s.delta != null ? Math.round(s.delta * 100) : null;
                return (
                  <div className="rfx__meter" key={s.domain}>
                    <div className="top">
                      <span className="nn">{s.label}</span>
                      <span className={`dd${delta && delta > 0 ? '' : ' flat'}`}>
                        {delta != null ? `${delta >= 0 ? '+' : ''}${delta}%` : `${cur}%`}
                      </span>
                    </div>
                    <div className="rfx__mtrack"><i style={{ width: `${cur}%` }} /></div>
                  </div>
                );
              })
            ) : (
              <div className="rfx__empty">Your skills move as you take this section's Knowledge Check and Evaluation — the deltas will show up here.</div>
            )}

            {survey && (survey.avg_rating != null || survey.open) && (
              <>
                <div className="rfx__sl">From your survey</div>
                <div className="rfx__survey">
                  {survey.avg_rating != null && <span>You rated the week <b>{survey.avg_rating}/5</b>.</span>}
                  {survey.open && <div className="q">"{survey.open}"</div>}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rfx__sl">Two quick signals</div>
        <div className="rfx__q">
          <p className="k">Readiness</p>
          <p className="qq">How ready do you feel to use this week's skill on real work?</p>
          <p className="qw">Sets your review schedule and where your mentor focuses next.</p>
          <input
            type="range" min={1} max={5} step={1} value={readiness}
            className="rfx__slider"
            style={{ background: `linear-gradient(90deg,#2e5aac 0 ${readyPct}%, #d6dce7 ${readyPct}% 100%)` }}
            aria-label="Readiness from 1 to 5"
            onChange={(e) => setReadiness(Number(e.target.value))}
            onPointerUp={(e) => save({ readiness: Number((e.currentTarget as HTMLInputElement).value) })}
            onKeyUp={(e) => save({ readiness: Number((e.currentTarget as HTMLInputElement).value) })}
          />
          <div className="rfx__scl"><span>Not yet</span><span>Getting there</span><span>Ship it</span></div>
          <div className="rfx__read">You picked <b>{readiness} — {READY[readiness][0]}.</b> {READY[readiness][1]}</div>
        </div>

        <div className="rfx__q">
          <p className="k">Application</p>
          <p className="qq">Where will you put this to work first?</p>
          <p className="qw">Tailors the examples we show you — and shows your sponsor the ROI.</p>
          <div className="rfx__chips">
            {APPLICATION.map((o) => (
              <button
                key={o.value} type="button" className="rfx__chip"
                aria-pressed={application === o.value}
                onClick={() => { const v = application === o.value ? null : o.value; setApplication(v); save({ application: v }); }}
              >{o.label}</button>
            ))}
          </div>
        </div>

        <div className="rfx__q">
          <p className="k">Direction</p>
          <p className="qq">This is moving me toward…</p>
          <p className="qw">Tunes your role-path recommendations and interview prep.</p>
          <div className="rfx__chips">
            {DIRECTION.map((o) => (
              <button
                key={o.value} type="button" className="rfx__chip"
                aria-pressed={direction === o.value}
                onClick={() => { const v = direction === o.value ? null : o.value; setDirection(v); save({ direction: v }); }}
              >{o.label}</button>
            ))}
          </div>
        </div>

        <div className="rfx__saved">
          <span className={`ck${saveState === 'saving' ? ' pending' : ''}`}>{saveState === 'saving' ? '…' : '✓'}</span>
          {saveState === 'saving' ? 'Saving…' : 'Saved to your learning story — close this and keep going whenever you\'re ready.'}
        </div>
      </div>
    </div>
  );
};

export default ReflectionReview;
