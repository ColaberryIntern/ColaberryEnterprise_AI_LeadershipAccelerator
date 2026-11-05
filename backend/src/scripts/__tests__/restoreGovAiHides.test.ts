import ts from 'typescript';
import path from 'path';
import { buildSelector, parseArgs } from '../restoreGovAiHides';

describe('restoreGovAiHides', () => {
  it('selects only unrestored AI hides by the sweep since the date', () => {
    const { where, replacements } = buildSelector('2026-11-05');
    expect(where).toContain('restored_at IS NULL');
    expect(replacements).toEqual({ reason: 'ai_not_a_fit', actor: 'gov-opp-sweep', since: '2026-11-05' });
  });
  it('refuses a missing or malformed date, so it cannot match everything', () => {
    expect(() => buildSelector(null)).toThrow(/since/);
    expect(() => buildSelector("2026-11-05' OR 1=1")).toThrow(/since/);
  });
  it('is a dry run unless --execute is passed', () => {
    expect(parseArgs(['--since=2026-11-05'])).toEqual({ since: '2026-11-05', execute: false });
    expect(parseArgs(['--since=2026-11-05', '--execute']).execute).toBe(true);
  });
  it('is compiled into dist, because the production image ships nothing else', () => {
    const root = path.resolve(__dirname, '../../..');
    const config = ts.getParsedCommandLineOfConfigFile(path.join(root, 'tsconfig.json'), {}, {
      ...ts.sys, onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(String(d.messageText)); },
    });
    expect(config?.fileNames.some((f) => f.endsWith('src/scripts/restoreGovAiHides.ts'))).toBe(true);
  });
});
