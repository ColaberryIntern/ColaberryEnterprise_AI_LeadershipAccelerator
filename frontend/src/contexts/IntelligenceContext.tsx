import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type ScopeLevel = 'global' | 'group' | 'entity' | 'metric';

export interface IntelligenceScope {
  level: ScopeLevel;
  entity_type?: string;
  entity_id?: string;
  entity_name?: string;
  metric?: string;
}

interface IntelligenceContextType {
  scope: IntelligenceScope;
  setScope: (scope: IntelligenceScope) => void;
  drillDown: (entity_type: string, entity_id: string, entity_name?: string) => void;
  drillUp: () => void;
  resetScope: () => void;
  scopeHistory: IntelligenceScope[];
}

const defaultScope: IntelligenceScope = { level: 'global' };

const IntelligenceContext = createContext<IntelligenceContextType>({
  scope: defaultScope,
  setScope: () => {},
  drillDown: () => {},
  drillUp: () => {},
  resetScope: () => {},
  scopeHistory: [],
});

export function IntelligenceProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<IntelligenceScope>(defaultScope);
  const [scopeHistory, setScopeHistory] = useState<IntelligenceScope[]>([defaultScope]);

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

  return (
    <IntelligenceContext.Provider value={{ scope, setScope, drillDown, drillUp, resetScope, scopeHistory }}>
      {children}
    </IntelligenceContext.Provider>
  );
}

export function useIntelligenceContext() {
  return useContext(IntelligenceContext);
}

export default IntelligenceContext;
