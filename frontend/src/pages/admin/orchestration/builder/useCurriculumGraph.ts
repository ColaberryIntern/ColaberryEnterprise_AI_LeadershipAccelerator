import { useState, useEffect, useCallback } from 'react';
import api from '../../../../utils/api';

export interface SkillCrossRef {
  skill_id: string;
  name: string;
  skill_type: string;
  layer_id: string;
  domain_id: string;
  sections: {
    lesson_id: string;
    lesson_title: string;
    module_number: number;
    lesson_number: number;
    role: 'introduced' | 'reinforced' | 'mastered';
  }[];
  first_introduced: { lesson_id: string; lesson_title: string } | null;
  progression_order: number;
}

export interface ArtifactFlowRef {
  artifact_id: string;
  name: string;
  artifact_type: string;
  artifact_role: string;
  produced_by: { lesson_id: string; lesson_title: string } | null;
  consumed_by: { lesson_id: string; lesson_title: string }[];
}

export interface SectionDependencies {
  section_id: string;
  inherited_skills: { skill_id: string; name: string; from_section: string }[];
  required_artifacts: { artifact_id: string; name: string; from_section: string }[];
  upstream_sections: { lesson_id: string; lesson_title: string }[];
}

interface UseCurriculumGraphResult {
  skillGraph: SkillCrossRef[];
  artifactFlow: ArtifactFlowRef[];
  dependencies: SectionDependencies | null;
  loading: boolean;
  refresh: () => void;
}

export function useCurriculumGraph(lessonId?: string): UseCurriculumGraphResult {
  const [skillGraph, setSkillGraph] = useState<SkillCrossRef[]>([]);
  const [artifactFlow, setArtifactFlow] = useState<ArtifactFlowRef[]>([]);
  const [dependencies, setDependencies] = useState<SectionDependencies | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [skillRes, artifactRes] = await Promise.all([
        api.get('/api/admin/orchestration/program/skill-graph'),
        api.get('/api/admin/orchestration/program/artifact-flow'),
      ]);
      setSkillGraph(skillRes.data.skillGraph || []);
      setArtifactFlow(artifactRes.data.artifactFlow || []);

      if (lessonId) {
        const depRes = await api.get(`/api/admin/orchestration/sections/${lessonId}/dependencies`);
        setDependencies(depRes.data);
      }
    } catch {
      // silent — graph data is supplementary
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return { skillGraph, artifactFlow, dependencies, loading, refresh: fetchAll };
}
