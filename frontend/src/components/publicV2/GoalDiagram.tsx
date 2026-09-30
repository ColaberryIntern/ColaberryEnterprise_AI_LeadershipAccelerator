import React from 'react';

/**
 * One line-art diagram per goal, in the house style established on
 * training.colaberry.com: labelled nodes, dashed connectors that flow, small-caps
 * labels and a figure caption underneath.
 *
 * WHAT EACH DIAGRAM IS ALLOWED TO SAY. These sit directly under a recommended
 * service, so a diagram that implied more than the service delivers would be a
 * claim like any other. Each one draws the SHAPE of the engagement and nothing
 * about outcomes: no numbers, no percentages, no counts. The scored bars in the
 * first are deliberately unlabelled for that reason -- they show that ranking
 * happens, not what anyone's ranking came out as.
 *
 * The whole graphic is aria-hidden. Every node label repeats a word already in
 * the heading, service name or explanation beside it, so announcing it would
 * make a screen reader read the same content twice; the caption carries the
 * one-line summary as real text.
 *
 * Motion is CSS-only (a marching dash offset plus a slow node pulse) so nothing
 * here runs a timer, and it stops completely under prefers-reduced-motion.
 */

export type GoalKey = 'opportunity' | 'workflow' | 'people' | 'team';

const CAPTION: Record<GoalKey, string> = {
  opportunity: 'Fig. 01 — workflows in, scored, ranked',
  workflow: 'Fig. 02 — the slow step, rebuilt and governed',
  people: 'Fig. 03 — assess, build, evidence',
  team: 'Fig. 04 — embed, set standards, hand back',
};

/** Small-caps label. y is the BASELINE, not the box top. */
function Label({ x, y, children, anchor = 'middle' }: {
  x: number; y: number; children: React.ReactNode; anchor?: 'start' | 'middle' | 'end';
}): React.ReactElement {
  return (
    <text className="cbv2-gd__lbl" x={x} y={y} textAnchor={anchor}>
      {children}
    </text>
  );
}

function Opportunity(): React.ReactElement {
  // Unranked ideas on the left, a scoring gate, a ranked stack on the right.
  const ideas = [0, 1, 2, 3];
  return (
    <>
      <Label x={46} y={16}>Workflows</Label>
      {ideas.map((i) => (
        <rect
          key={i}
          className="cbv2-gd__box"
          x={12 + (i % 2) * 38}
          y={28 + Math.floor(i / 2) * 30}
          width={32}
          height={20}
          rx={4}
        />
      ))}

      <path className="cbv2-gd__flow" d="M88 58 H126" />

      <circle className="cbv2-gd__hub" cx={148} cy={58} r={21} />
      <circle className="cbv2-gd__hubdot" cx={148} cy={58} r={4} />
      <Label x={148} y={95}>Scored</Label>

      <path className="cbv2-gd__flow cbv2-gd__flow--b" d="M170 58 H208" />

      <Label x={244} y={16}>Ranked</Label>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          className={`cbv2-gd__bar${i === 0 ? ' is-lead' : ''}`}
          x={212}
          y={30 + i * 22}
          width={64 - i * 16}
          height={14}
          rx={4}
        />
      ))}
    </>
  );
}

function Workflow(): React.ReactElement {
  // A serial chain whose middle step is the one being rebuilt.
  const steps = [0, 1, 2];
  return (
    <>
      <Label x={40} y={16}>Today</Label>
      {steps.map((i) => (
        <rect key={i} className="cbv2-gd__box" x={12 + i * 46} y={28} width={36} height={22} rx={4} />
      ))}
      <path className="cbv2-gd__flow" d="M48 39 H58" />
      <path className="cbv2-gd__flow" d="M94 39 H104" />

      <rect className="cbv2-gd__pick" x={56} y={24} width={44} height={30} rx={6} />
      <Label x={78} y={70}>Slow step</Label>

      <path className="cbv2-gd__flow cbv2-gd__flow--down" d="M78 78 V96" />

      <rect className="cbv2-gd__box is-accent" x={52} y={102} width={52} height={24} rx={5} />
      <Label x={78} y={142}>Rebuilt</Label>

      <path className="cbv2-gd__flow cbv2-gd__flow--b" d="M112 114 H186" />
      <rect className="cbv2-gd__box" x={192} y={100} width={64} height={28} rx={5} />
      <Label x={224} y={144}>Governed</Label>
      <circle className="cbv2-gd__pulse" cx={224} cy={114} r={5} />
    </>
  );
}

function People(): React.ReactElement {
  // One person, three gates: assessed, building, evidenced.
  return (
    <>
      <circle className="cbv2-gd__head" cx={34} cy={44} r={11} />
      <path className="cbv2-gd__body" d="M16 74 a18 18 0 0 1 36 0" />
      <Label x={34} y={96}>Your team</Label>

      <path className="cbv2-gd__flow" d="M60 58 H98" />

      <rect className="cbv2-gd__box" x={102} y={30} width={56} height={24} rx={5} />
      <Label x={130} y={70}>Assessed</Label>

      <rect className="cbv2-gd__box is-accent" x={102} y={80} width={56} height={24} rx={5} />
      <Label x={130} y={120}>Building</Label>

      <path className="cbv2-gd__flow cbv2-gd__flow--b" d="M164 58 H202" />
      <path className="cbv2-gd__flow cbv2-gd__flow--b" d="M164 92 H202" />

      <rect className="cbv2-gd__box is-ok" x={206} y={44} width={62} height={44} rx={6} />
      <path className="cbv2-gd__tick" d="M222 66 l10 10 l18 -20" />
      <Label x={237} y={104}>Evidence</Label>
    </>
  );
}

function Team(): React.ReactElement {
  // An architect inside the team boundary, standards set, practice handed back.
  return (
    <>
      <rect className="cbv2-gd__pen" x={10} y={24} width={124} height={92} rx={8} />
      <Label x={72} y={16}>Your team</Label>

      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle className="cbv2-gd__head" cx={38 + i * 30} cy={52} r={8} />
          <path className="cbv2-gd__body" d={`M${25 + i * 30} 74 a13 13 0 0 1 26 0`} />
        </g>
      ))}

      <circle className="cbv2-gd__head is-accent" cx={72} cy={98} r={9} />
      <Label x={72} y={134}>Architect embedded</Label>

      <path className="cbv2-gd__flow cbv2-gd__flow--b" d="M140 70 H196" />
      <rect className="cbv2-gd__box" x={200} y={38} width={68} height={26} rx={5} />
      <Label x={234} y={80}>Standards</Label>

      <path className="cbv2-gd__flow cbv2-gd__flow--back" d="M196 104 H140" />
      <Label x={234} y={124}>Handed back</Label>
      <rect className="cbv2-gd__box is-ok" x={200} y={90} width={68} height={26} rx={5} />
    </>
  );
}

const SHAPES: Record<GoalKey, () => React.ReactElement> = {
  opportunity: Opportunity,
  workflow: Workflow,
  people: People,
  team: Team,
};

export default function GoalDiagram({ goal }: { goal: GoalKey }): React.ReactElement | null {
  const Shape = SHAPES[goal];
  if (!Shape) return null;
  return (
    <figure className={`cbv2-gd cbv2-gd--${goal}`}>
      <svg viewBox="0 0 288 152" role="img" aria-hidden="true" focusable="false">
        <Shape />
      </svg>
      <figcaption>{CAPTION[goal]}</figcaption>
    </figure>
  );
}
