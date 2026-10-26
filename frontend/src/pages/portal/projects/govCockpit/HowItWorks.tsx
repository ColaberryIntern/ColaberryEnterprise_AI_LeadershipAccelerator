import React from 'react';

/**
 * HowItWorks — the static explainer for the cockpit's completion loop. Mirrors the rules the backend actually
 * enforces: a commit only PROPOSES completion, the build lives in a separate bound repo, proposals close by
 * approval, and revised-away work is preserved. No data, no state.
 */
const RULES: Array<{ h: string; p: React.ReactNode }> = [
  { h: 'A commit only proposes completion', p: <>A push that cites a task key moves that task to &ldquo;Commit matched&rdquo; and files the commit as evidence. It still needs a reviewer to verify it before it counts as done.</> },
  { h: 'Cite the key in the commit', p: <>Put the task&rsquo;s requirement key anywhere in the commit message. The cockpit matches it to the task and files the diff link as evidence.</> },
  { h: 'The build lives in its own repo', p: <>The build repo is bound to this gov project through its webhook, so pushes there are credited here and never to another project.</> },
  { h: 'Proposals close by approval', p: <>Proposal responses don&rsquo;t come from commits. They close when the response is approved with no open gaps, and pricing never appears on this view.</> },
  { h: 'Your job as the intern', p: <>Hand prompts to Claude Code, review matched commits against the acceptance criteria, answer proposal gaps, and record the demo. The copilot suggests what to do next.</> },
  { h: 'Rework is preserved', p: <>If a requirement is revised away, its task is flagged and its commits and evidence stay attached instead of disappearing.</> },
];

export default function HowItWorks(): React.ReactElement {
  return (
    <div className="gck-how">
      <div className="gck-rules">
        {RULES.map((r) => (
          <div className="gck-panel" key={r.h}><h3>{r.h}</h3><p>{r.p}</p></div>
        ))}
      </div>
    </div>
  );
}
