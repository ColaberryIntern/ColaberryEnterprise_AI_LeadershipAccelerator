import { agentHeaderState } from './agentState';

describe('agentHeaderState', () => {
  it('shows the running phase from the last message', () => {
    expect(agentHeaderState({ runStatus: 'running', lastMessage: 'Building the outline' })).toBe('Building');
    expect(agentHeaderState({ runStatus: 'running', lastMessage: 'Drafting section 2/5: Approach' })).toBe('Building');
    expect(agentHeaderState({ runStatus: 'running', lastMessage: 'Iteration 1: passed the checks' })).toBe('Judging');
    expect(agentHeaderState({ runStatus: 'running', lastMessage: 'Iteration 2: revising failing sections' })).toBe('Revising');
    expect(agentHeaderState({ runStatus: 'running', lastMessage: 'Reading the solicitation ZIP' })).toBe('Reading ZIP');
    expect(agentHeaderState({ runStatus: 'running', lastMessage: null })).toBe('Building'); // running, unknown phase
  });

  it('waits on you when blocked or there are open needs', () => {
    expect(agentHeaderState({ runStatus: 'blocked' })).toBe('Waiting on you');
    expect(agentHeaderState({ runStatus: null, needsCount: 3 })).toBe('Waiting on you');
  });

  it('is idle when nothing is running and nothing needs you', () => {
    expect(agentHeaderState({ runStatus: 'passed', needsCount: 0 })).toBe('Idle');
    expect(agentHeaderState({})).toBe('Idle');
  });

  it('a running cycle takes precedence over open needs', () => {
    expect(agentHeaderState({ runStatus: 'running', lastMessage: 'revising', needsCount: 5 })).toBe('Revising');
  });
});
