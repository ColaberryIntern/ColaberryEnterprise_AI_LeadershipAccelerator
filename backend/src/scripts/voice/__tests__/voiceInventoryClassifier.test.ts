import { classifyVoiceFile, isInventoryCandidate, sortInventory, summarize, VOICE_SEARCH } from '../voiceInventoryClassifier';

describe('voiceInventoryClassifier', () => {
  it('excludes its own tooling so committing it cannot make the snapshot stale (regression: VS1.1 attempt 1)', () => {
    expect(isInventoryCandidate('backend/src/scripts/voice/voiceInventoryClassifier.ts')).toBe(false);
    expect(isInventoryCandidate('backend\\src\\scripts\\voice\\docsCheck.ts')).toBe(false);
    expect(isInventoryCandidate('backend/src/services/synthflowService.ts')).toBe(true);
  });

  it('search set also covers the directive\'s call_id, CommunicationLog and VOICE_* variants', () => {
    for (const s of ['row.call_id', 'CommunicationLog.findAll', 'VOICE_TEST_ENABLED']) expect(VOICE_SEARCH.test(s)).toBe(true);
  });

  it('marks the triggerVoiceCall definition as DISPATCH (happy path)', () => {
    const r = classifyVoiceFile('backend/src/services/synthflowService.ts',
      "export async function triggerVoiceCall(p) { return fetch('https://api.synthflow.ai/v2/calls'); }");
    expect(r.role).toBe('DISPATCH');
  });

  it('does NOT mark a GET to the Synthflow API (health read) as DISPATCH (regression: systemHealthService)', () => {
    const r = classifyVoiceFile('backend/src/services/systemHealthService.ts',
      "const resp = await fetch('https://api.synthflow.ai/v2/calls', { method: 'GET' }); // call_id success rate");
    expect(r.role).not.toBe('DISPATCH');
  });

  it('marks a direct POST to the Synthflow API as DISPATCH even without triggerVoiceCall', () => {
    const r = classifyVoiceFile('backend/src/services/rogue.ts', "fetch('https://api.synthflow.ai/v2/calls', { method: 'POST', body })");
    expect(r.role).toBe('DISPATCH');
  });

  it('marks a service that invokes triggerVoiceCall as CALLER and extracts its callType literals', () => {
    const r = classifyVoiceFile('backend/src/services/callbackRequestService.ts',
      "await triggerVoiceCall({ callType: 'callback', name }); await triggerVoiceCall({ callType: 'welcome' });");
    expect(r.role).toBe('CALLER');
    expect(r.callTypes).toEqual(['callback', 'welcome']);
  });

  it('classifies guards by path before anything that merely calls the dispatcher', () => {
    const r = classifyVoiceFile('backend/src/services/voice/voiceDialGuard.ts', 'triggerVoiceCall( // mentioned in a comment');
    expect(r.role).toBe('GUARD');
  });

  it('classifies the synthflow webhook controller as INGEST', () => {
    expect(classifyVoiceFile('backend/src/controllers/synthflowWebhookController.ts', 'synthflow call_id').role).toBe('INGEST');
  });

  it('classifies frontend files as UI and env/config as CONFIG', () => {
    expect(classifyVoiceFile('frontend/src/pages/admin/X.tsx', 'synthflow').role).toBe('UI');
    expect(classifyVoiceFile('backend/src/config/env.ts', 'SYNTHFLOW_API_KEY').role).toBe('CONFIG');
  });

  it('falls back to MENTION for a bare reference (boundary)', () => {
    expect(classifyVoiceFile('backend/src/services/x.ts', '// synthflow was here').role).toBe('MENTION');
  });

  it('records env var names only, never values', () => {
    const r = classifyVoiceFile('backend/src/config/env.ts', "SYNTHFLOW_API_KEY: process.env.SYNTHFLOW_API_KEY || 'sk-secret', ENABLE_VOICE_CALLS");
    expect(r.envVars).toEqual(['ENABLE_VOICE_CALLS', 'SYNTHFLOW_API_KEY']);
    expect(JSON.stringify(r)).not.toContain('sk-secret');
  });

  it('normalizes Windows separators and sorts deterministically (idempotency)', () => {
    const a = classifyVoiceFile('backend\\src\\b.ts', 'synthflow');
    const b = classifyVoiceFile('backend/src/a.ts', 'synthflow');
    const once = sortInventory([a, b]);
    expect(once.map((r) => r.path)).toEqual(['backend/src/a.ts', 'backend/src/b.ts']);
    expect(sortInventory(once)).toEqual(once);
  });

  it('search set matches every variant the directive lists and nothing unrelated', () => {
    for (const s of ['synthflow', 'Syntheflow', 'triggerVoiceCall', 'place_ai_call', 'voiceCall', 'SYNTHFLOW_X', 'ENABLE_VOICE_CALLS', 'VOICE_CALL_PATHS']) {
      expect(VOICE_SEARCH.test(s)).toBe(true);
    }
    expect(VOICE_SEARCH.test('voice note')).toBe(false);
  });

  it('summarize counts every role including zeros', () => {
    const s = summarize([classifyVoiceFile('frontend/src/a.tsx', 'synthflow')]);
    expect(s.UI).toBe(1);
    expect(s.DISPATCH).toBe(0);
  });
});
