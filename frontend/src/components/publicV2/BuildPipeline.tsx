import React, { useEffect, useRef, useState } from 'react';

/**
 * Section 3 — "From a sentence about your business to a shipped AI system."
 *
 * The centerpiece of Ali's platform redesign, ported from the prototype. Nine
 * stages, each naming who acts: the human, the AI, or the system. Stages light
 * as they scroll into view and the spine fills behind them.
 *
 * CONTENT IS THE PROTOTYPE'S, with two corrections carried from verification:
 *  - Stage 09 says the promotion gate re-evaluates. It does NOT say a human
 *    approves it. promotionService.ts implements `requires_ai_approval` through
 *    an aiApprover() hook whose default is permissive, so "human-reviewed
 *    approval" would be false. What is true -- that the gate needs more than
 *    points -- is what is written.
 *  - The skill deltas name real competencies (architecture, testing, debugging,
 *    deployment), not the prototype's invented ones.
 *
 * The artifact bodies are illustrative -- a worked example of a support-triage
 * build -- and say so in the section's own disclosure. That is sample VALUES on
 * a real pipeline shape, which is what the sample badge is for.
 */

interface Stage {
  n: string;
  actor: 'Human' | 'AI' | 'System';
  kicker: string;
  h: string;
  p: string;
  art?: { hd: string; body: React.ReactNode };
}

