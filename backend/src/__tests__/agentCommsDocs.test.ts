/**
 * Agent comms (T12): the runbook and the directive carry what an operator needs, so a later edit
 * cannot silently drop the Workspace routing steps, the env order, or the rollback.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('docs/agent-comms-runbook.md', () => {
  const doc = read('docs/agent-comms-runbook.md');

  it('has the Google Workspace routing steps for maya@colaberry.com -> maya@reply.colaberry.ai', () => {
    expect(doc).toMatch(/^## Google Workspace/m);
    expect(doc).toContain('maya@colaberry.com');
    expect(doc).toContain('maya@reply.colaberry.ai');
    expect(doc).toMatch(/Recipient address map/);
  });

  it('has the Mandrill DKIM/SPF check, the env order, and a full rollback including the schema SQL', () => {
    expect(doc).toMatch(/^## Mandrill/m);
    expect(doc).toMatch(/DKIM/);
    expect(doc).toMatch(/SPF/);
    expect(doc).toMatch(/^## Environment, in this order/m);
    const order = ['VOICE_CALL_PATHS=', 'ENABLE_VOICE_CALLS=true'].map((k) => doc.indexOf(k));
    expect(order.every((i) => i > 0)).toBe(true);
    expect(order[0]).toBeLessThan(order[1]); // the allowlist before the master switch
    expect(doc).toMatch(/^## Rollback/m);
    for (const idx of ['ai_agents_email_slug_uq', 'communication_logs_agent_name_idx', 'communication_logs_voice_idem_uq']) {
      expect(doc).toContain(`DROP INDEX IF EXISTS ${idx}`);
    }
  });

  it('is written to house style: no em or en dashes', () => {
    expect(doc).not.toMatch(/[–—]/);
  });
});

describe('directives/run-agent-comms.md', () => {
  const doc = read('directives/run-agent-comms.md');

  it('has the 7 sections directives/CLAUDE.md requires, in order', () => {
    const headings = ['Purpose', 'Inputs', 'Steps', 'Outputs', 'Verification', 'Edge cases / failure modes', 'Safety constraints'];
    const at = headings.map((h) => doc.indexOf(`\n## ${h}`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('points to the runbook and names a testable verification', () => {
    expect(doc).toContain('docs/agent-comms-runbook.md');
    expect(doc).toContain('[DB] agent comms schema ensured');
    expect(doc).not.toMatch(/[–—]/);
  });
});
