import React, { useState } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { AgentSurfaceProvider, actionById, manifestFor, useAgentRegistry, useAgentSurface } from '../agentSurface';
import { SCREENS, type ScreenId } from '../../screens';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function Screen({ id }: { id: ScreenId }): null { useAgentSurface(id, () => ({ sources: [], filters: { from: id } })); return null; }
let seen: string[] = [];
let ctxOf: Record<string, unknown> = {};
function Probe(): null {
  const live = useAgentRegistry();
  seen = live.map((m) => m.id);
  ctxOf = Object.fromEntries(live.map((m) => [m.id, m.context()]));
  return null;
}
let setShown: (ids: ScreenId[]) => void = () => undefined;
function Harness(): React.ReactElement {
  const [shown, set] = useState<ScreenId[]>(['today']);
  setShown = set;
  return <AgentSurfaceProvider>{shown.map((id) => <Screen key={id} id={id} />)}<Probe /></AgentSurfaceProvider>;
}

describe('AO2.2 the screen registry', () => {
  it('registers on mount, unregisters on unmount: it holds only the screens on screen', async () => {
    await act(async () => { root.render(<Harness />); });
    expect(seen).toEqual(['today']);
    await act(async () => { setShown(['payments', 'tfcAudit']); });
    expect(seen.sort()).toEqual(['payments', 'tfcAudit']);
    await act(async () => { setShown([]); });
    expect(seen).toEqual([]);
  });

  it('serves each screen\'s live context, references only', async () => {
    await act(async () => { root.render(<Harness />); });
    expect(ctxOf.today).toEqual({ sources: [], filters: { from: 'today' } });
  });

  it('outside the workspace the hook is a no-op', async () => {
    await act(async () => { root.render(<Screen id="today" />); });
    expect(host.innerHTML).toBe('');
  });
});

describe('AO2.2 static manifests', () => {
  it('every one of the 16 screens has a manifest with a route, a description, actions and three suggestions', () => {
    for (const s of SCREENS) {
      const m = manifestFor(s.id);
      expect(m.route.startsWith('/admin/admissions-ops')).toBe(true);
      expect(m.description.length).toBeGreaterThan(10);
      expect(m.actions.length).toBeGreaterThan(0);
      expect(m.suggestions).toHaveLength(3);
      for (const sug of m.suggestions) expect(actionById(sug.action)?.action.kind).toBe('navigate');
    }
  });
});
