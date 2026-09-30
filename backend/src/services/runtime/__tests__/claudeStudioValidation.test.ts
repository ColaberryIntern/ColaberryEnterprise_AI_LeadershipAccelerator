/**
 * Claude Studio submission validation — the pure half.
 *
 * `submitClaudeStudio` itself needs a database, so it lives with the integration
 * suites; everything it decides BEFORE the first write is pure and is tested
 * here, inside the CI gate. These are the rules that make completion mean
 * something: all four stages, every self-check, a safe well-formed link, and the
 * student's own writing rather than a pasted transcript.
 */
import {
  validateSubmittedUrl, assertNoConversationDump, validateSubmission, ClaudeStudioSubmission,
} from '../claudeStudioService';

const good = (over: Partial<ClaudeStudioSubmission> = {}): ClaudeStudioSubmission => ({
  artifact_url: 'https://claude.ai/public/artifacts/abc-123',
  project_proof_url: null,
  stages_completed: ['explore', 'organize', 'create', 'prove'],
  checks_confirmed: [0, 1, 2, 3],
  checks_total: 4,
  reflection: 'I framed the problem as a routing failure rather than a volume problem, which is the opposite of where I started. The evidence that moved me was the ticket ages clustering on one queue rather than spreading evenly.',
  ai_disclosure: null,
  ...over,
});

describe('validateSubmittedUrl', () => {
  it('accepts a normal https link', () => {
    expect(validateSubmittedUrl('https://claude.ai/public/artifacts/x', 'Link')).toContain('https://claude.ai/');
  });

  it('rejects an empty value', () => {
    expect(() => validateSubmittedUrl('  ', 'The Artifact link')).toThrow(/required/i);
  });

  it('rejects a non-URL', () => {
    expect(() => validateSubmittedUrl('claude.ai/artifacts/x', 'Link')).toThrow(/not a valid URL/i);
  });

  it('rejects non-https schemes, including javascript:', () => {
    expect(() => validateSubmittedUrl('http://example.com/a', 'Link')).toThrow(/must be an https/i);
    expect(() => validateSubmittedUrl('javascript:alert(1)', 'Link')).toThrow();
    expect(() => validateSubmittedUrl('data:text/html,<h1>x', 'Link')).toThrow();
    expect(() => validateSubmittedUrl('file:///etc/passwd', 'Link')).toThrow();
  });

  it('rejects credentials embedded in the URL', () => {
    expect(() => validateSubmittedUrl('https://user:pw@example.com/a', 'Link')).toThrow(/credentials/i);
  });

  it('rejects loopback and private addresses a reviewer could not open', () => {
    ['https://localhost/a', 'https://127.0.0.1/a', 'https://10.0.0.5/a', 'https://192.168.1.9/a', 'https://172.16.4.2/a', 'https://box.local/a']
      .forEach((u) => expect(() => validateSubmittedUrl(u, 'Link')).toThrow(/could not open|nobody else could open/i));
  });

  it('rejects an absurdly long value', () => {
    expect(() => validateSubmittedUrl(`https://x.com/${'a'.repeat(3000)}`, 'Link')).toThrow(/too long/i);
  });

  it('does not fetch the URL — validation is format-only', () => {
    // A URL to a host that does not resolve still passes: we never claim the
    // destination was inspected, and a network call here would be a defect.
    expect(() => validateSubmittedUrl('https://this-host-does-not-exist.invalid/a', 'Link')).not.toThrow();
  });
});

describe('assertNoConversationDump', () => {
  it('allows normal reflective writing', () => {
    expect(() => assertNoConversationDump('I disagreed with the first framing because the ticket data pointed elsewhere.')).not.toThrow();
  });

  it('rejects a pasted conversation transcript', () => {
    const transcript = ['Human: what is the problem', 'Assistant: it could be routing', 'Human: why', 'Assistant: because the ages cluster'].join('\n');
    expect(() => assertNoConversationDump(transcript)).toThrow(/transcript/i);
  });

  it('tolerates a couple of quoted turns without rejecting', () => {
    expect(() => assertNoConversationDump('I asked it a question.\nClaude: it said routing.\nI checked that myself.')).not.toThrow();
  });
});

describe('validateSubmission', () => {
  it('accepts a complete submission', () => {
    const out = validateSubmission(good());
    expect(out.stages_completed).toEqual(['explore', 'organize', 'create', 'prove']);
    expect(out.artifact_url).toContain('https://claude.ai/');
  });

  it('requires all four stages, naming the outstanding ones', () => {
    expect(() => validateSubmission(good({ stages_completed: ['explore', 'organize'] })))
      .toThrow(/create, prove/);
  });

  it('requires every reflection check to be confirmed', () => {
    expect(() => validateSubmission(good({ checks_confirmed: [0, 1] })))
      .toThrow(/2 of 4 are ticked/);
  });

  it('requires a substantive reflection', () => {
    expect(() => validateSubmission(good({ reflection: 'Done.' }))).toThrow(/too short/i);
  });

  it('rejects a reflection that is a pasted conversation', () => {
    const transcript = ['Human: a'.padEnd(60, 'a'), 'Assistant: b'.padEnd(60, 'b'), 'Human: c'.padEnd(60, 'c'), 'Assistant: d'.padEnd(60, 'd')].join('\n');
    expect(() => validateSubmission(good({ reflection: transcript }))).toThrow(/transcript/i);
  });

  it('validates the optional Project proof link when present', () => {
    expect(() => validateSubmission(good({ project_proof_url: 'http://insecure.example/a' }))).toThrow(/https/i);
    expect(validateSubmission(good({ project_proof_url: 'https://claude.ai/project/x' })).project_proof_url)
      .toContain('https://claude.ai/project/x');
  });

  it('treats a missing Project proof link as acceptable', () => {
    expect(validateSubmission(good({ project_proof_url: null })).project_proof_url).toBeNull();
  });

  it('accepts duplicate stage entries without counting them twice', () => {
    expect(() => validateSubmission(good({ stages_completed: ['explore', 'explore', 'organize', 'create', 'prove'] }))).not.toThrow();
  });

  it('skips the check gate when the card presented no checks', () => {
    expect(() => validateSubmission(good({ checks_confirmed: [], checks_total: 0 }))).not.toThrow();
  });

  it('caps the AI disclosure rather than rejecting a long one', () => {
    const out = validateSubmission(good({ ai_disclosure: 'x'.repeat(5000) }));
    expect(out.ai_disclosure!.length).toBe(2000);
  });
});
