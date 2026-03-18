import { useState, useCallback } from 'react';
import api from '../../../../utils/api';

// ─── Types (mirroring backend) ──────────────────────────────────────

export interface DiagnosticIssue {
  type: 'missing_variable' | 'timeline_violation' | 'orphaned_definition' | 'undefined_reference';
  severity: 'critical' | 'warning' | 'info';
  variable_key: string;
  message: string;
  affected_sections: string[];
}

export interface DiagnosticsResult {
  system_health_score: number;
  summary: {
    total_variables: number;
    missing_count: number;
    timeline_violations: number;
    orphaned_count: number;
    undefined_count: number;
  };
  issues: DiagnosticIssue[];
  scanned_at: string;
}

export interface VariableTraceEntry {
  key: string;
  value: string | null;
  source: 'system' | 'prior_section' | 'current_section' | 'runtime' | 'unresolved';
  source_detail: string;
  status: 'resolved' | 'missing' | 'timeline_violation';
}

export interface VariableTraceResult {
  lesson_id: string;
  enrollment_id?: string;
  trace: VariableTraceEntry[];
  resolved_count: number;
  missing_count: number;
}

export interface RepairAction {
  action_type: string;
  variable_key?: string;
  target_id?: string;
  target_label: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  downstream_sections: string[];
  blocked: boolean;
  block_reason?: string;
}

export interface RepairPlan {
  generated_at: string;
  overall_risk_level: 'low' | 'medium' | 'high';
  impact_summary: {
    total_actions: number;
    safe_actions: number;
    blocked_actions: number;
    affected_sections: number;
    affected_variables: number;
  };
  actions: RepairAction[];
}

// ─── Hook ───────────────────────────────────────────────────────────

export interface UseControlTowerResult {
  diagnostics: DiagnosticsResult | null;
  variableTrace: VariableTraceResult | null;
  repairPlan: RepairPlan | null;
  loading: { diagnostics: boolean; trace: boolean; repair: boolean };
  runDiagnostics: () => void;
  fetchVariableTrace: () => void;
  fetchRepairPlan: (preview?: boolean) => void;
  executeRepairPlan: () => Promise<void>;
}

export function useControlTower(lessonId?: string): UseControlTowerResult {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [variableTrace, setVariableTrace] = useState<VariableTraceResult | null>(null);
  const [repairPlan, setRepairPlan] = useState<RepairPlan | null>(null);
  const [loading, setLoading] = useState({ diagnostics: false, trace: false, repair: false });

  const runDiagnostics = useCallback(async () => {
    setLoading(prev => ({ ...prev, diagnostics: true }));
    try {
      const res = await api.get('/api/admin/orchestration/control-tower/diagnostics');
      setDiagnostics(res.data);
    } catch {
      // silent
    } finally {
      setLoading(prev => ({ ...prev, diagnostics: false }));
    }
  }, []);

  const fetchVariableTrace = useCallback(async () => {
    if (!lessonId) return;
    setLoading(prev => ({ ...prev, trace: true }));
    try {
      const res = await api.get(`/api/admin/orchestration/control-tower/variable-trace/${lessonId}`);
      setVariableTrace(res.data);
    } catch {
      // silent
    } finally {
      setLoading(prev => ({ ...prev, trace: false }));
    }
  }, [lessonId]);

  const fetchRepairPlan = useCallback(async (preview = true) => {
    setLoading(prev => ({ ...prev, repair: true }));
    try {
      const url = preview
        ? '/api/admin/orchestration/control-tower/repair-plan?preview=true'
        : '/api/admin/orchestration/control-tower/repair-plan';
      const res = await api.get(url);
      setRepairPlan(preview ? res.data.plan : res.data);
    } catch {
      // silent
    } finally {
      setLoading(prev => ({ ...prev, repair: false }));
    }
  }, []);

  const executeRepairPlan = useCallback(async () => {
    setLoading(prev => ({ ...prev, repair: true }));
    try {
      const res = await api.post('/api/admin/orchestration/control-tower/repair-plan/execute');
      setRepairPlan(res.data.updatedPlan);
    } catch {
      // silent
    } finally {
      setLoading(prev => ({ ...prev, repair: false }));
    }
  }, []);

  return {
    diagnostics,
    variableTrace,
    repairPlan,
    loading,
    runDiagnostics,
    fetchVariableTrace,
    fetchRepairPlan,
    executeRepairPlan,
  };
}
