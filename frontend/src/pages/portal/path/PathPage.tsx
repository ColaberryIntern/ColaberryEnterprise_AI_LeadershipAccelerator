import React, { useEffect, useState } from 'react';
import PortalShell from '../today/PortalShell';
import { fetchSchedule, fetchPoints, levelFor, OnboardingSchedule } from '../../../services/onboardingApi';
import './PathPage.css';

/**
 * PathPage — the "spine" view: a readiness ring, a 12-week roadmap SVG with four
 * phase bands plus project/cert lanes, the four intensive cards, and the four
 * progress lanes.
 *
 * Data-driven off the student's real position. Everyone starts at **Week 0**
 * (a free-preview node before the spine) and the view "keeps track of where the
 * student is": the current week is derived from their cohort start date (weeks
 * elapsed, clamped 0–12). Explorers / not-yet-started students sit at Week 0,
 * which paints a small green stub on the path — on the journey, but not yet at
 * Week 1. The readiness ring shows real points → level (from `/api/portal/points`).
 *
 * All content below the page header is wrapped in `.pp-root`, which redefines
 * the mockup's design tokens locally so the ported CSS resolves (see PathPage.css).
 */

type NodeState = 'done' | 'cur' | 'up';

// The 12 roadmap week nodes: [x, y, week, name]. Deterministic positions carried
// over from the Design E mockup. State is derived from the student's currentWeek.
type WeekNode = { x: number; y: number; wk: number; name: string };

const WEEK_NODES: WeekNode[] = [
  { x: 60, y: 150, wk: 1, name: 'Claude Code Foundations' },
  { x: 160, y: 160, wk: 2, name: 'Agent Skills' },
  { x: 260, y: 200, wk: 3, name: 'Claude API + Workflow Assistant' },
  { x: 360, y: 220, wk: 4, name: 'Prompt Engineering' },
  { x: 460, y: 200, wk: 5, name: 'MCP Foundations' },
  { x: 560, y: 160, wk: 6, name: 'Advanced MCP' },
  { x: 660, y: 150, wk: 7, name: 'Subagents / Multi-Agent' },
  { x: 760, y: 170, wk: 8, name: 'Workflows / Automation' },
  { x: 860, y: 210, wk: 9, name: 'Reliability' },
  { x: 940, y: 200, wk: 10, name: 'Governance' },
  { x: 1010, y: 180, wk: 11, name: 'Systems Architecture' },
  { x: 1080, y: 200, wk: 12, name: 'Capstone + Architect Expo' },
];

// Shared spine geometry (also used for the green "completed" overlay).
const SPINE_D = 'M60 150 C 230 150 230 220 400 220 S 570 150 740 150 S 910 220 1080 200';

/** A node's state relative to where the student currently is. */
function nodeState(wk: number, currentWeek: number): NodeState {
  if (wk < currentWeek) return 'done';
  if (wk === currentWeek) return 'cur';
  return 'up';
}

function nodeFill(st: NodeState): string {
  if (st === 'done') return '#5BA63C';
  if (st === 'cur') return '#FB2832';
  return '#F1F1F0';
}

/**
 * Weeks elapsed since the student's first class, clamped to 0–12. Explorers and
 * students whose class hasn't started yet sit at Week 0. This is the single
 * source of truth for "where is the student" across the whole view.
 */
function computeCurrentWeek(sched: OnboardingSchedule | null): number {
  if (!sched || sched.is_explorer) return 0;
  const start = sched.first_class?.start_date;
  if (!start) return 0;
  const startMs = new Date(start).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const now = Date.now();
  if (now < startMs) return 0; // enrolled, not started → Week 0
  const wk = Math.floor((now - startMs) / (7 * 24 * 3600 * 1000)) + 1;
  return Math.max(0, Math.min(12, wk));
}

// Reusable inline SVG glyphs for the intensive week pills (no emoji per DS rule).
const DoneCheck: React.FC = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none">
    <path d="M5 12l4 4L19 6" stroke="#468A2E" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
const CurrentDot: React.FC = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="5" fill="#FB2832" />
  </svg>
);
const UpcomingRing: React.FC = () => (
  <svg className="ic" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="8" stroke="var(--n400)" strokeWidth="2" />
  </svg>
);

