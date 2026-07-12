/**
 * recipeRegistry — reusable authoring templates ("recipes"). A recipe biases the
 * AI "Generate Component" workflow toward a shape (interactivity, assessment
 * weight, evidence, capabilities) so authors design experiences, not forms.
 */
export interface Recipe {
  id: string;
  label: string;
  description: string;
  /** guidance injected into the generation LLM prompt */
  guidance: string;
  suggested_capabilities: string[];
  difficulty: 'intro' | 'core' | 'stretch';
}

export const RECIPES: Recipe[] = [
  { id: 'starter', label: 'Starter', description: 'Light, single-concept intro.', difficulty: 'intro', suggested_capabilities: ['reflection'], guidance: 'Keep it short and welcoming; one concept; low cognitive load.' },
  { id: 'interactive', label: 'Interactive', description: 'AI chat + hints + retry.', difficulty: 'core', suggested_capabilities: ['ai_chat', 'hint_system', 'retry', 'quiz'], guidance: 'Maximize back-and-forth; include an AI tutor and progressive hints.' },
  { id: 'executive', label: 'Executive', description: 'Concise, decision-oriented.', difficulty: 'core', suggested_capabilities: ['reflection', 'artifacts'], guidance: 'Frame for a busy executive: outcomes, trade-offs, a decision artifact.' },
  { id: 'certification', label: 'Certification', description: 'Rigorous, rubric-scored.', difficulty: 'stretch', suggested_capabilities: ['rubric', 'evaluation', 'scoring', 'mentor_review'], guidance: 'High rigor; explicit rubric; instructor review; certification-aligned.' },
  { id: 'enterprise', label: 'Enterprise', description: 'Team + governance framing.', difficulty: 'stretch', suggested_capabilities: ['artifacts', 'peer_review', 'evaluation'], guidance: 'Enterprise context: governance, stakeholders, production readiness.' },
  { id: 'workshop', label: 'Workshop', description: 'Hands-on, build-along.', difficulty: 'core', suggested_capabilities: ['ai_chat', 'artifacts', 'retry'], guidance: 'Step-by-step build-along; the student produces something by the end.' },
  { id: 'live_class', label: 'Live Class', description: 'Synchronous session anchor.', difficulty: 'core', suggested_capabilities: ['calendar', 'notifications', 'discussion'], guidance: 'Anchor a live session; pre-work + agenda + post-discussion.' },
  { id: 'bootcamp', label: 'Bootcamp', description: 'Intense, sequential.', difficulty: 'stretch', suggested_capabilities: ['github', 'evaluation', 'scoring', 'portfolio'], guidance: 'Fast, demanding, ships code; portfolio + GitHub evidence.' },
  { id: 'challenge', label: 'Challenge', description: 'Competitive stretch task.', difficulty: 'stretch', suggested_capabilities: ['scoring', 'evaluation', 'sharing'], guidance: 'A stretch challenge with a leaderboard-worthy scored output.' },
  { id: 'project', label: 'Project', description: 'Multi-step build with evidence.', difficulty: 'core', suggested_capabilities: ['github', 'artifacts', 'mentor_review', 'portfolio'], guidance: 'A real project: repo, artifacts, instructor review, portfolio entry.' },
  { id: 'assessment', label: 'Assessment', description: 'Pure evaluation.', difficulty: 'core', suggested_capabilities: ['rubric', 'evaluation', 'scoring'], guidance: 'Assess mastery against a rubric; no new teaching content.' },
  { id: 'interview', label: 'Interview', description: 'Mock interview / defense.', difficulty: 'stretch', suggested_capabilities: ['ai_chat', 'voice', 'evaluation', 'mentor_review'], guidance: 'Simulate an architect interview; AI interviewer + scored feedback.' },
];

const BY_ID = new Map(RECIPES.map((r) => [r.id, r]));
export const resolveRecipe = (id?: string) => (id ? BY_ID.get(id) : undefined);
