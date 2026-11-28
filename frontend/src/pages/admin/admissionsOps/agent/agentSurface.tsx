import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SCREENS, type ScreenId } from '../screens';
import ACTIONS from './screenActions.json';

/**
 * The agent control surface's screen registry (AO2.2, kit AGENT_CONTROL_SURFACE.md sections 3 and 7).
 * Published, not scraped: each screen declares what it is and what can be done on it, and the agent reads that
 * declaration, never the DOM. The manifest is data; handlers stay in the screen and on the server, where each
 * action's params are validated with Zod (backend services/admissionsOps/agentManifest.ts). screenActions.json is
 * the one list of actions; a backend test proves the server's copy agrees with it.
 */
export type ActionLevel = 1 | 2 | 3 | 4 | 5;
export type ActionKind = 'navigate' | 'view' | 'prepare' | 'execute';
export interface ParamSpec { name: string; type: 'string' | 'date'; required: boolean }
export interface AgentAction { id: string; label: string; level: ActionLevel; kind: ActionKind; available: boolean; params: ParamSpec[]; confirm?: string }
export interface Suggestion { label: string; action: string }
export interface ScreenContext {
  subject?: { type: 'student' | 'cohort' | 'ticket' | 'report'; ref: string };
  filters?: Record<string, string>;
  selection?: string[];
  sources: Array<{ name: string; syncedAt: string | null; status: 'ok' | 'stale' | 'down' | 'not_connected' }>;
}
export interface ScreenManifest {
  id: ScreenId;
  route: string;
  title: string;
  description: string;
  context: () => ScreenContext;
  actions: AgentAction[];
  suggestions: Suggestion[];
}

type Declared = { description: string; actions: AgentAction[]; suggestions: Suggestion[] };
const DECLARED = ACTIONS as unknown as Record<ScreenId, Declared>;
const EMPTY_CONTEXT = (): ScreenContext => ({ sources: [] });

/** The static manifest for a screen. Context defaults to "no sources yet"; a screen passes its own when it has data. */
export function manifestFor(id: ScreenId, context: () => ScreenContext = EMPTY_CONTEXT): ScreenManifest {
  const screen = SCREENS.find((s) => s.id === id);
  const declared = DECLARED[id];
  if (!screen || !declared) throw new Error(`no manifest for screen ${id}`);
  return { id, route: `/admin/admissions-ops${screen.path ? `/${screen.path}` : ''}`, title: screen.title, description: declared.description, context, actions: declared.actions, suggestions: declared.suggestions };
}

/** Find a declared action anywhere in the workspace (suggestions point at other screens' navigate actions). */
export function actionById(actionId: string): { screen: ScreenId; action: AgentAction } | null {
  for (const [screen, d] of Object.entries(DECLARED) as Array<[ScreenId, Declared]>) {
    const action = d.actions.find((a) => a.id === actionId);
    if (action) return { screen, action };
  }
  return null;
}

interface Registry { manifests: ScreenManifest[]; register: (m: ScreenManifest) => () => void }
const RegistryContext = createContext<Registry | null>(null);

/** Holds the manifests of the screens currently mounted. Lives in the workspace layout. */
export function AgentSurfaceProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const live = useRef(new Map<string, ScreenManifest>());
  const [version, setVersion] = useState(0);
  const register = useCallback((m: ScreenManifest) => {
    live.current.set(m.id, m);
    setVersion((v) => v + 1);
    return () => { if (live.current.get(m.id) === m) live.current.delete(m.id); setVersion((v) => v + 1); };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const value = useMemo<Registry>(() => ({ manifests: [...live.current.values()], register }), [version, register]);
  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

/** Register this screen's manifest while it is mounted. A no-op outside the workspace (no provider). */
export function useAgentSurface(id: ScreenId, context?: () => ScreenContext): void {
  const registry = useContext(RegistryContext);
  const contextRef = useRef(context);
  contextRef.current = context;
  const register = registry?.register;
  useEffect(() => {
    if (!register) return undefined;
    return register(manifestFor(id, () => (contextRef.current ?? EMPTY_CONTEXT)()));
  }, [register, id]);
}

/** The manifests on screen right now (the dock reads the current one). */
export function useAgentRegistry(): ScreenManifest[] {
  return useContext(RegistryContext)?.manifests ?? [];
}
