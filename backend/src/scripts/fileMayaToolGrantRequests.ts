/**
 * fileMayaToolGrantRequests - put Maya's tools in front of Ali through the real spine.
 *
 * -- WHAT THIS IS FOR --
 *
 * `agent_domain_tool_grants` held ZERO rows across all 31 agents. The request/approval spine
 * (`agent_domain_change_requests` kind='tool' -> `agent_domain_tool_grants`) was built, tested
 * and never used once, and `AgentToolsTab.tsx` records that as a finding rather than a bug. So
 * every agent's dashboard reads "held without a grant", including the one agent the public
 * actually talks to.
 *
 * This script files one tool request per Maya tool that is ready for one. It is the first real
 * use of that spine, and it is written so the same path works for the other thirty agents
 * afterwards: nothing in here is Maya-specific except the table of tools at the bottom.
 *
 * -- IT APPROVES NOTHING, AND IT CANNOT --
 *
 * Filing a request and deciding one are two different functions with two different authors.
 * This script calls `fileChangeRequest` only. `decideChangeRequest` and `acceptToolGrant` are
 * not imported, and a test asserts this file's import graph contains nothing that can grant.
 * The proposer is recorded as `claude-code`, and the grant gate refuses
 * `approver_is_the_proposer`, so even handed Ali's own session this script could not approve
 * its own requests.
 *
 * -- IT IS IDEMPOTENT --
 *
 * `fileChangeRequest` refuses `duplicate_open_request` for a tool that already has one open, so
 * running this twice files N rows rather than 2N. That refusal is treated as success here,
 * because "it is already in front of him" is the outcome this script wants.
 *
 * -- WHICH TOOLS IT FILES FOR, AND THE TWO GROUPS IT DELIBERATELY SKIPS --
 *
 *   FILED (9)    Tools required by a capability record. The only thing between each one and a
 *                grant is Ali confirming that capability. Proven by
 *                `maya/__tests__/mayaToolGrantReadiness.test.ts`.
 *
 *   SKIPPED (3)  `send_sms_summary`, `initiate_voice_call`, `enroll_in_campaign`. Their
 *                capabilities are REFUSED BY NAME, so they resolve `off` whatever anybody
 *                decides. Filing a request would ask Ali to approve a tool that cannot run
 *                either way, which reads as though approving it changed something.
 *
 *   SKIPPED (4)  `send_document`, `draft_marketing_email`, `start_campus_tour`,
 *                `create_journey_handoff`. No capability record in any of the eleven domain
 *                buckets requires these, so the gate refuses them
 *                `tool_not_required_by_capability` and would do so even with a confirmed
 *                capability. Closing that needs four capability records authored with the
 *                researched evidence the other 47 admissions capabilities carry. That is domain
 *                research, not wiring, and it is reported rather than invented.
 *
 * Run: `npx ts-node src/scripts/fileMayaToolGrantRequests.ts [--dry-run]`
 */

import { sequelize } from '../config/database';
import { fileChangeRequest } from '../services/agentDomain/agentChangeRequestService';
import { MAYA_TOOL_GOVERNANCE } from '../services/maya/mayaToolGovernance';

/** The domain Maya belongs to. Her capabilities live in `capabilities/admissions.json`. */
const DOMAIN_KEY = 'admissions';

/**
 * Who is recorded as asking. NOT Ali: the grant gate refuses `approver_is_the_proposer`, so
 * recording him here would make his own approval impossible.
 */
const PROPOSER = 'claude-code';

/** Ali asked for this on 2026-11-13; the window is the week after. */
const NEEDED_BY = '2026-11-20';

interface MayaToolRequest {
  tool: string;
  capabilityId: string;
  purpose: string;
  reads: string[];
  produces: string[];
  taskUnblocked: string;
  manualToday: string;
  runFrequency: 'per_event' | 'on_demand';
  touches: string[];
  inputs: string[];
  writes: boolean;
  sideEffects: string | null;
  reversible: boolean | null;
  reversibilityNote: string | null;
}

/**
 * The nine. Every field is what the tool actually does, read off its handler - the gate exists
 * to make a grant provable, so filler here would defeat the point of filing at all.
 */
