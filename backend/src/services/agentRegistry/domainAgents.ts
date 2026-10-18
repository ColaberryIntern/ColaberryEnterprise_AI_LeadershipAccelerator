import type { AgentSeedEntry } from './agentSeedTypes';

/**
 * The ten Agent Factory domain agents — AF3.1, Release Zero.
 *
 * One AI employee per provisioned domain, so each intern has an agent that EXISTS before they
 * are asked to build on it. Measured 17 Oct 2026: all ten domains had zero identity rows, which
 * is why AF2.2's console had nothing to open.
 *
 * Grouped in this module rather than inlined into the 3,384-line seed, following
 * `growthJourneyAgents.ts` — ten entries added to that file would be unreviewable, and a group
 * that arrives together should be readable together.
 *
 * ## These are employees #2 to #10, and the type says so
 *
 * `ai_employee`, not `ai_staff_mentor`. The union's own comment is explicit: `ai_staff_mentor`
 * carries Reese's "student DM, ProofDesk-linked" meaning, while `ai_employee` was added as "a
 * generic type, not a Reese-specific one, so future employees (#2-#10) reuse this same literal
 * rather than each minting their own". Dara is #1. These are the rest, and labelling them
 * `ai_staff_mentor` would claim a student-DM surface none of them has.
 *
 * ## RELEASE ZERO: created, NOT alive
 *
 * The ticket is blunt about the risk — "an agent created enabled, or with tools granted, or
 * above observe, is a live actor nobody approved". So every entry here:
 *
 *   enabled: false        honored only on first creation by the seed's findOrCreate loop, so a
 *                         later manual enable is never reset by a restart
 *   tools_granted: []     no capability. Granting one is AF7.1 and requires a manager
 *   autonomy_level        NOT set here, and deliberately not settable from a registry entry.
 *                         `classifyNewAgentAutonomyLevel` classifies on create from
 *                         tools_granted, and an empty array returns DEFAULT_CLASSIFICATION,
 *                         level `observe` — "the safe, honest default, not a guess". Verified
 *                         by reading that classifier, not assumed from the empty array.
 *   no reports_to         the reporting line is AF4.3, not R0
 *
 * `trigger_type: 'event_driven'` with an empty schedule, matching Dara: these are not crons.
 * Nothing invokes them on a timer, and nothing invokes them at all until a capability exists.
 *
 * ## About `category`
 *
 * `AiAgentCategory` is a closed union with no `marketing`, `sales` or `platform` member, so five
 * of the ten map exactly and five take the nearest honest existing value rather than a new
 * literal minted for tidiness. Marketing is deliberately NOT `outbound`: that category means the
 * agent sends, these send nothing, and borrowing it to get a kill switch would misdescribe the
 * row. `operations` is the honest fallback for a department agent with no category of its own.
 */

/** Shared by all ten, so a change to the Release Zero floor happens in one place. */
const RELEASE_ZERO = {
  agent_type: 'ai_employee',
  trigger_type: 'event_driven',
  schedule: '',
  enabled: false,
  tools_granted: [],
} as const;

const describe = (title: string, owns: string) =>
  `${title} — the Agent Factory domain employee for this department. Owns ${owns} `
  + 'RELEASE ZERO: created but not activated. Disabled, no tools granted, and autonomy '
  + 'auto-classified to observe because tools_granted is empty. It decides nothing, sends '
  + 'nothing and runs on no schedule; it exists so the domain has an inspectable agent to '
  + 'build on. Capability grants are AF7.1 and require a manager; the reporting line is AF4.3.';

export const DOMAIN_AGENT_ENTRIES: AgentSeedEntry[] = [
  {
    ...RELEASE_ZERO,
    agent_name: 'MarketingDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    // NOT 'outbound'. That category means the agent sends; this one sends nothing.
    category: 'operations',
    description: describe('Marketing',
      'brands, content, campaigns, communications, landing pages, publishing and the '
      + 'performance read behind them.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'CurriculumDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    category: 'curriculum',
    description: describe('Curriculum',
      'cohorts, components, the composer, capabilities and certification prep. Distinct from '
      + 'Dara, who owns curriculum integrity platform-wide; this one is the domain employee for '
      + 'the Agent Factory project.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'AdmissionsDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    category: 'admissions',
    description: describe('Admissions',
      'lead intake: sources, ingest logs, routing rules and import.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'InternshipDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    category: 'admissions_ops',
    description: describe('Internship',
      'the AI Internship application queue and the review it carries. That queue holds an '
      + 'applicant resume, phone number and interview transcript, which is why the section '
      + 'guarding it is separate from curriculum.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'SalesDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    // No 'revenue' member in the union; 'operations' rather than mint a literal for tidiness.
    category: 'operations',
    description: describe('Sales',
      'the revenue surface: pipeline, opportunities, payments, refunds and the funnel read.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'PlatformDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    category: 'operations',
    description: describe('Platform',
      'tickets, reports, settings, events, work-ledger health and automation. The widest-'
      + 'consequence department surface on the platform, which is why its capability grants '
      + 'will want more scrutiny than most.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'ProductExperienceDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    category: 'website_intelligence',
    description: describe('Product Experience',
      'the brands and websites the platform publishes to, and the checks run across them.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'LearnerSuccessDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    category: 'student_success',
    description: describe('Learner Success',
      'learner progress, intervention and the student story surface.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'ExecutiveDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    category: 'executive',
    description: describe('Executive',
      'the executive read: the war room, the trust surface and the narrative above them.'),
  },
  {
    ...RELEASE_ZERO,
    agent_name: 'WebsiteDomainAgent',
    module: 'agentDomain',
    source_file: 'backend/src/services/agentDomain/',
    category: 'website_intelligence',
    description: describe('Website',
      'the public website surface and what it publishes.'),
  },
];
