import fs from 'fs';
import path from 'path';
import { renderReeseToolInventoryMarkdown } from '../lib/renderReeseToolInventory';
import { REESE_TOOL_INVENTORY } from '../lib/reeseToolInventory';

// R3 verification (plan.md): "Generator output equals the committed file (test)."
describe('TOOL_INVENTORY.md generator', () => {
  const committedPath = path.resolve(
    __dirname,
    '../../../../docs/reese-agentic-employee/TOOL_INVENTORY.md',
  );

  it('the committed file is byte-identical to a fresh render', () => {
    const committed = fs.readFileSync(committedPath, 'utf8');
    expect(committed).toBe(renderReeseToolInventoryMarkdown());
  });

  it('covers the 4 real tools_granted plus the undeclared read_attachments grant', () => {
    const names = REESE_TOOL_INVENTORY.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'respond_to_dm',
        'read_learner_context',
        'read_student_success_snapshot',
        'assess_student_health',
        'read_attachments',
      ]),
    );
  });

  it('every row states a real authorization state -- none, shadow, or enforced', () => {
    for (const r of REESE_TOOL_INVENTORY) {
      expect(['none', 'shadow', 'enforced']).toContain(r.authorization);
    }
  });

  it('no row claims enforced authorization -- Phase 1 adds no new authority and nothing is enforced today', () => {
    expect(REESE_TOOL_INVENTORY.some((r) => r.authorization === 'enforced')).toBe(false);
  });

  it('only the autonomous outreach send is shadow-authorized; every other send path is none', () => {
    const shadowRows = REESE_TOOL_INVENTORY.filter((r) => r.authorization === 'shadow').map((r) => r.name);
    expect(shadowRows).toEqual(['Autonomous outreach DM send']);
  });

  it('names read_attachments as a real, undeclared gap', () => {
    const row = REESE_TOOL_INVENTORY.find((r) => r.name === 'read_attachments');
    expect(row?.gap).toMatch(/tools_granted/);
  });
});
