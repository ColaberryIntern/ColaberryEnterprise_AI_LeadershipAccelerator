import { useState, useEffect, useCallback } from 'react';
import {
  MiniSection, MiniSectionType, Module, Lesson, PromptOption,
  SkillOption, VariableOption, ArtifactOption, DryRunResult, PromptBody, VariableMapData,
} from './types';

interface BuilderProps {
  token: string;
  apiUrl: string;
  initialLessonId?: string | null;
}

export default function useMiniSectionBuilder({ token, apiUrl, initialLessonId }: BuilderProps) {
  // Navigation
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [selectedMiniSectionId, setSelectedMiniSectionId] = useState<string | null>(null);

  // Data
  const [miniSections, setMiniSections] = useState<MiniSection[]>([]);
  const [editing, setEditing] = useState<Partial<MiniSection> | null>(null);
  const [originalEditing, setOriginalEditing] = useState<string>(''); // JSON snapshot for dirty check

  // Reference data
  const [prompts, setPrompts] = useState<PromptOption[]>([]);
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [variables, setVariables] = useState<VariableOption[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactOption[]>([]);
  const [promptBodies, setPromptBodies] = useState<Record<string, PromptBody>>({});
  const [systemVariables, setSystemVariables] = useState<VariableOption[]>([]);

  // Validation
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [variableMap, setVariableMap] = useState<VariableMapData | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [inlineCreator, setInlineCreator] = useState<'variable' | 'skill' | 'artifact' | null>(null);
  const [showSimulation, setShowSimulation] = useState(false);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // --- Reference data ---
  const refreshReferenceData = useCallback(async () => {
    try {
      const [modData, promptData, varData, skillData] = await Promise.all([
        fetch(`${apiUrl}/api/admin/orchestration/program/modules`, { headers }).then(r => r.json()),
        fetch(`${apiUrl}/api/admin/orchestration/prompts`, { headers }).then(r => r.json()),
        fetch(`${apiUrl}/api/admin/orchestration/variable-definitions`, { headers }).then(r => r.json()),
        fetch(`${apiUrl}/api/admin/orchestration/program/skills`, { headers }).then(r => r.json()),
      ]);
      setModules(Array.isArray(modData) ? modData : []);
      setPrompts(Array.isArray(promptData) ? promptData : []);

      const allVars: VariableOption[] = Array.isArray(varData) ? varData : [];
      setVariables(allVars);
      setSystemVariables(allVars.filter(v => v.source_type === 'system'));

      const flatSkills: SkillOption[] = [];
      const skillList = skillData?.skills || (Array.isArray(skillData) ? skillData : []);
      for (const s of skillList) {
        flatSkills.push({ id: s.id, skill_id: s.skill_id, name: s.name, layer_id: s.layer_id, domain_id: s.domain_id });
      }
      setSkills(flatSkills);
    } catch { /* non-critical */ }
  }, [apiUrl, token]);

  useEffect(() => { refreshReferenceData(); }, []);

  // Navigate from Sections tab
  useEffect(() => {
    if (initialLessonId && initialLessonId !== selectedLessonId) {
      selectLesson(initialLessonId);
    }
  }, [initialLessonId]);

  // --- Mini-section CRUD ---
  const fetchMiniSections = useCallback(async (lessonId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/lessons/${lessonId}/mini-sections`, { headers });
      if (res.ok) setMiniSections(await res.json());
    } catch { setError('Failed to load mini-sections'); }
    setLoading(false);
  }, [apiUrl, token]);

  const selectLesson = (id: string) => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard?')) return;
    setSelectedLessonId(id);
    setSelectedMiniSectionId(null);
    setEditing(null);
    setOriginalEditing('');
    setDryRun(null);
    setVariableMap(null);
    if (id) {
      fetchMiniSections(id);
      runValidation(id);
      fetchVariableMap(id);
    } else {
      setMiniSections([]);
    }
  };

  const selectMiniSection = (id: string | null) => {
    if (isDirty && id !== selectedMiniSectionId) {
      if (!window.confirm('You have unsaved changes. Discard?')) return;
    }
    setSelectedMiniSectionId(id);
    if (id) {
      const ms = miniSections.find(m => m.id === id);
      if (ms) {
        const copy = JSON.parse(JSON.stringify(ms));
        setEditing(copy);
        setOriginalEditing(JSON.stringify(copy));
        setError('');
      }
    } else {
      setEditing(null);
      setOriginalEditing('');
    }
  };

  const startCreate = () => {
    if (isDirty && !window.confirm('You have unsaved changes. Discard?')) return;
    const newMs: Partial<MiniSection> = {
      title: '', description: '', completion_weight: 1.0, is_active: true,
      mini_section_type: undefined as any,
      knowledge_check_config: { enabled: false, question_count: 3, pass_score: 70 },
      associated_skill_ids: [], associated_variable_keys: [], associated_artifact_ids: [],
      creates_variable_keys: [], creates_artifact_ids: [],
      settings_json: {},
    };
    setSelectedMiniSectionId(null);
    setEditing(newMs);
    setOriginalEditing(JSON.stringify(newMs));
    setError('');
  };

  const updateEditing = (updates: Partial<MiniSection>) => {
    setEditing(prev => prev ? { ...prev, ...updates } : null);
  };

  const handleSave = async () => {
    if (!editing || !selectedLessonId) return;
    setSaving(true); setError('');
    try {
      const isNew = !editing.id;
      const url = isNew
        ? `${apiUrl}/api/admin/orchestration/lessons/${selectedLessonId}/mini-sections`
        : `${apiUrl}/api/admin/orchestration/mini-sections/${editing.id}`;
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers, body: JSON.stringify(editing) });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const saved = await res.json();
      setEditing(null);
      setOriginalEditing('');
      setSelectedMiniSectionId(saved.id || null);
      await fetchMiniSections(selectedLessonId);
      runValidation(selectedLessonId);
      fetchVariableMap(selectedLessonId);
    } catch (err: any) { setError(err.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this mini-section?')) return;
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/mini-sections/${id}`, { method: 'DELETE', headers });
      if (selectedMiniSectionId === id) {
        setSelectedMiniSectionId(null);
        setEditing(null);
        setOriginalEditing('');
      }
      await fetchMiniSections(selectedLessonId);
      runValidation(selectedLessonId);
      fetchVariableMap(selectedLessonId);
    } catch (err: any) { setError(err.message); }
  };

  const cancelEdit = () => {
    setEditing(null);
    setOriginalEditing('');
    if (selectedMiniSectionId) {
      // Revert to the original data
      const ms = miniSections.find(m => m.id === selectedMiniSectionId);
      if (ms) {
        const copy = JSON.parse(JSON.stringify(ms));
        setEditing(copy);
        setOriginalEditing(JSON.stringify(copy));
      }
    }
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const newOrder = [...miniSections];
    const [item] = newOrder.splice(index, 1);
    newOrder.splice(index + direction, 0, item);
    setMiniSections(newOrder); // optimistic
    try {
      await fetch(`${apiUrl}/api/admin/orchestration/lessons/${selectedLessonId}/mini-sections/reorder`, {
        method: 'PUT', headers, body: JSON.stringify({ ordered_ids: newOrder.map(ms => ms.id) }),
      });
      fetchMiniSections(selectedLessonId);
      fetchVariableMap(selectedLessonId);
    } catch (err: any) { setError(err.message); }
  };

  // --- Validation ---
  const runValidation = async (lessonId: string) => {
    setValidating(true);
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/dry-run/section/${lessonId}`, { headers });
      if (res.ok) setDryRun(await res.json());
    } catch {}
    setValidating(false);
  };

  const fetchVariableMap = async (lessonId: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/lessons/${lessonId}/variable-map`, { headers });
      if (res.ok) setVariableMap(await res.json());
    } catch {}
  };

  // --- Prompt body caching ---
  const fetchPromptBody = async (promptId: string) => {
    if (promptBodies[promptId]) return promptBodies[promptId];
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/prompts/${promptId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const body: PromptBody = { system_prompt: data.system_prompt || '', user_prompt_template: data.user_prompt_template || '' };
        setPromptBodies(prev => ({ ...prev, [promptId]: body }));
        return body;
      }
    } catch {}
    return null;
  };

  // --- Derived ---
  const selectedLesson = modules.flatMap(m => m.lessons || []).find(l => l.id === selectedLessonId);
  const isDirty = editing ? JSON.stringify(editing) !== originalEditing : false;
  const isNewItem = editing ? !editing.id : false;

  const skillOptions = skills.map(s => ({ value: s.skill_id, label: s.name, sub: s.domain_id }));
  const variableOptions = variables.map(v => ({ value: v.variable_key, label: v.display_name || v.variable_key, sub: v.scope }));
  const artifactOptions = artifacts.map(a => ({ value: a.id, label: a.name, sub: a.artifact_type }));

  return {
    // Navigation
    modules, selectedLessonId, selectedMiniSectionId, selectedLesson,
    selectLesson, selectMiniSection,

    // Data
    miniSections, editing, isNewItem, isDirty,
    updateEditing, startCreate, handleSave, handleDelete, cancelEdit, moveItem,

    // Reference data
    prompts, skills, variables, artifacts, systemVariables,
    skillOptions, variableOptions, artifactOptions,
    promptBodies, fetchPromptBody,
    refreshReferenceData,

    // Validation
    dryRun, variableMap, validating,
    runValidation: () => selectedLessonId && runValidation(selectedLessonId),
    fetchVariableMap: () => selectedLessonId && fetchVariableMap(selectedLessonId),

    // UI state
    loading, saving, error, setError,
    inlineCreator, setInlineCreator,
    showSimulation, setShowSimulation,
  };
}