const REQUESTS: ReadonlyArray<MayaToolRequest> = [
  {
    tool: 'retrieve_knowledge',
    capabilityId: 'admissions.maya_applicant_chat_response',
    purpose: 'Answer a visitor question from the curated admissions knowledge base rather than from the model.',
    reads: ['admissions_knowledge_entries'],
    produces: ['a knowledge passage quoted back into the chat'],
    taskUnblocked: 'Answering programme, pricing and schedule questions in the site chat without a person.',
    manualToday: 'A member of the admissions team answers the same questions by hand, in business hours.',
    runFrequency: 'per_event',
    touches: ['postgres (read)'],
    inputs: ['the visitor question', 'an optional category'],
    writes: false,
    sideEffects: null,
    reversible: null,
    reversibilityNote: null,
  },
  {
    tool: 'list_quotable_marketing_assets',
    capabilityId: 'admissions.maya_applicant_chat_response',
    purpose: 'Find which approved marketing assets she is allowed to quote, so she quotes those and not something invented.',
    reads: ['marketing assets marked quotable'],
    produces: ['a list of asset titles and the lines that may be quoted'],
    taskUnblocked: 'Letting the chat cite real published material instead of paraphrasing from memory.',
    manualToday: 'Nobody does this; she paraphrases, which is how an unverifiable claim reaches a visitor.',
    runFrequency: 'per_event',
    touches: ['postgres (read)'],
    inputs: ['an optional topic'],
    writes: false,
    sideEffects: null,
    reversible: null,
    reversibilityNote: null,
  },
  {
    tool: 'capture_lead_details',
    capabilityId: 'admissions.maya_applicant_chat_response',
    purpose: 'Record who she spoke to, so a conversation that went somewhere is not lost when the tab closes.',
    reads: ['existing lead rows, to match rather than duplicate'],
    produces: ['a lead row, or an update to one'],
    taskUnblocked: 'Following up on a site conversation at all.',
    manualToday: 'The conversation is read back out of the chat transcript by hand, when anybody remembers to.',
    runFrequency: 'per_event',
    touches: ['postgres (read and write)', 'GoHighLevel (contact sync)'],
    inputs: ['name', 'email', 'phone', 'company', 'title', 'interest type'],
    writes: true,
    sideEffects: 'Creates or updates a lead row and syncs the contact to GoHighLevel. It no longer '
      + 'enrols the lead in a campaign: that side effect was severed in this run and resolves the '
      + 'refused `enrollInCampaign` capability.',
    reversible: true,
    reversibilityNote: 'A lead row can be corrected or deleted. Nothing is sent as a result of writing it.',
  },
  {
    tool: 'update_lead_record',
    capabilityId: 'admissions.maya_applicant_chat_response',
    purpose: 'Correct or extend what we hold about a visitor when they tell her something new mid-conversation.',
    reads: ['the visitor lead row'],
    produces: ['an updated lead row'],
    taskUnblocked: 'Keeping a lead record true to the conversation without a person retyping it.',
    manualToday: 'An admissions team member edits the record afterwards, from the transcript.',
    runFrequency: 'per_event',
    touches: ['postgres (read and write)', 'GoHighLevel (contact sync)'],
    inputs: ['the field to change', 'the new value'],
    writes: true,
    sideEffects: 'Updates fields on an existing lead row and syncs the contact to GoHighLevel.',
    reversible: true,
    reversibilityNote: 'Field values can be corrected. No message is sent as a result.',
  },
  {
    tool: 'get_available_slots',
    capabilityId: 'admissions.appointment_booking_assistance',
    purpose: 'Read real availability off the admissions calendar so she offers times that exist.',
    reads: ['the admissions Google Calendar'],
    produces: ['a list of open slots'],
    taskUnblocked: 'Offering a specific time in the conversation instead of "someone will be in touch".',
    manualToday: 'A person checks the calendar and replies by email, usually the next day.',
    runFrequency: 'per_event',
    touches: ['Google Calendar (read)'],
    inputs: ['a date range'],
    writes: false,
    sideEffects: null,
    reversible: null,
    reversibilityNote: null,
  },
  {
    tool: 'schedule_strategy_call',
    capabilityId: 'admissions.appointment_booking_assistance',
    purpose: 'Book the time a visitor just chose, and send them the confirmation for it.',
    reads: ['the admissions calendar', 'the visitor lead row'],
    produces: ['a calendar event with a Meet link', 'a confirmation email', 'an appointment row'],
    taskUnblocked: 'Converting an interested visitor into a held meeting in the same conversation.',
    manualToday: 'A person books it by hand after reading the transcript, by which point the visitor has often gone.',
    runFrequency: 'per_event',
    touches: ['Google Calendar (write)', 'Mandrill (one confirmation email)', 'postgres (read and write)'],
    inputs: ['the chosen slot', 'name', 'email', 'phone', 'company'],
    writes: true,
    sideEffects: 'Writes a real calendar event with the visitor as an attendee, which causes Google '
      + 'to send its own invitation and reminder, and sends one confirmation email from a fixed '
      + 'template. Both are covered by the transactional receipt policy in '
      + 'docs/maya/MAYA_GOVERNANCE.md: a receipt of an action the person just took. Its former SMS '
      + 'and campaign-enrolment side effects were severed in this run and are refused by name.',
    reversible: true,
    reversibilityNote: 'The event can be cancelled, which notifies the attendee. The confirmation '
      + 'email cannot be unsent, which is why the template is fixed and limited to the facts of '
      + 'the booking.',
  },
  {
    tool: 'book_admissions_call',
    capabilityId: 'admissions.appointment_booking_assistance',
    purpose: 'Hand a signed-in learner the booking sheet so they pick their own time.',
    reads: [],
    produces: ['a deep link to the campus booking sheet'],
    taskUnblocked: 'Letting a learner in the portal reach the admissions calendar without leaving the chat.',
    manualToday: 'They are told to email admissions.',
    runFrequency: 'per_event',
    touches: ['nothing: it returns a link'],
    inputs: [],
    writes: false,
    sideEffects: null,
    reversible: null,
    reversibilityNote: null,
  },
  {
    tool: 'schedule_callback',
    capabilityId: 'admissions.callback_request_queue_management',
    purpose: 'Write down that a visitor asked to be called, with when and on what number.',
    reads: ['the visitor lead row'],
    produces: ['a callback request row for the admissions queue'],
    taskUnblocked: 'Capturing a "call me" so it reaches the queue rather than sitting in a transcript.',
    manualToday: 'Somebody reads the transcript and adds it to a list, if they see it.',
    runFrequency: 'per_event',
    touches: ['postgres (write)'],
    inputs: ['the number', 'the preferred window'],
    writes: true,
    sideEffects: 'Creates a callback request row. It places no call and sends no message: a person '
      + 'works the queue.',
    reversible: true,
    reversibilityNote: 'The row can be cancelled before anybody acts on it.',
  },
  {
    tool: 'request_callback',
    capabilityId: 'admissions.callback_request_queue_management',
    purpose: 'The same thing, from the portal chat, bound to the signed-in learner rather than a visitor id.',
    reads: ['the learner enrolment row'],
    produces: ['a callback request row for the admissions queue'],
    taskUnblocked: 'Letting a learner ask for a call from inside the product.',
    manualToday: 'They email admissions and wait.',
    runFrequency: 'per_event',
    touches: ['postgres (write)'],
    inputs: ['the number', 'the preferred window'],
    writes: true,
    sideEffects: 'Creates a callback request row. No call is placed and no message is sent.',
    reversible: true,
    reversibilityNote: 'The row can be cancelled before anybody acts on it.',
  },
];