const STAGES: Stage[] = [
  {
    n: '01', actor: 'Human', kicker: 'Intake',
    h: 'Someone names a real cost.',
    p: 'Not a case study. Not a capstone. A thing that is expensive in their own department, this week.',
    art: {
      hd: 'Support Operations',
      body: (
        <p className="cbv2-bp__quote">
          &ldquo;We spend 40 hours every week manually triaging support tickets. Half of them are
          the same six categories.&rdquo;
        </p>
      ),
    },
  },
  {
    n: '02', actor: 'AI', kicker: 'Interview',
    h: 'The platform interviews them about it.',
    p: 'Structured intake, because a good system is mostly a question of exceptions and ownership — the parts people forget to write down.',
    art: {
      hd: 'Intake · capturing',
      body: (
        <ul className="cbv2-bp__qa">
          <li>What happens today, step by step, and who does it?</li>
          <li>Which systems hold the ticket, the customer and the history?</li>
          <li>What are the exceptions — the ones that must never be automated?</li>
          <li>Who is accountable when it goes wrong?</li>
          <li>What does success look like in a number?</li>
        </ul>
      ),
    },
  },
  {
    n: '03', actor: 'AI', kicker: 'Requirements · gated',
    h: 'The answers become requirements.',
    p: 'Typed, prioritized and clustered. A generated plan that fails the quality gate is repaired before anyone sees it.',
    art: {
      hd: 'docs/REQUIREMENTS.md',
      body: (
        <>
          <p className="cbv2-bp__tags">
            <span className="cbv2-bp__pill is-accent">REQ-001</span>
            <span className="cbv2-bp__pill is-blue">FUNC</span>
            <span className="cbv2-bp__pill">must</span>
          </p>
          <p>
            Incoming support requests are automatically classified into the six known categories,
            with a recorded confidence score for every decision.
          </p>
          <p className="cbv2-bp__tags cbv2-bp__tags--sep">
            <span className="cbv2-bp__pill is-accent">REQ-004</span>
            <span className="cbv2-bp__pill is-blue">SAFE</span>
            <span className="cbv2-bp__pill">must</span>
          </p>
          <p>
            Any classification below the confidence threshold is routed to a human queue and never
            auto-resolved.
          </p>
        </>
      ),
    },
  },
  {
    n: '04', actor: 'AI', kicker: 'Stories · release r1',
    h: 'Requirements become buildable stories.',
    p: 'Each story declares which requirements it fulfils and what blocks it. Release r0 is always the walking skeleton.',
    art: {
      hd: 'docs/stories/STORY-014.md',
      body: (
        <>
          <p className="cbv2-bp__tags">
            <span className="cbv2-bp__pill is-accent">STORY-014</span>
            <span className="cbv2-bp__pill">release r1</span>
            <span className="cbv2-bp__pill is-blue">fulfils REQ-001, REQ-004</span>
          </p>
          <p className="cbv2-bp__story">
            As a <b>support manager</b>, I want incoming requests categorized automatically with a
            confidence score, so that my team only reads the ones a machine could not safely call.
          </p>
        </>
      ),
    },
  },
  {
    n: '05', actor: 'System', kicker: 'Definition of done',
    h: 'Done gets defined before a line is written.',
    p: 'Acceptance criteria are written with the story, and one of them covers trust — what the system must refuse to do on its own.',
    art: {
      hd: 'Acceptance criteria · pending',
      body: (
        <ul className="cbv2-bp__ac">
          <li><i>·</i><span><b>Given</b> a new ticket arrives, <b>then</b> a category from the six known classes is assigned.</span></li>
          <li><i>·</i><span><b>Given</b> a classification is made, <b>then</b> a confidence score is recorded with it.</span></li>
          <li><i>·</i><span><b>Trust:</b> given confidence below the threshold, <b>then</b> the ticket routes to the human queue and is never auto-resolved.</span></li>
        </ul>
      ),
    },
  },
  {
    n: '06', actor: 'AI', kicker: 'Prompt assembly',
    h: 'Every story arrives with its Claude Code prompt.',
    p: 'Generated from their own requirements, not a canned classroom exercise. The assembler checks the repository manifest first and refuses to cite a file that was never written.',
    art: {
      hd: 'Claude Code · STORY-014',
      body: (
        <pre className="cbv2-bp__term">
          <span className="c-com"># Read this first</span>{'\n'}
          docs/REQUIREMENTS.md      <span className="c-ok">✓ in manifest</span>{'\n'}
          docs/stories/STORY-014.md <span className="c-ok">✓ in manifest</span>{'\n'}
          CLAUDE.md                 <span className="c-ok">✓ in manifest</span>{'\n\n'}
          <span className="c-key">Implement</span> STORY-014 in this repository.{'\n'}
          <span className="c-key">Fulfils</span> REQ-001 (FUNC, must), REQ-004 (SAFE, must){'\n\n'}
          <span className="c-com"># Commit with the story trailer so the platform{'\n'}# can verify it:</span>{'\n'}
          {'  '}<span className="c-str">Story: STORY-014</span>
        </pre>
      ),
    },
  },
  {
    n: '07', actor: 'Human', kicker: 'Build',
    h: 'Your employee writes the code.',
    p: 'In their editor, with Claude Code, against their own repository. The platform does not write the system for them — that is the entire point. The capability has to end up in the person.',
    art: {
      hd: 'workspace · support-triage',
      body: (
        <pre className="cbv2-bp__term">
          <span className="c-com">$</span> claude{'\n'}
          <span className="c-com">›</span> reading docs/stories/STORY-014.md{'\n'}
          <span className="c-com">›</span> src/triage/classifier.py    <span className="c-ok">edited</span>{'\n'}
          <span className="c-com">›</span> src/routing/human_queue.py  <span className="c-ok">created</span>{'\n'}
          <span className="c-com">›</span> tests/test_low_conf.py      <span className="c-ok">created</span>{'\n\n'}
          <span className="c-com">$</span> git commit -m <span className="c-str">&quot;Route low-confidence tickets to human queue&quot;</span> \{'\n'}
          {'    '}-m <span className="c-str">&quot;Story: STORY-014&quot;</span>{'\n'}
          <span className="c-ok">[main a91c4f2]</span> 4 files changed
        </pre>
      ),
    },
  },
  {
    n: '08', actor: 'System', kicker: 'Repository verification',
    h: 'The repository decides whether it shipped.',
    p: 'The push webhook is only a nudge. The platform re-reads the repository from the source and confirms each acceptance criterion against what is actually there.',
    art: {
      hd: 'Verified · STORY-014 · from repository',
      body: (
        <>
          <ul className="cbv2-bp__ac is-pass">
            <li><i>✓</i><span>Category assigned from the six known classes</span></li>
            <li><i>✓</i><span>Confidence recorded with each classification</span></li>
            <li><i>✓</i><span><b>Trust:</b> low-confidence routed to the human queue, never auto-resolved</span></li>
          </ul>
          <p className="cbv2-bp__meta">
            commit <b>a91c4f2</b> · trailer <b>Story: STORY-014</b> · recorded as evidence
          </p>
        </>
      ),
    },
  },
  {
    n: '09', actor: 'System', kicker: 'Capability ledger',
    h: 'Capability moves — and leadership sees it.',
    p: 'The verified evidence lands in the ledger, the affected competencies re-compute, and the promotion gate re-evaluates. Nobody typed a number in anywhere.',
    art: {
      hd: 'Skill ledger · applied',
      body: (
        <>
          <p className="cbv2-bp__deltas">
            <span>+8 Architecture</span>
            <span>+7 Testing</span>
            <span>+4 Debugging</span>
            <span>+3 Deployment</span>
          </p>
          <p className="cbv2-bp__meta">
            The gate re-evaluates against its evidence minimums. It never passes on points alone —
            there is an approval step beyond the totals.
          </p>
        </>
      ),
    },
  },
];