/** One week pill inside an intensive card; glyph + "here" derive from state. */
const WkPill: React.FC<{ wk: number; label: string; currentWeek: number }> = ({ wk, label, currentWeek }) => {
  const st = nodeState(wk, currentWeek);
  return (
    <div className={`wp${st === 'cur' ? ' cur' : ''}`}>
      {st === 'done' ? <DoneCheck /> : st === 'cur' ? <CurrentDot /> : <UpcomingRing />}
      {`W${wk} ${label}`}{st === 'cur' ? ' — here' : ''}
    </div>
  );
};

/** Intensive banner state from the student's current week. */
function intensiveState(startWk: number, endWk: number, cur: number): NodeState {
  if (cur > endWk) return 'done';
  if (cur >= startWk) return 'cur';
  return 'up';
}
const INTENSIVE_LABEL: Record<NodeState, string> = { done: 'done', cur: 'in progress', up: 'upcoming' };

const PathPage: React.FC = () => {
  const [sched, setSched] = useState<OnboardingSchedule | null>(null);
  const [points, setPoints] = useState<number>(0);

  useEffect(() => {
    let alive = true;
    fetchSchedule().then((s) => { if (alive) setSched(s); }).catch(() => { /* default Week 0 */ });
    fetchPoints().then((p) => { if (alive) setPoints(p.total || 0); }).catch(() => { /* 0 pts */ });
    return () => { alive = false; };
  }, []);

  const currentWeek = computeCurrentWeek(sched);
  const lvl = levelFor(points);

  // Readiness ring: curriculum progress through the 12 weeks, with a small floor
  // at Week 0 so a brand-new student sees a sliver of green ("on the path").
  const readiness = currentWeek === 0 ? 3 : Math.round((currentWeek / 12) * 100);
  const RING_CIRC = 2 * Math.PI * 27; // r=27
  const ringOffset = RING_CIRC * (1 - readiness / 100);

  // Green completed spine: filled to the current week's position. At Week 0 the
  // main fill is empty and only the lead-in stub (M30→60) paints green.
  const spinePct = currentWeek === 0 ? 0 : Math.min(100, Math.round((currentWeek / 12) * 100));

  const i1 = intensiveState(1, 3, currentWeek);
  const i2 = intensiveState(4, 7, currentWeek);
  const i3 = intensiveState(8, 9, currentWeek);
  const i4 = intensiveState(10, 12, currentWeek);

  const started = currentWeek > 0;

  return (
    <PortalShell>
      <div className="te-page-h">
        <div className="crumb">The Spine</div>
        <h1>Your path to AI Systems Architect</h1>
        <div className="sub">
          Four intensives are the spine. Your project, internship, and certification run as
          parallel lanes that schedule around the fixed 12-week training.
        </div>
      </div>

      <div className="pp-root">
        <div className="pathwrap">
          <div className="pathhead">
            <div className="ring-wrap" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <svg width="70" height="70" viewBox="0 0 70 70">
                <circle cx="35" cy="35" r="27" fill="none" stroke="var(--surface-sunken)" strokeWidth="7" />
                <circle
                  cx="35"
                  cy="35"
                  r="27"
                  fill="none"
                  stroke="#FB2832"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={ringOffset}
                  transform="rotate(-90 35 35)"
                />
                <text
                  x="35"
                  y="40"
                  textAnchor="middle"
                  fontSize="16"
                  fontWeight="700"
                  fill="var(--text-strong)"
                  fontFamily="Roboto Mono,monospace"
                >
                  {readiness}%
                </text>
              </svg>
              <div className="ring-meta">
                <b>Architect Readiness</b>
                <span>
                  Level <b style={{ color: 'var(--cherry-text)', display: 'inline' }}>{lvl.name}</b>
                  {' · '}{points.toLocaleString()} pts · Week {currentWeek} / 12
                </span>
              </div>
            </div>
            <div className="legend-path">
              <span className="chip learning"><span className="sw" />Curriculum</span>
              <span className="chip project"><span className="sw" />Project</span>
              <span className="chip internship"><span className="sw" />Internship</span>
              <span className="chip cert"><span className="sw" />Cert · CCA-F</span>
            </div>
          </div>

          <svg
            className="pathsvg"
            viewBox="0 0 1140 360"
            role="img"
            aria-label="12-week roadmap"
            id="roadmap"
          >
            <g fontFamily="Roboto,sans-serif" fontWeight="700" fontSize="12.5">
              <rect x="30" y="20" width="248" height="26" rx="13" fill="rgba(251,40,50,.1)" />
              <text x="48" y="37" fill="#C20E1E">1 · Build Your AI Foundation</text>
              <rect x="298" y="20" width="232" height="26" rx="13" fill="rgba(91,166,60,.14)" />
              <text x="316" y="37" fill="#3C7A26">2 · Create Your AI Team</text>
              <rect x="550" y="20" width="282" height="26" rx="13" fill="rgba(54,120,149,.12)" />
              <text x="568" y="37" fill="#2E6A86">3 · Connect AI to the Real World</text>
              <rect x="852" y="20" width="258" height="26" rx="13" fill="rgba(232,146,12,.14)" />
              <text x="870" y="37" fill="#B5710A">4 · Design AI That Scales</text>
            </g>

            {/* base spine (unfilled) */}
            <path
              d={SPINE_D}
              fill="none"
              stroke="var(--surface-sunken)"
              strokeWidth="11"
              strokeLinecap="round"
            />
            {/* Week-0 lead-in stub — everyone is at least "on the path" */}
            <path
              d="M30 150 L60 150"
              fill="none"
              stroke="#5BA63C"
              strokeWidth="11"
              strokeLinecap="round"
            />
            {/* completed spine segment — filled to the current week via pathLength */}
            {spinePct > 0 && (
              <path
                d={SPINE_D}
                pathLength={100}
                fill="none"
                stroke="#5BA63C"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray="100"
                strokeDashoffset={100 - spinePct}
              />
            )}
            {/* project lane */}
            <path
              d="M280 220 C 280 300 520 300 520 300 L 800 300 C 920 300 940 230 1010 205"
              fill="none"
              stroke="#FB2832"
              strokeWidth="4"
              strokeDasharray="2 9"
              strokeLinecap="round"
              opacity=".7"
            />
            <text x="300" y="328" fontSize="11" fontWeight="700" fill="#C20E1E" fontFamily="Roboto,sans-serif">
              Project lane — your build
            </text>
            {/* cert lane */}
            <path
              d="M640 150 C 720 90 940 90 1020 90 C 1075 90 1085 120 1080 150"
              fill="none"
              stroke="#E8920C"
              strokeWidth="4"
              strokeDasharray="2 9"
              strokeLinecap="round"
              opacity=".7"
            />
            <text x="720" y="80" fontSize="11" fontWeight="700" fill="#B5710A" fontFamily="Roboto,sans-serif">
              CCA-F certification lane
            </text>

            {/* Week 0 node — the free-preview starting point (left of the spine) */}
            <g className="pnode">
              {currentWeek === 0 && (
                <circle cx={30} cy={150} r={20} fill="none" stroke="#5BA63C" strokeWidth="2" opacity=".5">
                  <animate attributeName="r" values="16;26;16" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values=".5;0;.5" dur="2.2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={30} cy={150} r={16} fill="#5BA63C" stroke="#fff" strokeWidth="3" />
              <text x={30} y={155} textAnchor="middle" fontSize="12" fontWeight="700" fontFamily="Roboto Mono,monospace" fill="#fff">0</text>
              <text x={30} y={184} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#3C7A26">Free</text>
            </g>

            {/* week nodes — state derived from currentWeek */}
            <g id="weekNodes">
              {WEEK_NODES.map((n) => {
                const st = nodeState(n.wk, currentWeek);
                return (
                  <g key={n.wk} className="pnode">
                    {st === 'cur' && (
                      <circle cx={n.x} cy={n.y} r={22} fill="none" stroke="#FB2832" strokeWidth="2" opacity=".5">
                        <animate attributeName="r" values="18;28;18" dur="2.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values=".5;0;.5" dur="2.2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      className="pnode-hit"
                      cx={n.x}
                      cy={n.y}
                      r={16}
                      fill={nodeFill(st)}
                      stroke="#fff"
                      strokeWidth="3"
                    />
                    <text
                      x={n.x}
                      y={n.y + 5}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="700"
                      fontFamily="Roboto Mono,monospace"
                      fill={st === 'up' ? '#6B6B6B' : '#fff'}
                    >
                      {n.wk}
                    </text>
                    <text
                      x={n.x}
                      y={n.y + 34}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="700"
                      fill="#6B6B6B"
                    >
                      {`W${n.wk}`}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="lanes">
            <div className="lane">
              <div className="lname">
                <span className="chip learning" style={{ padding: '3px 7px' }}><span className="sw" /></span>
                Curriculum spine
              </div>
              <div className="lanebar">
                <div className="lanefill" style={{ width: `${currentWeek === 0 ? 5 : readiness}%`, background: 'var(--berry)' }}>
                  {currentWeek === 0 ? 'Week 0 · getting started' : `Week ${currentWeek} / 12 · ${readiness}%`}
                </div>
              </div>
            </div>
            <div className="lane">
              <div className="lname">
                <span className="chip project" style={{ padding: '3px 7px' }}><span className="sw" /></span>
                Your project
              </div>
              <div className="lanebar">
                <div className="lanefill" style={{ width: started ? '38%' : '16%', background: 'var(--cherry)' }}>
                  {started ? 'Recipe Concierge · 38%' : 'Not started'}
                </div>
              </div>
            </div>
            <div className="lane">
              <div className="lname">
                <span className="chip internship" style={{ padding: '3px 7px' }}><span className="sw" /></span>
                Internship
              </div>
              <div className="lanebar">
                <div className="lanefill" style={{ width: started ? '22%' : '16%', background: 'var(--leaf-action)' }}>
                  {started ? 'Acme Analytics · 22%' : 'Not started'}
                </div>
              </div>
            </div>
            <div className="lane">
              <div className="lname">
                <span className="chip cert" style={{ padding: '3px 7px' }}><span className="sw" /></span>
                Certification
              </div>
              <div className="lanebar">
                <div className="lanefill" style={{ width: started ? '48%' : '16%', background: 'var(--amber)' }}>
                  {started ? 'CCA-F prep · 48%' : 'Not started'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="section-title">The four intensives</div>
        <div className="intensives">
          <div className={`intensive${i1 === 'done' ? ' done' : i1 === 'cur' ? ' cur' : ''}`}>
            <div className="num">Intensive 1 · {INTENSIVE_LABEL[i1]}</div>
            <h4>Build Your AI Foundation</h4>
            <div className="wk">Weeks 1–3</div>
            <div className="wkpills">
              <WkPill wk={1} label="Claude Code Foundations" currentWeek={currentWeek} />
              <WkPill wk={2} label="Agent Skills" currentWeek={currentWeek} />
              <WkPill wk={3} label="Claude API + Workflow" currentWeek={currentWeek} />
            </div>
          </div>

          <div className={`intensive${i2 === 'done' ? ' done' : i2 === 'cur' ? ' cur' : ''}`}>
            <div className="num">Intensive 2 · {INTENSIVE_LABEL[i2]}</div>
            <h4>Create Your AI Team</h4>
            <div className="wk">Weeks 4–7</div>
            <div className="wkpills">
              <WkPill wk={4} label="Prompt Engineering" currentWeek={currentWeek} />
              <WkPill wk={5} label="MCP Foundations" currentWeek={currentWeek} />
              <WkPill wk={6} label="Advanced MCP" currentWeek={currentWeek} />
              <WkPill wk={7} label="Subagents / Multi-Agent" currentWeek={currentWeek} />
            </div>
          </div>

          <div className={`intensive${i3 === 'done' ? ' done' : i3 === 'cur' ? ' cur' : ''}`}>
            <div className="num">Intensive 3 · {INTENSIVE_LABEL[i3]}</div>
            <h4>Connect AI to the Real World</h4>
            <div className="wk">Weeks 8–9</div>
            <div className="wkpills">
              <WkPill wk={8} label="Workflows / Automation" currentWeek={currentWeek} />
              <WkPill wk={9} label="Reliability" currentWeek={currentWeek} />
            </div>
          </div>

          <div className={`intensive${i4 === 'done' ? ' done' : i4 === 'cur' ? ' cur' : ''}`}>
            <div className="num">Intensive 4 · {INTENSIVE_LABEL[i4]}</div>
            <h4>Design AI That Scales</h4>
            <div className="wk">Weeks 10–12</div>
            <div className="wkpills">
              <WkPill wk={10} label="Governance" currentWeek={currentWeek} />
              <WkPill wk={11} label="Systems Architecture" currentWeek={currentWeek} />
              <WkPill wk={12} label="Capstone + Architect Expo" currentWeek={currentWeek} />
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
};

export default PathPage;
