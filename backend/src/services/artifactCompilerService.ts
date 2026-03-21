import { ArtifactDefinition, AssignmentSubmission, Project, ProjectArtifact } from '../models';
import { getProjectByEnrollment } from './projectService';
import { getFoundationArtifacts } from './artifactGraphService';
import { Op } from 'sequelize';

// ---------------------------------------------------------------------------
// Document Types
// ---------------------------------------------------------------------------

export type CompiledDocumentType = 'requirements' | 'claude_md' | 'system_prompt' | 'interaction_protocol';

const DOCUMENT_TEMPLATES: Record<CompiledDocumentType, {
  title: string;
  description: string;
  artifactFilter: (ad: ArtifactDefinition) => boolean;
  headerTemplate: string;
}> = {
  requirements: {
    title: 'Requirements Document',
    description: 'Compiled project requirements from strategy and architecture artifacts',
    artifactFilter: (ad) => {
      const type = (ad.artifact_type || '').toLowerCase();
      const role = ((ad as any).artifact_role || '').toLowerCase();
      return ['document', 'lab_exercise'].includes(type) ||
        role === 'strategy' || role === 'architecture' || role === 'output';
    },
    headerTemplate: '# Project Requirements\n\nGenerated from foundation artifacts.\n\n',
  },
  claude_md: {
    title: 'CLAUDE.md',
    description: 'Project coding guidelines and architecture decisions',
    artifactFilter: (ad) => {
      const type = (ad.artifact_type || '').toLowerCase();
      const role = ((ad as any).artifact_role || '').toLowerCase();
      return role === 'architecture' || role === 'governance' || type === 'reference_guide';
    },
    headerTemplate: '# CLAUDE.md\n\nProject guidelines compiled from architecture and governance artifacts.\n\n',
  },
  system_prompt: {
    title: 'System Prompt',
    description: 'AI system prompt compiled from strategy and implementation artifacts',
    artifactFilter: (ad) => {
      const type = (ad.artifact_type || '').toLowerCase();
      const role = ((ad as any).artifact_role || '').toLowerCase();
      return role === 'strategy' || role === 'implementation' || type === 'project_brief';
    },
    headerTemplate: '# System Prompt\n\nCompiled from strategy and implementation artifacts.\n\n',
  },
  interaction_protocol: {
    title: 'Interaction Protocol',
    description: 'Governance and ethical guidelines for AI interactions',
    artifactFilter: (ad) => {
      const role = ((ad as any).artifact_role || '').toLowerCase();
      return role === 'governance' || role === 'ethics';
    },
    headerTemplate: '# Interaction Protocol\n\nGovernance and ethical guidelines.\n\n',
  },
};

// ---------------------------------------------------------------------------
// 1. Compile a Single Document
// ---------------------------------------------------------------------------

