/**
 * AF2.2's facts, measured against production on 17 Oct 2026.
 *
 * The ticket's premise is that there is no generalised agent console and one must be built. That
 * premise is wrong in the same way AF2.1's and AF2.6's were: the console exists, it is already
 * per-agent, and `AgentDetailPage.tsx` says so in its own comment - "Generic by construction
 * (this page fetches by route...)". It renders Work and Decisions, Performance Settings, and the
 * explain-this-decision surface the 14 Oct call described.
 *
 * So the real question is not "build a console". It is "can an intern reach theirs", and the
 * answer is no, for three stacked reasons that have nothing to do with the page.
 */

const MEASURED_ON = '17 October 2026';
const SEV = { ok: '#2f7d32', watch: '#b26a00', bad: '#b3261e', ink: '#2d3748' };

const V = {
  EXISTS: { key: 'EXISTS', label: 'Already built', color: SEV.ok },
  BLOCKED: { key: 'BLOCKED', label: 'Blocks the intern', color: SEV.bad },
  MISSING: { key: 'MISSING', label: 'Does not exist', color: SEV.bad },
  DECISION: { key: 'DECISION', label: 'Ali decides', color: SEV.watch },
};

/** The three gates in front of an intern, in the order they fire. Which one fires first matters. */
const GATES = [
  {
    n: 1, name: 'mgmtSectionGate',
    verdict: V.BLOCKED,
    detail: '`/api/admin/agents` is UNMAPPED in PATH_SECTION, so `pathToSection` returns null '
      + 'and a scoped role is denied by default before any router middleware runs. This is the '
      + 'gate that actually fires today.',
    measured: 'All three interns probed: 403 "You do not have access to this section."',
    fix: 'One row in the path table - the same one-line shape as the agent-domains fix earlier '
      + 'today. On its own it changes nothing, because gate 3 then refuses.',
  },
  {
    n: 2, name: 'requireAdmin',
    verdict: V.EXISTS,
    detail: 'Bridge-minted tokens carry role `admin`, so this passes already.',
    measured: 'Not the blocker.',
    fix: 'None needed.',
  },
  {
    n: 3, name: 'requireAgentManagerOrAdmin',
    verdict: V.BLOCKED,
    detail: 'Resolves an `org_members` row by the caller email, then requires the agent to be in '
      + 'that person’s DOWNSTREAM REPORTING CHAIN. An intern is neither.',
    measured: '0 org_members rows for every intern checked. And only 27 of 257 agents have any '
      + '`reports_to` at all, so for most agents there is no chain to be downstream of.',
    fix: 'Not a line of code. The interns are not in the org structure this authorization model '
      + 'is built on, and putting them there is a decision about the org, not a patch.',
  },
];

/** AF3.1, this ticket's other dependency, has not run. */
const AGENTS_PER_DOMAIN = [
  { domain: 'internship', builder: 'Tashima Diah', agents: 0 },
  { domain: 'learner_success', builder: null, agents: 0 },
  { domain: 'product_experience', builder: 'Mihret Netsereab', agents: 0 },
  { domain: 'sales', builder: 'Victoria Spencer-Auber', agents: 0 },
  { domain: 'platform', builder: 'Quincy Nkwain Ninying', agents: 3 },
  { domain: 'curriculum', builder: 'Ruth Kumera', agents: 5 },
  { domain: 'marketing', builder: 'Sarbjit Kaur', agents: 5 },
  { domain: 'executive', builder: null, agents: 6 },
  { domain: 'website', builder: null, agents: 7 },
  { domain: 'admissions', builder: 'Kalkidan Bezabeh', agents: 27 },
];

const AGENT_CAVEAT = 'Those counts are agents whose NAME contains the domain key, which is a '
  + 'weak proxy and deliberately labeled as one. Admissions showing 27 is substring noise, not '
  + '27 admissions agents. There is no column that says "this agent belongs to this domain" - '
  + 'that is what AF3.1 was meant to establish, and AF3.1 has not started. Four domains match '
  + 'nothing at all, so for those interns there is no agent to open under any reading.';

const RESERVED = {
  question: 'May interns send instructions at all before their agent has any confirmed '
    + 'capability, or is the console read-only until AF7.1 lands?',
  why: 'The ticket reserves this to Ali, and the measurement sharpens it: 255 of 257 agents sit '
    + 'at autonomy level "observe" and no capability has been validated. An instruction path '
    + 'opened now would be seven interns able to drive agents that nothing has yet said are '
    + 'allowed to act.',
  recommendation: 'Read-only until AF7.1. It satisfies the call’s actual promise - see what '
    + 'your agent has done, see its decisions, see what it cost - without turning a teaching '
    + 'surface into a dispatch surface before a single capability has been validated.',
};

const WHAT_I_DID_NOT_DO = [
  'I did not map `/api/admin/agents` into the section gate. It is a one-line change and it '
    + 'would be misleading: the error message would improve from "no access to this section" to '
    + '"no linked org member record" and the intern would still be refused. Fixing the gate that '
    + 'is not the real blocker looks like progress and is not.',
  'I did not add a bypass for testing. The ticket says to stop and set BLOCKED instead, and that '
    + 'instruction is the right one - a bypass here is how seven interns get the ability to make '
    + '255 observe-level agents act on production.',
  'I did not build a second console. The one that exists is already generic, and the ticket '
    + 'itself says to generalise rather than design a new one.',
];

const HEADLINE = 'The console already exists and is already per-agent. No intern can reach it, '
  + 'for three reasons, and only one of them is code.';
const ASKED = 'An intern can open their agent in the management portal, see what it has done, '
  + 'and send it an instruction, with every action still subject to the authorization gate.';
const DELIVERED = 'The measurement: which gate actually refuses them, why fixing it would not '
  + 'help, and what is missing underneath. No code changed, and the review state is BLOCKED.';

module.exports = {
  MEASURED_ON, SEV, V, GATES, AGENTS_PER_DOMAIN, AGENT_CAVEAT, RESERVED, WHAT_I_DID_NOT_DO,
  HEADLINE, ASKED, DELIVERED,
};