export interface FileRequestsResult {
  filed: string[];
  alreadyOpen: string[];
  refused: Array<{ tool: string; rules: string[] }>;
  skipped: Array<{ tool: string; reason: string }>;
}

/** The tools this script deliberately does not file for, with the reason recorded per tool. */
export function skippedTools(): Array<{ tool: string; reason: string }> {
  const filing = new Set(REQUESTS.map((r) => r.tool));
  const out: Array<{ tool: string; reason: string }> = [];
  for (const tool of Object.keys(MAYA_TOOL_GOVERNANCE)) {
    if (filing.has(tool)) continue;
    const { capability } = MAYA_TOOL_GOVERNANCE[tool];
    const refusedByName = ['sendSmsSummary', 'placeVoiceCall', 'enrollInCampaign'].includes(capability);
    out.push({
      tool,
      reason: refusedByName
        ? `${capability} is refused by name, so this tool cannot run whatever is approved`
        : 'no capability record requires this tool yet, so there is no stated purpose to grant it for',
    });
  }
  return out;
}

export async function fileMayaToolGrantRequests(dryRun = false): Promise<FileRequestsResult> {
  const result: FileRequestsResult = {
    filed: [], alreadyOpen: [], refused: [], skipped: skippedTools(),
  };

  for (const r of REQUESTS) {
    if (dryRun) { result.filed.push(r.tool); continue; }
    try {
      await fileChangeRequest({
        sequelize,
        email: PROPOSER,
        kind: 'tool',
        domainKey: DOMAIN_KEY,
        title: `Grant Maya the ${r.tool} tool`,
        description: r.purpose,
        toolRequest: {
          tool_name: r.tool,
          purpose: r.purpose,
          reads: r.reads,
          produces: r.produces,
          capability_id: r.capabilityId,
          task_unblocked: r.taskUnblocked,
          manual_today: r.manualToday,
          needed_by: NEEDED_BY,
          run_frequency: r.runFrequency,
          touches: r.touches,
          inputs: r.inputs,
          writes: r.writes,
          side_effects: r.sideEffects,
          reversible: r.reversible,
          reversibility_note: r.reversibilityNote,
        },
      });
      result.filed.push(r.tool);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // A duplicate open request is the outcome this script wants on a second run: the tool is
      // already in front of him. Reported separately so a re-run reads as idempotent rather
      // than as nine failures.
      if (/duplicate_open_request/i.test(message)) {
        result.alreadyOpen.push(r.tool);
      } else {
        result.refused.push({ tool: r.tool, rules: [message] });
      }
    }
  }

  return result;
}

/* istanbul ignore next -- CLI entry point, exercised by running it */
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  fileMayaToolGrantRequests(dryRun)
    .then((r) => {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'info', service: 'maya',
        event: 'maya_tool_grant_requests_filed', outcome: r.refused.length === 0 ? 'success' : 'partial',
        context: {
          dry_run: dryRun,
          filed: r.filed.length, already_open: r.alreadyOpen.length,
          refused: r.refused.length, skipped: r.skipped.length,
        },
      }, null, 2));
      for (const s of r.skipped) console.log(`  skipped ${s.tool}: ${s.reason}`);
      for (const f of r.refused) console.log(`  REFUSED ${f.tool}: ${f.rules.join('; ')}`);
      console.log('\nNothing was approved. Every filed request waits on Ali at /admin/maya.');
      return sequelize.close();
    })
    .catch((err) => {
      console.error('[fileMayaToolGrantRequests] failed:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
      return sequelize.close();
    });
}