export default function BuildPipeline(): React.ReactElement {
  const [lit, setLit] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setLit(STAGES.length); return undefined; }

    const onScroll = (): void => {
      const host = ref.current;
      if (!host) return;
      const rows = Array.from(host.querySelectorAll('[data-stage]'));
      let n = 0;
      rows.forEach((r) => { if (r.getBoundingClientRect().top < window.innerHeight * 0.72) n += 1; });
      setLit(n);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-bp-title">
      <div className="cbv2-wrap">
        <div className="cbv2-section__head">
          <p className="cbv2-eyebrow">The build pipeline</p>
          <h2 id="cbv2-bp-title">From a sentence about your business to a shipped AI system</h2>
          <p className="cbv2-lede">
            This is the machine. Someone describes a cost they live with every week. The platform
            turns it into requirements, stories, acceptance criteria and a Claude Code prompt
            written from <em>their</em> requirements &mdash; then reads the repository to decide
            whether it actually shipped.
          </p>
        </div>

        <div className="cbv2-bp" ref={ref}>
          <span
            className="cbv2-bp__fill"
            style={{ height: `${(Math.max(lit - 1, 0) / (STAGES.length - 1)) * 100}%` }}
            aria-hidden="true"
          />
          {STAGES.map((s, i) => (
            <article
              className={`cbv2-bp__stg${i < lit ? ' is-on' : ''}${i >= 7 && i < lit ? ' is-done' : ''}`}
              data-stage
              key={s.n}
            >
              <span className="cbv2-bp__n" aria-hidden="true">{s.n}</span>
              <p className="cbv2-bp__actor">
                <em className={`is-${s.actor.toLowerCase()}`}>{s.actor}</em>
                {s.kicker}
              </p>
              <h3>{s.h}</h3>
              <p className="cbv2-bp__p">{s.p}</p>
              {s.art ? (
                <div className="cbv2-bp__art">
                  <p className="cbv2-bp__arthd">{s.art.hd}</p>
                  <div className="cbv2-bp__artbd">{s.art.body}</div>
                </div>
              ) : null}
            </article>
          ))}
        </div>

        <p className="cbv2-bp__foot">
          What comes out is a system running against your workflows, under governance, with the
          evidence trail behind it &mdash; and the people who built it still on your payroll.
        </p>

        <p className="cbv2-bp__note">
          <b>Worked example.</b> The support-triage build above is illustrative &mdash; it shows the
          shape of the pipeline, not a customer&rsquo;s project. The stages, artefacts and the
          story-trailer verification are how it actually runs.
        </p>
      </div>
    </section>
  );
}