export async function compileDocument(
  enrollmentId: string,
  documentType: CompiledDocumentType
): Promise<{ document: string; artifactCount: number; submissionId: string }> {
  const template = DOCUMENT_TEMPLATES[documentType];
  if (!template) throw new Error(`Unknown document type: ${documentType}`);

  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found for this enrollment');

  // Get all artifact definitions and filter for this document type
  const allArtifacts = await ArtifactDefinition.findAll({ order: [['sort_order', 'ASC']] });
  const relevantArtifacts = allArtifacts.filter(template.artifactFilter);

  if (relevantArtifacts.length === 0) {
    // Fall back to all foundation artifacts if filter returns nothing
    const foundations = await getFoundationArtifacts();
    relevantArtifacts.push(...foundations);
  }

  // Get latest submissions for each relevant artifact
  const artifactIds = relevantArtifacts.map((a) => a.id);
  const submissions = await AssignmentSubmission.findAll({
    where: {
      enrollment_id: enrollmentId,
      artifact_definition_id: { [Op.in]: artifactIds },
      is_latest: true,
    },
    order: [['created_at', 'ASC']],
  });

  // Build document from submissions
  let document = template.headerTemplate;

  // Add project context
  document += `## Project Context\n\n`;
  document += `- **Organization**: ${project.organization_name || 'Not specified'}\n`;
  document += `- **Industry**: ${project.industry || 'Not specified'}\n`;
  document += `- **Business Problem**: ${project.primary_business_problem || 'Not specified'}\n`;
  document += `- **Use Case**: ${project.selected_use_case || 'Not specified'}\n`;
  document += `- **Stage**: ${project.project_stage}\n\n`;

  document += `---\n\n`;

  // Compile each artifact's content
  for (const artifact of relevantArtifacts) {
    const submission = submissions.find((s) => s.artifact_definition_id === artifact.id);
    document += `## ${artifact.name}\n\n`;
    document += `*${artifact.description || 'No description'}*\n\n`;

    if (submission && submission.content_json) {
      const content = submission.content_json;
      if (typeof content === 'string') {
        document += content + '\n\n';
      } else if (content.text) {
        document += content.text + '\n\n';
      } else if (content.answers) {
        // Structured input submissions
        for (const [key, value] of Object.entries(content.answers as Record<string, any>)) {
          document += `**${key}**: ${value}\n\n`;
        }
      } else {
        document += '```json\n' + JSON.stringify(content, null, 2) + '\n```\n\n';
      }
    } else {
      document += '*Not yet submitted*\n\n';
    }

    document += `---\n\n`;
  }

  // Store compiled document as a system-level submission
  const systemArtifact = await getOrCreateSystemArtifact(documentType, template);

  const existing = await AssignmentSubmission.findOne({
    where: {
      enrollment_id: enrollmentId,
      artifact_definition_id: systemArtifact.id,
      is_latest: true,
    },
  });

  if (existing) {
    existing.is_latest = false;
    await existing.save();
  }

  const newSubmission = await AssignmentSubmission.create({
    enrollment_id: enrollmentId,
    artifact_definition_id: systemArtifact.id,
    assignment_type: 'build_lab',
    title: template.title,
    content_json: { text: document, compiled_at: new Date().toISOString(), source_count: submissions.length },
    status: 'submitted',
    submitted_at: new Date(),
    version_number: existing ? (existing.version_number || 1) + 1 : 1,
    parent_version_id: existing?.id,
    is_latest: true,
  });

  // Link to project
  await ProjectArtifact.findOrCreate({
    where: {
      project_id: project.id,
      artifact_definition_id: systemArtifact.id,
    },
    defaults: {
      project_id: project.id,
      artifact_definition_id: systemArtifact.id,
      submission_id: newSubmission.id,
      artifact_category: 'system',
      artifact_stage: 'compiled',
      version: newSubmission.version_number || 1,
    },
  });

  return {
    document,
    artifactCount: submissions.length,
    submissionId: newSubmission.id,
  };
}

// ---------------------------------------------------------------------------
// 2. Compile All Documents
// ---------------------------------------------------------------------------

export async function compileAll(enrollmentId: string): Promise<Record<CompiledDocumentType, {
  document: string;
  artifactCount: number;
  submissionId: string;
}>> {
  const results: any = {};
  for (const docType of Object.keys(DOCUMENT_TEMPLATES) as CompiledDocumentType[]) {
    results[docType] = await compileDocument(enrollmentId, docType);
  }
  return results;
}

// ---------------------------------------------------------------------------
// 3. Compilation Status
// ---------------------------------------------------------------------------

export async function getCompilationStatus(enrollmentId: string): Promise<{
  documents: Record<CompiledDocumentType, {
    canCompile: boolean;
    lastCompiled?: string;
    sourceArtifactsAvailable: number;
    sourceArtifactsTotal: number;
  }>;
}> {
  const allArtifacts = await ArtifactDefinition.findAll();
  const submissions = await AssignmentSubmission.findAll({
    where: { enrollment_id: enrollmentId, is_latest: true },
  });
  const submittedIds = new Set(submissions.map((s) => s.artifact_definition_id));

  const documents: any = {};

  for (const [docType, template] of Object.entries(DOCUMENT_TEMPLATES)) {
    const relevant = allArtifacts.filter(template.artifactFilter);
    const available = relevant.filter((a) => submittedIds.has(a.id)).length;

    // Check if system artifact submission exists
    const systemArtifact = await ArtifactDefinition.findOne({
      where: { name: `compiled_${docType}`, artifact_type: 'system_compiled' },
    });
    let lastCompiled: string | undefined;
    if (systemArtifact) {
      const lastSub = await AssignmentSubmission.findOne({
        where: {
          enrollment_id: enrollmentId,
          artifact_definition_id: systemArtifact.id,
          is_latest: true,
        },
      });
      if (lastSub) lastCompiled = lastSub.submitted_at?.toISOString();
    }

    documents[docType] = {
      canCompile: available > 0,
      lastCompiled,
      sourceArtifactsAvailable: available,
      sourceArtifactsTotal: relevant.length,
    };
  }

  return { documents };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateSystemArtifact(
  docType: CompiledDocumentType,
  template: typeof DOCUMENT_TEMPLATES[CompiledDocumentType]
): Promise<ArtifactDefinition> {
  const [artifact] = await ArtifactDefinition.findOrCreate({
    where: { name: `compiled_${docType}`, artifact_type: 'system_compiled' },
    defaults: {
      name: `compiled_${docType}`,
      description: template.description,
      artifact_type: 'system_compiled',
      artifact_role: 'system',
    } as any,
  });
  return artifact;
}
