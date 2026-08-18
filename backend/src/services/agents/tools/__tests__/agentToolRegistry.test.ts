/**
 * The grant table is the whole point of the tool layer: three chat surfaces
 * call the same coach, so "who can see attachments" has to be one decision.
 * These tests pin the initial grants (Cory and Reese) and the kill switch that
 * lets an incident be stopped without a code deploy.
 */
import { agentHasTool, listAgentTools, agentsWithTool } from '../agentToolRegistry';

const ORIGINAL = process.env.AGENT_TOOLS_DISABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AGENT_TOOLS_DISABLED;
  else process.env.AGENT_TOOLS_DISABLED = ORIGINAL;
});

describe('agentToolRegistry — grants', () => {
  it('grants read_attachments to Cory', () => {
    expect(agentHasTool('cory', 'read_attachments')).toBe(true);
  });

  it('grants read_attachments to Reese', () => {
    expect(agentHasTool('reese', 'read_attachments')).toBe(true);
  });

  it('reports exactly the two agents holding the tool', () => {
    expect(agentsWithTool('read_attachments').sort()).toEqual(['cory', 'reese']);
  });

  it('lists an agent tools', () => {
    expect(listAgentTools('cory')).toEqual(['read_attachments']);
  });
});

describe('agentToolRegistry — kill switch', () => {
  it('revokes the tool from every agent when disabled', () => {
    process.env.AGENT_TOOLS_DISABLED = 'read_attachments';
    expect(agentHasTool('cory', 'read_attachments')).toBe(false);
    expect(agentHasTool('reese', 'read_attachments')).toBe(false);
    expect(agentsWithTool('read_attachments')).toEqual([]);
    expect(listAgentTools('reese')).toEqual([]);
  });

  it('is read fresh on every call, so a flip takes effect without a restart', () => {
    expect(agentHasTool('cory', 'read_attachments')).toBe(true);
    process.env.AGENT_TOOLS_DISABLED = 'read_attachments';
    expect(agentHasTool('cory', 'read_attachments')).toBe(false);
    process.env.AGENT_TOOLS_DISABLED = '';
    expect(agentHasTool('cory', 'read_attachments')).toBe(true);
  });

  it('ignores whitespace and casing in the switch value', () => {
    process.env.AGENT_TOOLS_DISABLED = '  READ_ATTACHMENTS , something_else ';
    expect(agentHasTool('cory', 'read_attachments')).toBe(false);
  });

  it('leaves grants alone when the switch names an unrelated tool', () => {
    process.env.AGENT_TOOLS_DISABLED = 'some_other_tool';
    expect(agentHasTool('cory', 'read_attachments')).toBe(true);
  });
});
