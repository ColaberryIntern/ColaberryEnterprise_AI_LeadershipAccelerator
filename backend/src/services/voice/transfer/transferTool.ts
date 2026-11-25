/**
 * transfer_to_human (VS3.2): the one way the model can ask for a person. It is read-only in the
 * policy sense (it writes nothing and its destination is fixed server-side); what it returns is a
 * CONTROL the engine acts on after the agent's next sentence: end the AI session with a transfer
 * handoff, after which Twilio asks our <Connect action> URL what to do (humanTransfer.ts).
 *
 * If no teammate can take the call right now (no number configured, or outside transfer hours) it
 * returns no control, just an instruction to offer a callback, so the caller is never sent into a
 * dial that cannot be answered.
 */
import { z } from 'zod';
import type { RegisteredTool } from '../engines/toolBroker';
import { teammateAvailable } from './humanTransfer';

export const TRANSFER_TOOL = 'transfer_to_human';

export function transferToHumanTool(target: () => string | undefined, now: () => Date = () => new Date()): RegisteredTool {
  return {
    def: {
      name: TRANSFER_TOOL,
      description: 'Hand the call to a Colaberry teammate when the caller asks for a person or needs something you cannot do. You do not choose who or which number.',
      input_schema: { type: 'object', properties: { reason: { type: 'string', description: 'Why, in a few words.' } }, additionalProperties: false },
    },
    schema: z.object({ reason: z.string().max(200).optional() }).strict() as z.ZodType<unknown>,
    readOnly: true,
    run: async () => (teammateAvailable(target(), now())
      ? { content: 'A teammate can take the call. Tell the caller, in one short sentence, that you are connecting them now. Say nothing else.', control: 'transfer' as const }
      : 'No teammate is available right now. Tell the caller a teammate will call them back, and ask if there is anything else you can help with.'),
  };
}
