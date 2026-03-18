/**
 * Variable Trace Service — Control Tower
 *
 * For a given section, produces a per-variable trace showing:
 * where each variable comes from, its current value, and its resolution status.
 * Optionally enriched with runtime values from VariableStore.
 */

import { getSectionVariableFlow, SYSTEM_VARIABLE_KEYS } from './variableFlowService';
import * as variableService from './variableService';

// ─── Debug Logging ──────────────────────────────────────────────────

const DEBUG = process.env.DEBUG_CONTROL_TOWER === 'true';
function debugLog(msg: string, data?: any) {
  if (DEBUG) console.log(`[ControlTower:Trace] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
}

// ─── Types ──────────────────────────────────────────────────────────

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

// ─── Public API ─────────────────────────────────────────────────────

export async function getVariableTrace(
  lessonId: string,
  enrollmentId?: string,
): Promise<VariableTraceResult> {
  const flow = await getSectionVariableFlow(lessonId);
  const systemKeySet = new Set(SYSTEM_VARIABLE_KEYS);

  // Build lookup maps from flow data
  const availableMap = new Map(flow.available.map(a => [a.key, a]));
  const producedSet = new Set(flow.produced.map(p => p.key));
  const missingSet = new Set(flow.missing.map(m => m.key));

  // Get runtime values if enrollmentId provided
  let runtimeVars: Record<string, string> = {};
  if (enrollmentId) {
    try {
      runtimeVars = await variableService.getAllVariables(enrollmentId);
    } catch {
      // Non-critical
    }
  }

  const trace: VariableTraceEntry[] = [];

  for (const req of flow.required) {
    const runtimeValue = runtimeVars[req.key] || null;
    let entry: VariableTraceEntry;

    if (availableMap.has(req.key)) {
      const avail = availableMap.get(req.key)!;
      const isSystem = systemKeySet.has(req.key) && avail.source === 'System';
      entry = {
        key: req.key,
        value: runtimeValue,
        source: isSystem ? 'system' : 'prior_section',
        source_detail: avail.source,
        status: 'resolved',
      };
    } else if (producedSet.has(req.key)) {
      const producer = flow.produced.find(p => p.key === req.key);
      entry = {
        key: req.key,
        value: runtimeValue,
        source: 'current_section',
        source_detail: producer?.producedBy || 'this section',
        status: 'resolved',
      };
    } else if (missingSet.has(req.key)) {
      // Check if runtime value fills the gap
      if (runtimeValue) {
        entry = {
          key: req.key,
          value: runtimeValue,
          source: 'runtime',
          source_detail: 'VariableStore',
          status: 'resolved',
        };
      } else {
        entry = {
          key: req.key,
          value: null,
          source: 'unresolved',
          source_detail: 'not set',
          status: 'missing',
        };
      }
    } else {
      // Fallback — shouldn't happen but handle gracefully
      entry = {
        key: req.key,
        value: runtimeValue,
        source: runtimeValue ? 'runtime' : 'unresolved',
        source_detail: runtimeValue ? 'VariableStore' : 'unknown',
        status: runtimeValue ? 'resolved' : 'missing',
      };
    }

    trace.push(entry);
  }

  const resolvedCount = trace.filter(t => t.status === 'resolved').length;
  const missingCount = trace.filter(t => t.status === 'missing').length;

  debugLog(`getVariableTrace(${lessonId})`, { total: trace.length, resolved: resolvedCount, missing: missingCount });

  return {
    lesson_id: lessonId,
    enrollment_id: enrollmentId,
    trace,
    resolved_count: resolvedCount,
    missing_count: missingCount,
  };
}
