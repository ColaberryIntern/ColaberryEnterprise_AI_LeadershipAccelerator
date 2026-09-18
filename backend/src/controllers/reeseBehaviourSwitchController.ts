import { Request, Response } from 'express';
import { z } from 'zod';
import AiAgent from '../models/AiAgent';
import { reeseBehaviourSwitchKeySchema, reeseBehaviourSwitchInputSchema } from '../schemas/reeseBehaviourSwitchSchema';
import { setReeseBehaviourSwitch, ReeseAgentMissingError, ReeseSiblingMissingError } from '../services/reese/reeseBehaviourSwitchService';

/**
 * Reese Product Phase 1 follow-up (2026-09-18) — PATCH .../behaviours/:key.
 * Gated by `requireAgentManagerOrAdmin()` at the route layer (a platform
 * admin, or Reese's own real manager — Ali, per R6). Reese-only: `:id` must
 * resolve to the real 'Reese' agent_name, never any other agent, checked
 * here before any write.
 */
export async function handleSetReeseBehaviourSwitch(req: Request, res: Response) {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!id) {
      res.status(400).json({ error: 'Agent id is required' });
      return;
    }

    const agent = await AiAgent.findByPk(id, { attributes: ['id', 'agent_name'] });
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    if (agent.agent_name !== 'Reese') {
      res.status(404).json({ error: 'This switch is only available for Reese.' });
      return;
    }

    const key = reeseBehaviourSwitchKeySchema.parse(req.params.key);
    const { enabled } = reeseBehaviourSwitchInputSchema.parse(req.body || {});

    const result = await setReeseBehaviourSwitch(key, enabled);
    console.log(
      JSON.stringify({
        level: 'info',
        service: 'reese-behaviour-switch',
        event: 'switch_changed',
        actor_email: req.admin!.email,
        key: result.key,
        enabled: result.enabled,
        also_changed: result.alsoChanged,
      }),
    );
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', issues: err.issues });
      return;
    }
    if (err instanceof ReeseAgentMissingError || err instanceof ReeseSiblingMissingError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[ReeseBehaviourSwitch] Error:', err.message);
    res.status(500).json({ error: 'Failed to update behaviour switch' });
  }
}
