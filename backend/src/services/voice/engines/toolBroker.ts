/**
 * Tool broker for voice engines (VS2.3). Every model-requested tool call goes through here:
 *   - Only registered tools run; an unknown name returns an error result to the model, never throws.
 *   - Input is validated (Zod) before the tool runs; the model's JSON is untrusted output.
 *   - Idempotent per tool-call id: a repeated id (e.g. a turn re-issued after an interruption) returns
 *     the first result without running the tool again.
 *   - Every run has a hard timeout; a timeout or failure becomes a short apology result the model can
 *     speak, plus a stable error class for the log.
 *   - Read-only tools report committed=false; a tool that changes the world must say committed=true
 *     (none exist in Phase 2).
 *
 * The one Phase 2 tool, next_open_strategy_slots, wraps calendarService.getAvailableSlots (read-only
 * Google Calendar busy times; fails closed with a 503 when the calendar cannot be read).
 */
import { z } from 'zod';
import type { VoiceToolDef } from './claudeVoiceLlm';

export interface ToolOutcome { content: string; isError: boolean; committed: boolean; errorClass?: string }

interface RegisteredTool {
  def: VoiceToolDef;
  schema: z.ZodType<unknown>;
  readOnly: boolean;
  run: (input: unknown) => Promise<string>;
}

export interface SlotDay { date: string; slots: Array<{ start: string; end: string }> }
export type SlotSource = () => Promise<{ dates: SlotDay[]; timezone: string }>;

const TOOL_TIMEOUT_MS = 8_000;

/** Up to three well-spaced times from the first day that has any, spoken in Central Time. */
export function formatSlotsForSpeech(dates: SlotDay[], timezone: string): string {
  const day = dates.find((d) => d.slots.length > 0);
  if (!day) return 'No open strategy call times in the next two weeks. Offer to have a teammate follow up.';
  const n = day.slots.length;
  const picks = n <= 3 ? day.slots : [day.slots[0], day.slots[Math.floor(n / 2)], day.slots[n - 1]];
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `Open strategy call times (Central Time): ${picks.map((s) => fmt(s.start)).join('; ')}. Offer these, and do not book.`;
}

export function nextOpenSlotsTool(source: SlotSource): RegisteredTool {
  return {
    def: {
      name: 'next_open_strategy_slots',
      description: 'Look up the next open times for a strategy call with the Colaberry team. Read-only; it does not book anything.',
      input_schema: { type: 'object', properties: {}, additionalProperties: false },
    },
    schema: z.object({}).strict(),
    readOnly: true,
    run: async () => {
      const r = await source();
      return formatSlotsForSpeech(r.dates, r.timezone);
    },
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(Object.assign(new Error(`tool timed out after ${ms} ms`), { name: 'TimeoutError' })), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class ToolBroker {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly done = new Map<string, Promise<ToolOutcome>>();
  private static readonly MAX_REMEMBERED = 100;

  constructor(tools: RegisteredTool[], private readonly timeoutMs: number = TOOL_TIMEOUT_MS) {
    for (const t of tools) this.tools.set(t.def.name, t);
  }

  defs(): VoiceToolDef[] { return [...this.tools.values()].map((t) => t.def); }

  isReadOnly(name: string): boolean { return this.tools.get(name)?.readOnly ?? true; }

  /** Run (or replay) one tool call. Never throws. */
  run(callId: string, name: string, input: unknown): Promise<ToolOutcome> {
    const prior = this.done.get(callId);
    if (prior) return prior;
    if (this.done.size >= ToolBroker.MAX_REMEMBERED) this.done.delete(this.done.keys().next().value as string);
    const p = this.execute(name, input);
    this.done.set(callId, p);
    return p;
  }

  private async execute(name: string, input: unknown): Promise<ToolOutcome> {
    const tool = this.tools.get(name);
    if (!tool) return { content: `Unknown tool ${name}.`, isError: true, committed: false, errorClass: 'UnknownTool' };
    const parsed = tool.schema.safeParse(input ?? {});
    if (!parsed.success) return { content: 'The tool input was invalid.', isError: true, committed: false, errorClass: 'ValidationError' };
    try {
      const content = await withTimeout(tool.run(parsed.data), this.timeoutMs);
      return { content, isError: false, committed: !tool.readOnly };
    } catch (e) {
      const errorClass = (e as { name?: string })?.name === 'TimeoutError' ? 'TimeoutError' : 'ToolFailed';
      return { content: 'The calendar could not be checked right now. Offer to have a teammate follow up.', isError: true, committed: false, errorClass };
    }
  }
}
