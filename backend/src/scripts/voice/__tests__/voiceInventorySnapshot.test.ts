/**
 * The committed voice inventory must match the tree (VS1.6). Running `voice:inventory --check` by hand
 * proved unreliable: the snapshot went stale for three tasks because nothing forced the check. As a jest
 * test it runs in CI's backend unit job on every push, so a new voice caller cannot land unnoticed.
 *
 * Fix a failure with: npm run voice:inventory (from backend/), review the diff, update INVENTORY.md.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { buildInventory } from '../voiceInventory';

describe('committed voice inventory snapshot', () => {
  it('matches what voice:inventory generates from the tracked tree', () => {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const committed = fs.readFileSync(path.join(root, 'docs', 'voice-studio', 'inventory.generated.json'), 'utf8').replace(/\r\n/g, '\n');
    const generated = JSON.stringify(buildInventory(root), null, 1) + '\n';
    expect(JSON.parse(generated).byRole).toEqual(JSON.parse(committed).byRole);
    expect(generated).toBe(committed);
  });

  it('dispatchers in the inventory are exactly the files the architecture test allows', () => {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
    const inv = buildInventory(root);
    expect(inv.rows.filter((r) => r.role === 'DISPATCH').map((r) => r.path)).toEqual([
      'backend/src/services/synthflowService.ts',
      'backend/src/services/voice/providers/synthflowLegacyProvider.ts',
      'backend/src/services/voice/providers/twilioCarrier.ts',
    ]);
  });
});
