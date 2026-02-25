import { Request, Response, NextFunction } from 'express';
import {
  createSequence,
  listSequences,
  getSequenceById,
  updateSequence,
  deleteSequence,
  enrollLeadInSequence,
  cancelSequenceForLead,
  getLeadSequenceStatus,
} from '../services/sequenceService';

export async function handleListSequences(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sequences = await listSequences();
    res.json({ sequences });
  } catch (error) {
    next(error);
  }
}

export async function handleGetSequence(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sequence = await getSequenceById(req.params.id as string);
    if (!sequence) {
      res.status(404).json({ error: 'Sequence not found' });
      return;
    }
    res.json({ sequence });
  } catch (error) {
    next(error);
  }
}

export async function handleCreateSequence(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { name, description, steps } = req.body;
    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ error: 'Name and at least one step are required' });
      return;
    }
    const sequence = await createSequence({ name, description, steps });
    res.status(201).json({ sequence });
  } catch (error) {
    next(error);
  }
}

export async function handleUpdateSequence(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sequence = await updateSequence(req.params.id as string, req.body);
    if (!sequence) {
      res.status(404).json({ error: 'Sequence not found' });
      return;
    }
    res.json({ sequence });
  } catch (error) {
    next(error);
  }
}

export async function handleDeleteSequence(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const deleted = await deleteSequence(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Sequence not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function handleEnrollLeadInSequence(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leadId = parseInt(req.params.id as string, 10);
    if (isNaN(leadId)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const { sequence_id } = req.body;
    if (!sequence_id) {
      res.status(400).json({ error: 'sequence_id is required' });
      return;
    }

    const scheduledEmails = await enrollLeadInSequence(leadId, sequence_id);
    res.status(201).json({ scheduledEmails, count: scheduledEmails.length });
  } catch (error: any) {
    if (error.message.includes('not found') || error.message.includes('inactive')) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function handleCancelLeadSequence(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leadId = parseInt(req.params.id as string, 10);
    if (isNaN(leadId)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const cancelled = await cancelSequenceForLead(leadId);
    res.json({ cancelled });
  } catch (error) {
    next(error);
  }
}

export async function handleGetLeadSequenceStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const leadId = parseInt(req.params.id as string, 10);
    if (isNaN(leadId)) {
      res.status(400).json({ error: 'Invalid lead ID' });
      return;
    }

    const emails = await getLeadSequenceStatus(leadId);
    res.json({ emails });
  } catch (error) {
    next(error);
  }
}
