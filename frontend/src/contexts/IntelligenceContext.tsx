import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';

export type ScopeLevel = 'global' | 'group' | 'entity' | 'metric';

export interface IntelligenceScope {
  level: ScopeLevel;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  metric?: string;
}

export interface SelectedEntity {
  type: string;
  id: string;
  name: string;
}

interface IntelligenceContextType {
  scope: IntelligenceScope;
  selectedEntity: SelectedEntity | null;
  setScope: (scope: IntelligenceScope) => void;
  drillDown: (entity_type: string, entity_id: string, entity_name?: string) => void;
  drillUp: () => void;
  resetScope: () => void;
  scopeHistory: IntelligenceScope[];
  activeLayer: number | null;
  setActiveLayer: (layer: number | null) => void;
}

const defaultScope: IntelligenceScope = { level: 'global' };

const IntelligenceContext = createContext<IntelligenceContextType>({
  scope: defaultScope,
  selectedEntity: null,
  setScope: () => {},
  drillDown: () => {},
  drillUp: () => {},
  resetScope: () => {},
  scopeHistory: [],
  activeLayer: null,
  setActiveLayer: () => {},
});

export function IntelligenceProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<IntelligenceScope>(defaultScope);
  const [scopeHistory, setScopeHistory] = useState<IntelligenceScope[]>([defaultScope]);
  const [activeLayer, setActiveLayer] = useState<number | null>(null);

  const setScope = useCallback((newScope: IntelligenceScope) => {
    setScopeState(newScope);
    setScopeHistory((prev) => [...prev, newScope]);
  }, []);

  const drillDown = useCallback((entity_type: string, entity_id: string, entity_name?: string) => {
    const newScope: IntelligenceScope = {
      level: 'entity',
      entity_type,
      entity_id,
      entity_name,
    };
    setScope(newScope);
  }, [setScope]);

  const drillUp = useCallback(() => {
    setScopeHistory((prev) => {
      if (prev.length <= 1) return prev;
      const newHistory = prev.slice(0, -1);
      setScopeState(newHistory[newHistory.length - 1]);
      return newHistory;
    });
  }, []);

  const resetScope = useCallback(() => {
    setScopeState(defaultScope);
    setScopeHistory([defaultScope]);
  }, []);

  const selectedEntity = useMemo<SelectedEntity | null>(() => {
    if (scope.level === 'global' || !scope.entity_type) return null;
    return {
      type: scope.entity_type,
      id: scope.entity_id || scope.entity_type,
      name: scope.entity_name || scope.entity_type,
    };
  }, [scope]);

  return (
    <IntelligenceContext.Provider value={{ scope, selectedEntity, setScope, drillDown, drillUp, resetScope, scopeHistory, activeLayer, setActiveLayer }}>
      {children}
    </IntelligenceContext.Provider>
  );
}

export function useIntelligenceContext() {
  return useContext(IntelligenceContext);
}

export default IntelligenceContext;
