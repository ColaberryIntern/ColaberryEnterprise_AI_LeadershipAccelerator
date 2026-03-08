import { Request, Response } from 'express';
import * as promptService from '../services/promptService';
import * as artifactService from '../services/artifactService';
import * as variableService from '../services/variableService';
import * as orchestrationService from '../services/orchestrationService';
import { SectionConfig } from '../models';

// --- Prompt Template CRUD ---

export async function handleListPromptTemplates(req: Request, res: Response) {
  try {
    const prompt_type = req.query.prompt_type as string | undefined;
    const is_active = req.query.is_active as string | undefined;
    const templates = await promptService.listPromptTemplates({
      prompt_type,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
    });
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetPromptTemplate(req: Request, res: Response) {
  try {
    const template = await promptService.getPromptTemplate(req.params.id as string);
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleCreatePromptTemplate(req: Request, res: Response) {
  try {
    const template = await promptService.createPromptTemplate(req.body);
    res.status(201).json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdatePromptTemplate(req: Request, res: Response) {
  try {
    const template = await promptService.updatePromptTemplate(req.params.id as string, req.body);
    if (!template) return res.status(404).json({ error: 'Not found' });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDeletePromptTemplate(req: Request, res: Response) {
  try {
    const deleted = await promptService.deletePromptTemplate(req.params.id as string);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handlePreviewPromptTemplate(req: Request, res: Response) {
  try {
    const result = await promptService.previewPrompt(req.params.id as string, req.body.variables || {});
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Section Config CRUD ---

export async function handleListSections(req: Request, res: Response) {
  try {
    const sessionId = req.params.sessionId as string;
    const sections = await SectionConfig.findAll({
      where: { session_id: sessionId },
      order: [['section_order', 'ASC']],
    });
    res.json(sections);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetSection(req: Request, res: Response) {
  try {
    const section = await SectionConfig.findByPk(req.params.id as string);
    if (!section) return res.status(404).json({ error: 'Not found' });
    res.json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleCreateSection(req: Request, res: Response) {
  try {
    const section = await SectionConfig.create({
      ...req.body,
      session_id: req.params.sessionId as string,
    });
    res.status(201).json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateSection(req: Request, res: Response) {
  try {
    const section = await SectionConfig.findByPk(req.params.id as string);
    if (!section) return res.status(404).json({ error: 'Not found' });
    await section.update(req.body);
    res.json(section);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDeleteSection(req: Request, res: Response) {
  try {
    const count = await SectionConfig.destroy({ where: { id: req.params.id as string } });
    if (!count) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Artifact Definition CRUD ---

export async function handleListArtifacts(req: Request, res: Response) {
  try {
    const artifacts = await artifactService.listArtifactDefinitions(req.params.sessionId as string);
    res.json(artifacts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetArtifact(req: Request, res: Response) {
  try {
    const artifact = await artifactService.getArtifactDefinition(req.params.id as string);
    if (!artifact) return res.status(404).json({ error: 'Not found' });
    res.json(artifact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleCreateArtifact(req: Request, res: Response) {
  try {
    const artifact = await artifactService.createArtifactDefinition({
      ...req.body,
      session_id: req.params.sessionId as string,
    });
    res.status(201).json(artifact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleUpdateArtifact(req: Request, res: Response) {
  try {
    const artifact = await artifactService.updateArtifactDefinition(req.params.id as string, req.body);
    if (!artifact) return res.status(404).json({ error: 'Not found' });
    res.json(artifact);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleDeleteArtifact(req: Request, res: Response) {
  try {
    const deleted = await artifactService.deleteArtifactDefinition(req.params.id as string);
    if (!deleted) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Variable Store ---

export async function handleGetVariables(req: Request, res: Response) {
  try {
    const variables = await variableService.getAllVariables(req.params.enrollmentId as string);
    res.json(variables);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetVariableGraph(req: Request, res: Response) {
  try {
    const enrollmentId = req.params.enrollmentId as string;
    const graph = await variableService.getVariableDependencyGraph(enrollmentId);
    res.json(graph);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Session Flow ---

export async function handleGetSessionFlow(req: Request, res: Response) {
  try {
    const flow = await orchestrationService.getSessionFlow(req.params.cohortId as string);
    res.json(flow);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetSessionDetail(req: Request, res: Response) {
  try {
    const session = await orchestrationService.getSessionWithSections(req.params.sessionId as string);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetDashboard(req: Request, res: Response) {
  try {
    const dashboard = await orchestrationService.getOrchestrationDashboard(req.params.cohortId as string);
    res.json(dashboard);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

// --- Artifact Status for Enrollment ---

export async function handleGetArtifactStatus(req: Request, res: Response) {
  try {
    const status = await artifactService.getArtifactStatus(
      req.params.enrollmentId as string,
      req.params.sessionId as string
    );
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
