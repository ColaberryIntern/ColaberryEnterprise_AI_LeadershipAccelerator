import { useState, useEffect, useCallback } from 'react';
import api from '../../../../utils/api';

export interface VariableFlowEntry {
  variable_key: string;
  display_name: string;
  source_type: string;
  scope: string;
  first_set_in: { lesson_id: string; lesson_title: string } | null;
  produced_in: { lesson_id: string; lesson_title: string; mini_section_title: string }[];
  consumed_in: { lesson_id: string; lesson_title: string; mini_section_title: string }[];
}

export interface SectionVariableFlow {
  lesson_id: string;
  available: { key: string; source: string; scope: string }[];
  required: { key: string; usedIn: string[] }[];
  produced: { key: string; producedBy: string }[];
  missing: { key: string; usedIn: string[] }[];
}

export interface VariableReconciliation {
  undefined_refs: { key: string; used_in_sections: string[] }[];
  orphaned_defs: { key: string; display_name: string }[];
}

interface UseVariableFlowResult {
  sectionFlow: SectionVariableFlow | null;
  programFlow: VariableFlowEntry[];
  reconciliation: VariableReconciliation | null;
  loading: boolean;
  refresh: () => void;
  refreshReconciliation: () => void;
}

export function useVariableFlow(lessonId?: string): UseVariableFlowResult {
  const [sectionFlow, setSectionFlow] = useState<SectionVariableFlow | null>(null);
  const [programFlow, setProgramFlow] = useState<VariableFlowEntry[]>([]);
  const [reconciliation, setReconciliation] = useState<VariableReconciliation | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        api.get('/api/admin/orchestration/program/variable-flow'),
      ];
      if (lessonId) {
        promises.push(api.get(`/api/admin/orchestration/sections/${lessonId}/variable-flow`));
      }
      const results = await Promise.all(promises);
      setProgramFlow(results[0].data.variableFlow || []);
      if (results[1]) {
        setSectionFlow(results[1].data);
      }
    } catch {
      // silent — variable flow data is supplementary
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  const refreshReconciliation = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/orchestration/program/variable-reconciliation');
      setReconciliation(res.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { sectionFlow, programFlow, reconciliation, loading, refresh: fetchAll, refreshReconciliation };
}
