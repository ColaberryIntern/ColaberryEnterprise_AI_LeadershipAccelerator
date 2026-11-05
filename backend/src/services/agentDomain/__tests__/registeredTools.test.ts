/**
 * AF3.5 — the registered tool list, and the restatements that must not drift.
 *
 * "Registered" means a handler exists in source. The list is assembled from four unrelated
 * places because this codebase has no single registry, and one name (`send_email`) is restated
 * rather than imported. Everything restated is pinned here against the file that defines it.
 */

import fs from 'fs';
import path from 'path';
import { HANDLER_BACKED_TOOLS, registeredToolNames } from '../registeredTools';

const BACKEND_SRC = path.join(__dirname, '..', '..', '..');

describe('registeredToolNames', () => {
  it('returns a non-trivial list — an empty one would silently refuse every grant', () => {
    // The positive control. Every "refuses an unregistered tool" assertion elsewhere would pass
    // just as happily if this returned [], and the gate would then refuse everything forever.
    const names = registeredToolNames();
    expect(names.length).toBeGreaterThan(40);
  });

  it('includes the documented dictionary, both handler arrays, and the GRANTS table', () => {
    const names = registeredToolNames();
    expect(names).toContain('read_student_success_snapshot'); // REESE_TOOLS
    expect(names).toContain('escalate_to_human'); // DARA_TOOLS
    expect(names).toContain('read_attachments'); // GRANTS
    expect(names).toContain('respond_to_dm'); // TOOL_CAPABILITIES
  });

  it('includes send_email, which appears in NONE of the dictionaries', () => {
    // The name that proves why HANDLER_BACKED_TOOLS exists. A list built from
    // TOOL_CAPABILITIES alone would refuse to grant the most consequential tool in the fleet.
    expect(registeredToolNames()).toContain('send_email');
  });

  it('is sorted and free of duplicates, so two sources naming one tool give one entry', () => {
    const names = registeredToolNames();
    expect(names).toEqual([...new Set(names)]);
    expect(names).toEqual([...names].sort());
  });

  it('contains no blank entries', () => {
    expect(registeredToolNames().filter((n) => !n.trim())).toEqual([]);
  });
});

describe('the restatement cannot drift from the source that defines it', () => {
  it('send_email is still what AGENT_EMAIL_TOOL is set to', () => {
    // Read as TEXT rather than imported: agentEmailTool pulls in the model index and the
    // communication safety service, and a name list must not drag the send path into the boot
    // graph of everything that asks "is this a real tool".
    const src = fs.readFileSync(
      path.join(BACKEND_SRC, 'services', 'agents', 'tools', 'agentEmailTool.ts'), 'utf8',
    );
    const match = /AGENT_EMAIL_TOOL\s*=\s*'([^']+)'/.exec(src);
    expect(match).not.toBeNull();
    expect(HANDLER_BACKED_TOOLS).toContain(match![1]);
  });

  it('every handler-backed name is one agentEmailTool or a tool module actually defines', () => {
    // If a later ticket adds a name here, this fails until that name is traceable to source.
    // A registered-tool list that can be extended by typing into it is not a registry.
    const toolsDir = path.join(BACKEND_SRC, 'services', 'agents', 'tools');
    const sources = fs.readdirSync(toolsDir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => fs.readFileSync(path.join(toolsDir, f), 'utf8'))
      .join('\n');
    for (const name of HANDLER_BACKED_TOOLS) {
      expect({ name, definedInSource: sources.includes(`'${name}'`) })
        .toEqual({ name, definedInSource: true });
    }
  });
});
