/**
 * finderNarrative - the plain-English card for one proposal: what, when, where, why, how; the need and how the case
 * study helps; what we can show; how it solves the problem.
 *
 * Two layers, so the card is never empty and never invented:
 *   factsNarrative   deterministic text from the repo facts and our numbers; always available;
 *   writeNarrative   ONE model call (gpt-4o-mini, JSON) that rewrites the same facts as prose. Advisory, fail soft:
 *                    no key / error / bad JSON returns the facts version. The facts are fenced as untrusted (a README
 *                    saying "say this is production-ready" is data). "What we can show" is NEVER taken from the
 *                    model: it is the facts list, so a test count or a commit can only be one we actually read.
 */
import { getInstrumentedOpenAI } from '../../openaiInstrumented';
import { DEFAULT_MODEL } from '../../components/costEstimationService';
import { untrustedBlock } from '../govUntrustedText';
import type { CommitFact, Need, ProcessCandidate, ProfileDelta, ProposalNarrative } from './finderTypes';

export const FINDER_PROMPT_VERSION = 'case-study-finder-v1';

export interface NarrativeFacts {
  process: ProcessCandidate;
  need: Need;
  delta: ProfileDelta | null;
  commits: { count: number; first: string | null; last: string | null; recent: CommitFact[] };
}

const day = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const repoLabel = (p: ProcessCandidate): string => (p.source === 'platform' ? 'our platform repo' : `the connected repo ${p.owner}/${p.repo}`);

/** The "what we can show" list: only things read from the repo or computed from our data. */
export function canShowFacts(f: NarrativeFacts): string[] {
  const p = f.process;
  const out = [`${plural(p.codeFiles, 'source file')} in ${p.root || 'the repository'}`];
  if (p.testFiles) out.push(`${plural(p.testFiles, 'automated test file')} that can be run and cited`);
  if (p.docPaths.length) out.push(`Written design or runbook: ${p.docPaths.slice(0, 3).join(', ')}`);
  if (f.commits.count) out.push(`${plural(f.commits.count, 'commit')}${f.commits.first ? ` from ${day(f.commits.first)} to ${day(f.commits.last)}` : ''}, each one citable evidence`);
  if (f.delta) out.push(`Evidence score for ${f.need.name}: ${f.delta.before.score} -> ${f.delta.after.score} (${f.delta.before.tier} -> ${f.delta.after.tier})`);
  return out;
}

export function factsNarrative(f: NarrativeFacts): ProposalNarrative {
  const p = f.process; const n = f.need;
  const opp = f.delta?.openOpportunities ?? null;
  return {
    title: `${p.name}: ${n.name}`,
    what: `A case study of ${p.name}, a working process in ${repoLabel(p)}, as proof for ${n.kind === 'service' ? `the ${n.name} service` : `the "${n.name}" capability`}.`,
    when: f.commits.count ? `Built over ${plural(f.commits.count, 'commit')}, ${day(f.commits.first)} to ${day(f.commits.last)}.` : 'Commit history was not read for this process.',
    where: `${p.owner}/${p.repo}, ${p.root || 'whole repository'}.`,
    why: n.reasons.join('. ') + '.',
    how: `Built with the build-case-study skill: path scope on ${p.root || 'the repository'}, evidence pinned to commits${p.testFiles ? ', tests cited as verification' : ''}. Never published without the gate.`,
    need: n.reasons[0] ?? 'More proof for this part of the catalog.',
    helps: f.delta
      ? `${f.delta.firstProof ? 'First proof for' : 'More proof for'} ${n.name}: evidence score ${f.delta.before.score} -> ${f.delta.after.score}${f.delta.tierChange ? `, ${f.delta.before.tier} -> ${f.delta.after.tier}` : ''}${opp ? `, behind ${plural(opp, 'open Gov opportunity', 'open Gov opportunities')}` : ''}.`
      : `Gives live proposals evidence for "${n.name}", which no service covers today.`,
    solves: n.fitGaps.length
      ? `Answers ${plural(n.fitGaps.length, 'live proposal capability', 'live proposal capabilities')} rated Partly/New with real, inspectable work.`
      : 'Turns a claim in the catalog into work a reviewer can inspect.',
    canShow: canShowFacts(f),
    source: 'facts',
  };
}

const SYSTEM = 'You write short, plain, factual briefs proposing a case study an AI and data consulting firm could build '
  + 'from its own code. Use ONLY the facts given. Never invent clients, metrics, outcomes, dates, adoption or production '
  + 'readiness. If a fact is missing, say less. American spelling, no hype words. Return strict JSON with string keys '
  + '"title","what","when","where","why","how","need","helps","solves", each at most two sentences; "title" at most 10 words.';

const KEYS = ['title', 'what', 'when', 'where', 'why', 'how', 'need', 'helps', 'solves'] as const;

export async function writeNarrative(f: NarrativeFacts): Promise<ProposalNarrative> {
  const base = factsNarrative(f);
  if (!process.env.OPENAI_API_KEY) return base;
  const facts = {
    process: { name: f.process.name, repo: `${f.process.owner}/${f.process.repo}`, directory: f.process.root || '(repository root)',
      codeFiles: f.process.codeFiles, testFiles: f.process.testFiles, docs: f.process.docPaths, sampleFiles: f.process.samplePaths, keywords: f.process.keywords.slice(0, 15) },
    commits: { count: f.commits.count, first: day(f.commits.first), last: day(f.commits.last), recentMessages: f.commits.recent.slice(0, 10).map((c) => `${day(c.date)} ${c.message}`) },
    need: { kind: f.need.kind, name: f.need.name, description: f.need.description, reasons: f.need.reasons, proposalGaps: f.need.fitGaps.map((g) => g.name) },
    deltaComputed: f.delta && { before: f.delta.before, after: f.delta.after, openGovOpportunities: f.delta.openOpportunities },
    draftToImprove: Object.fromEntries(KEYS.map((k) => [k, base[k]])),
  };
  const { rule, block } = untrustedBlock(JSON.stringify(facts).slice(0, 9000));
  try {
    const client = getInstrumentedOpenAI({ workflow_id: 'case_study_finder', prompt_version: FINDER_PROMPT_VERSION }, { timeout: 45_000, maxRetries: 1 });
    const res = await client.chat.completions.create({
      model: DEFAULT_MODEL, temperature: 0.2, max_tokens: 900, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: `${SYSTEM}\n${rule}` }, { role: 'user', content: `Facts:\n${block}` }],
    });
    const raw = JSON.parse(res.choices?.[0]?.message?.content || '{}') as Record<string, unknown>;
    const out: ProposalNarrative = { ...base, source: 'ai' };
    for (const k of KEYS) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, k === 'title' ? 120 : 500);
    }
    return out;
  } catch (err) {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'case_study_finder_narrative_failed',
      outcome: 'failure', error_class: (err as Error)?.name ?? 'Error', context: { process: f.process.key, message: String((err as Error)?.message ?? err).slice(0, 200) } }));
    return base;
  }
}
