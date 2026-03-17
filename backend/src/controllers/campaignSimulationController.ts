import type { Request, Response } from 'express';
import {
  startSimulation,
  pauseSimulation,
  resumeSimulation,
  skipStep,
  jumpToStep,
  respondAsLead,
  advanceStep,
  cancelSimulation,
  getSimulationState,
  getSimulationHistory,
} from '../services/testing/campaignSimulator';
import { getSimulationComms } from '../services/communicationLogService';
import type { SpeedMode } from '../services/testing/timeWarpEngine';

export async function handleStartSimulation(req: Request, res: Response) {
  try {
    const campaignId = req.params.id as string;
    const { speed_mode = 'fast', lead_overrides, template_vars, appointment_time } = req.body;
    const simulation = await startSimulation(campaignId, speed_mode as SpeedMode, lead_overrides, template_vars, appointment_time);
    res.json(simulation);
  } catch (err: any) {
    console.error('[SimController] Start error:', err.message);
    res.status(400).json({ error: err.message });
  }
}

export async function handleGetSimulation(req: Request, res: Response) {
  try {
    const simId = req.params.simId as string;
    const state = await getSimulationState(simId);
    res.json(state);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
}

export async function handlePauseSimulation(req: Request, res: Response) {
  try {
    await pauseSimulation(req.params.simId as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleResumeSimulation(req: Request, res: Response) {
  try {
    await resumeSimulation(req.params.simId as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleSkipStep(req: Request, res: Response) {
  try {
    await skipStep(req.params.simId as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleJumpToStep(req: Request, res: Response) {
  try {
    const { step_index } = req.body;
    await jumpToStep(req.params.simId as string, step_index);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleRespondAsLead(req: Request, res: Response) {
  try {
    const { outcome, response_text } = req.body;
    await respondAsLead(req.params.simId as string, outcome, response_text);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleAdvanceStep(req: Request, res: Response) {
  try {
    await advanceStep(req.params.simId as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleCancelSimulation(req: Request, res: Response) {
  try {
    await cancelSimulation(req.params.simId as string);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function handleGetSimulationHistory(req: Request, res: Response) {
  try {
    const campaignId = req.params.id as string;
    const history = await getSimulationHistory(campaignId);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

export async function handleGetSimulationComms(req: Request, res: Response) {
  try {
    const simId = req.params.simId as string;
    const comms = await getSimulationComms(simId);
    res.json(comms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
