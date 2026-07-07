import React from 'react';
import PortalShell from '../today/PortalShell';
import './PathPage.css';

/**
 * PathPage — faithful visual port of the "Path" view from the Design E mockup
 * (design-e-colaberry-ds-LATEST-2026-06-24.html, section id="view-path").
 *
 * The "spine" view: a readiness ring, a 12-week roadmap SVG with four phase
 * bands plus project/cert lanes, the four intensive cards, and the four
 * progress lanes. Data is static/mock (same values the mockup hardcodes). This
 * is a visual port only — nodes/intensives/lanes are non-interactive (no drill
 * panels), matching the integration contract.
 *
 * All content below the page header is wrapped in `.pp-root`, which redefines
 * the mockup's design tokens locally so the ported CSS resolves (see
 * PathPage.css).
 */

type NodeState = 'done' | 'cur' | 'up';

// The 12 roadmap week nodes, reproduced statically from the mockup's IIFE that
// builds #weekNodes. Each tuple: [x, y, week, state]. Deterministic positions.
type WeekNode = { x: number; y: number; wk: number; st: NodeState; name: string };

const WEEK_NODES: WeekNode[] = [
  { x: 60, y: 150, wk: 1, st: 'done', name: 'Claude Code Foundations' },
  { x: 160, y: 160, wk: 2, st: 'done', name: 'Agent Skills' },
  { x: 260, y: 200, wk: 3, st: 'done', name: 'Claude API + Workflow Assistant' },
  { x: 360, y: 220, wk: 4, st: 'done', name: 'Prompt Engineering' },
  { x: 460, y: 200, wk: 5, st: 'cur', name: 'MCP Foundations' },
  { x: 560, y: 160, wk: 6, st: 'up', name: 'Advanced MCP' },
  { x: 660, y: 150, wk: 7, st: 'up', name: 'Subagents / Multi-Agent' },
  { x: 760, y: 170, wk: 8, st: 'up', name: 'Workflows / Automation' },
  { x: 860, y: 210, wk: 9, st: 'up', name: 'Reliability' },
  { x: 940, y: 200, wk: 10, st: 'up', name: 'Governance' },
  { x: 1010, y: 180, wk: 11, st: 'up', name: 'Systems Architecture' },
  { x: 1080, y: 200, wk: 12, st: 'up', name: 'Capstone + Architect Expo' },
];

function nodeFill(st: NodeState): string {
  if (st === 'done') return '#5BA63C';
  if (st === 'cur') return '#FB2832';
  return '#F1F1F0';
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

const PathPage: React.FC = () => (
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
                strokeDasharray="169.6"
                strokeDashoffset="93"
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
                45%
              </text>
            </svg>
            <div className="ring-meta">
              <b>Architect Readiness</b>
              <span>
                Level <b style={{ color: 'var(--cherry-text)', display: 'inline' }}>Builder</b> · 2,140 pts
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
            d="M60 150 C 230 150 230 220 400 220 S 570 150 740 150 S 910 220 1080 200"
            fill="none"
            stroke="var(--surface-sunken)"
            strokeWidth="11"
            strokeLinecap="round"
          />
          {/* completed spine segment */}
          <path
            d="M60 150 C 230 150 230 220 400 220 S 540 150 600 150"
            fill="none"
            stroke="#5BA63C"
            strokeWidth="11"
            strokeLinecap="round"
          />
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

          {/* week nodes (statically reproduced from the mockup IIFE) */}
          <g id="weekNodes">
            {WEEK_NODES.map((n) => (
              <g key={n.wk} className="pnode">
                {n.st === 'cur' && (
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
                  fill={nodeFill(n.st)}
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
                  fill="#fff"
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
            ))}
          </g>
        </svg>

        <div className="lanes">
          <div className="lane">
            <div className="lname">
              <span className="chip learning" style={{ padding: '3px 7px' }}><span className="sw" /></span>
              Curriculum spine
            </div>
            <div className="lanebar">
              <div className="lanefill" style={{ width: '42%', background: 'var(--berry)' }}>Week 5 / 12 · 42%</div>
            </div>
          </div>
          <div className="lane">
            <div className="lname">
              <span className="chip project" style={{ padding: '3px 7px' }}><span className="sw" /></span>
              Your project
            </div>
            <div className="lanebar">
              <div className="lanefill" style={{ width: '38%', background: 'var(--cherry)' }}>Recipe Concierge · 38%</div>
            </div>
          </div>
          <div className="lane">
            <div className="lname">
              <span className="chip internship" style={{ padding: '3px 7px' }}><span className="sw" /></span>
              Internship
            </div>
            <div className="lanebar">
              <div className="lanefill" style={{ width: '22%', background: 'var(--leaf-action)' }}>Acme Analytics · 22%</div>
            </div>
          </div>
          <div className="lane">
            <div className="lname">
              <span className="chip cert" style={{ padding: '3px 7px' }}><span className="sw" /></span>
              Certification
            </div>
            <div className="lanebar">
              <div className="lanefill" style={{ width: '48%', background: 'var(--amber)' }}>CCA-F prep · 48%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="section-title">The four intensives</div>
      <div className="intensives">
        <div className="intensive done">
          <div className="num">Intensive 1 · done</div>
          <h4>Build Your AI Foundation</h4>
          <div className="wk">Weeks 1–3</div>
          <div className="wkpills">
            <div className="wp"><DoneCheck />W1 Claude Code Foundations</div>
            <div className="wp"><DoneCheck />W2 Agent Skills</div>
            <div className="wp"><DoneCheck />W3 Claude API + Workflow</div>
          </div>
        </div>

        <div className="intensive cur">
          <div className="num">Intensive 2 · in progress</div>
          <h4>Create Your AI Team</h4>
          <div className="wk">Weeks 4–7</div>
          <div className="wkpills">
            <div className="wp"><DoneCheck />W4 Prompt Engineering</div>
            <div className="wp cur"><CurrentDot />W5 MCP Foundations — here</div>
            <div className="wp"><UpcomingRing />W6 Advanced MCP</div>
            <div className="wp"><UpcomingRing />W7 Subagents / Multi-Agent</div>
          </div>
        </div>

        <div className="intensive">
          <div className="num">Intensive 3 · upcoming</div>
          <h4>Connect AI to the Real World</h4>
          <div className="wk">Weeks 8–9</div>
          <div className="wkpills">
            <div className="wp"><UpcomingRing />W8 Workflows / Automation</div>
            <div className="wp"><UpcomingRing />W9 Reliability</div>
          </div>
        </div>

        <div className="intensive">
          <div className="num">Intensive 4 · upcoming</div>
          <h4>Design AI That Scales</h4>
          <div className="wk">Weeks 10–12</div>
          <div className="wkpills">
            <div className="wp"><UpcomingRing />W10 Governance</div>
            <div className="wp"><UpcomingRing />W11 Systems Architecture</div>
            <div className="wp"><UpcomingRing />W12 Capstone + Architect Expo</div>
          </div>
        </div>
      </div>
    </div>
  </PortalShell>
);

export default PathPage;
