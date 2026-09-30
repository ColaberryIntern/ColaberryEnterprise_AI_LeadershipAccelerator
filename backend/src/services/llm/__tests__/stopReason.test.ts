/**
 * stopReason — normalising "how did the model stop?" across providers.
 *
 * The invariant under test: a response that does not clearly say it FINISHED can
 * never read as success. Absent, blank, null and non-string stop reasons all
 * collapse to the sentinel, and only the literal 'stop' is complete.
 */
import {
  stopReasonOf,
  isCompleteStop,
  isRetryableStop,
  COMPLETE_STOP_REASON,
  NO_STOP_REASON,
} from '../stopReason';

const openai = (finish_reason: unknown) => ({ choices: [{ finish_reason } as any] });

describe('stopReasonOf (OpenAI chat completions)', () => {
  it('reads finish_reason from the first choice (happy path)', () => {
    expect(stopReasonOf(openai('stop'))).toBe('stop');
    expect(stopReasonOf(openai('length'))).toBe('length');
    expect(stopReasonOf(openai('content_filter'))).toBe('content_filter');
  });

  it('BOUNDARY: absent, null, blank and non-string all collapse to the sentinel', () => {
    expect(stopReasonOf({ choices: [{}] })).toBe(NO_STOP_REASON);
    expect(stopReasonOf(openai(null))).toBe(NO_STOP_REASON);
    expect(stopReasonOf(openai(''))).toBe(NO_STOP_REASON);
    expect(stopReasonOf(openai(42))).toBe(NO_STOP_REASON);
    expect(stopReasonOf({ choices: [] })).toBe(NO_STOP_REASON);
    expect(stopReasonOf({})).toBe(NO_STOP_REASON);
    expect(stopReasonOf(null)).toBe(NO_STOP_REASON);
    expect(stopReasonOf(undefined)).toBe(NO_STOP_REASON);
  });
});

describe('stopReasonOf (Anthropic messages)', () => {
  it('maps the Anthropic vocabulary onto the OpenAI one', () => {
    expect(stopReasonOf({ stop_reason: 'end_turn' })).toBe(COMPLETE_STOP_REASON);
    expect(stopReasonOf({ stop_reason: 'stop_sequence' })).toBe(COMPLETE_STOP_REASON);
    expect(stopReasonOf({ stop_reason: 'max_tokens' })).toBe('length');
    expect(stopReasonOf({ stop_reason: 'refusal' })).toBe('content_filter');
  });

  it('passes an unmapped stop reason through, so it fails closed', () => {
    expect(stopReasonOf({ stop_reason: 'pause_turn' })).toBe('pause_turn');
    expect(isCompleteStop({ stop_reason: 'pause_turn' })).toBe(false);
  });

  it('prefers the OpenAI field when a response somehow carries both', () => {
    expect(stopReasonOf({ choices: [{ finish_reason: 'length' }], stop_reason: 'end_turn' })).toBe('length');
  });
});

describe('isCompleteStop', () => {
  it('is an allowlist of exactly one value', () => {
    expect(isCompleteStop(openai('stop'))).toBe(true);
    expect(isCompleteStop(openai('length'))).toBe(false);
    expect(isCompleteStop(openai('content_filter'))).toBe(false);
    expect(isCompleteStop(openai('tool_calls'))).toBe(false);
    expect(isCompleteStop({})).toBe(false);
  });
});

describe('isRetryableStop', () => {
  it('retries a ceiling stop and a missing stop reason', () => {
    expect(isRetryableStop('length')).toBe(true);
    expect(isRetryableStop(NO_STOP_REASON)).toBe(true);
  });

  it('does NOT retry a filtered completion — more headroom cannot un-filter it', () => {
    expect(isRetryableStop('content_filter')).toBe(false);
  });
});
