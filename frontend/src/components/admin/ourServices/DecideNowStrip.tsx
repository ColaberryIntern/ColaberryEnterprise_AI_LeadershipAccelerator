import React from 'react';
import type { EvidenceSummary } from '../../../services/ourServicesApi';
import { daysUntil, formatCentralDate, gapsByPursuit } from './ourServicesModel';

/**
 * DecideNowStrip - the four "decide now" cards, sorted by urgency (most urgent first). Each card scrolls to the
 * section where the decision is made. Every count is from `summary.decideNow`; a count the server could not read
 * (null) says so instead of showing 0. Deadlines are calendar dates shown in Central time.
 */
export type DecideTarget = 'intake' | 'gaps' | 'quad' | 'catalog';
type Tone = 'danger' | 'warning' | 'info' | 'success' | 'secondary';

export interface DecideCard {
  key: string;
  /** RemixIcon class (house style: no emoji in product copy). */
  icon: string;
  title: string;
  body: string;
  when: string;
  tone: Tone;
  target: DecideTarget;
  /** Lower is more urgent. Infinity = nothing to decide (sorted last, shown quiet). */
  urgency: number;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** PURE: the four cards for a summary, most urgent first. Ties keep the mockup's order. */
export function buildDecideCards(summary: EvidenceSummary, now: Date): DecideCard[] {
  const d = summary.decideNow;
  const cards: DecideCard[] = [];

  const blocked = d.blockedCaseStudies.count;
  cards.push(blocked > 0
    ? { key: 'blocked', icon: 'ri-forbid-line', title: `${plural(blocked, 'case study is', 'case studies are')} blocked`, body: 'They cannot publish or count as evidence until each one is linked to a service.', when: 'Today · gate is blocking', tone: 'danger', target: 'intake', urgency: 0 }
    : { key: 'blocked', icon: 'ri-checkbox-circle-line', title: 'No case study is blocked', body: 'Every case study is linked to at least one service.', when: 'Nothing to decide', tone: 'secondary', target: 'intake', urgency: Infinity });

  const gapCount = d.openFitGaps.count;
  const groups = gapsByPursuit(d.openFitGaps.items);
  if (gapCount == null) {
    cards.push({ key: 'gaps', icon: 'ri-timer-line', title: 'Proposal gaps not available', body: 'The open pursuits could not be read right now. Reload to try again.', when: 'Unknown', tone: 'secondary', target: 'gaps', urgency: Infinity });
  } else if (gapCount === 0 || !groups.length) {
    cards.push({ key: 'gaps', icon: 'ri-timer-line', title: 'No open proposal gaps', body: 'No open pursuit has a capability marked Partly or New.', when: 'Nothing to decide', tone: 'secondary', target: 'gaps', urgency: Infinity });
  } else {
    const first = groups[0];
    const left = daysUntil(first.closeDate, now);
    const name = first.title ?? 'An open pursuit';
    const more = groups.length > 1 ? ` ${plural(groups.length - 1, 'more pursuit has', 'more pursuits have')} gaps too.` : '';
    cards.push({
      key: 'gaps', icon: 'ri-timer-line',
      title: `${name}: ${plural(first.gaps.length, 'gap', 'gaps')}, ${Number.isFinite(left) ? plural(Math.max(0, left), 'day', 'days') + ' left' : 'deadline unknown'}`,
      body: `${first.gaps.map((g) => g.name).slice(0, 2).join(' and ')} ${first.gaps.length === 1 ? 'is' : 'are'} marked Partly or New. Do we have case studies we never linked?${more}`,
      when: `Before ${formatCentralDate(first.closeDate)} (Central)`, tone: 'warning', target: 'gaps', urgency: Number.isFinite(left) ? Math.max(0, left) : 30,
    });
  }

  const demand = d.demandWithoutProof.count;
  cards.push(demand == null
    ? { key: 'demand', icon: 'ri-focus-3-line', title: 'Demand without proof: not available', body: 'Open opportunity matches could not be read, so in-demand services are unknown right now.', when: 'Unknown', tone: 'secondary', target: 'quad', urgency: Infinity }
    : demand > 0
      ? { key: 'demand', icon: 'ri-focus-3-line', title: `${plural(demand, 'service', 'services')} in demand without proof`, body: 'Open opportunities match them, but no case study backs them. These are the next case studies to write.', when: 'This quarter', tone: 'info', target: 'quad', urgency: 45 }
      : { key: 'demand', icon: 'ri-focus-3-line', title: 'No in-demand service lacks proof', body: 'Every service that open opportunities match has at least one case study.', when: 'Nothing to decide', tone: 'secondary', target: 'quad', urgency: Infinity });

  const stale = d.staleServices.count;
  cards.push(stale > 0
    ? { key: 'stale', icon: 'ri-seedling-line', title: `${plural(stale, 'service needs', 'services need')} fresh proof`, body: 'Their newest case study is more than a year old. Add a recent one so the match stays strong.', when: 'Next 60 days', tone: 'success', target: 'catalog', urgency: 60 }
    : { key: 'stale', icon: 'ri-seedling-line', title: 'No service has stale proof', body: 'Every service with proof has a case study from this year or last.', when: 'Nothing to decide', tone: 'secondary', target: 'catalog', urgency: Infinity });

  return cards
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.urgency === b.c.urgency ? a.i - b.i : a.c.urgency - b.c.urgency))
    .map((x) => x.c);
}

interface Props {
  summary: EvidenceSummary;
  now: Date;
  onJump: (target: DecideTarget) => void;
}

export default function DecideNowStrip({ summary, now, onJump }: Props): React.ReactElement {
  const cards = buildDecideCards(summary, now);
  return (
    <section aria-labelledby="decide-now-title" className="mb-4">
      <h2 id="decide-now-title" className="h5 fw-bold mb-1"><i className="ri-flashlight-line me-1 text-warning-emphasis" aria-hidden="true" />Decide now</h2>
      <p className="small text-secondary mb-2">Sorted by urgency. Select a card to jump to it.</p>
      <div className="row g-3">
        {cards.map((c) => (
          <div key={c.key} className="col-12 col-md-6 col-xl-3">
            <button
              type="button"
              onClick={() => onJump(c.target)}
              className={`w-100 h-100 text-start rounded-3 border p-3 d-flex gap-3 align-items-start bg-${c.tone}-subtle border-${c.tone}-subtle`}
              data-testid={`decide-${c.key}`}
            >
              <i className={`${c.icon} fs-3 lh-1 text-${c.tone}-emphasis`} aria-hidden="true" />
              <span>
                <span className="d-block fw-bold text-body mb-1" style={{ fontSize: '.95rem', lineHeight: 1.3 }}>{c.title}</span>
                <span className="d-block text-body-secondary" style={{ fontSize: '.8rem', lineHeight: 1.45 }}>{c.body}</span>
                <span className={`d-block fw-bold text-uppercase mt-2 text-${c.tone}-emphasis`} style={{ letterSpacing: '.05em', fontSize: '.72rem' }}>{c.when}</span>
              </span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
