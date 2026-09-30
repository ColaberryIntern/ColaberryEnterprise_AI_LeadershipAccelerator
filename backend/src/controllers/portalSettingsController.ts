import { Request, Response, NextFunction } from 'express';
import {
  getSettings, updateProfile, setAvatar, clearAvatar,
  setResume, clearResume, getResumeFile,
  validateAvatarDataUrl, validateResumeUpload, sanitizeProfilePatch,
} from '../services/portalSettingsService';

export async function handleGetSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getSettings(req.participant!.sub);
    if (!settings) return res.status(404).json({ error: 'Account not found' });
    res.json(settings);
  } catch (err) { next(err); }
}

export async function handleUpdateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = sanitizeProfilePatch(req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const settings = await updateProfile(req.participant!.sub, parsed.patch);
    if (!settings) return res.status(404).json({ error: 'Account not found' });
    res.json(settings);
  } catch (err) { next(err); }
}

export async function handleSetAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    const dataUrl = (req.body || {}).data_url;
    const v = validateAvatarDataUrl(dataUrl);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const settings = await setAvatar(req.participant!.sub, dataUrl);
    if (!settings) return res.status(404).json({ error: 'Account not found' });
    res.json(settings);
  } catch (err) { next(err); }
}

export async function handleClearAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await clearAvatar(req.participant!.sub);
    if (!settings) return res.status(404).json({ error: 'Account not found' });
    res.json(settings);
  } catch (err) { next(err); }
}

export async function handleSetResume(req: Request, res: Response, next: NextFunction) {
  try {
    const { file_name, mime, data_base64 } = req.body || {};
    const v = validateResumeUpload({ file_name, mime, data_base64 });
    if (!v.ok) return res.status(400).json({ error: v.error });
    const settings = await setResume(req.participant!.sub, { file_name, mime, data_base64 });
    if (!settings) return res.status(404).json({ error: 'Account not found' });
    res.json(settings);
  } catch (err) { next(err); }
}

export async function handleGetResume(req: Request, res: Response, next: NextFunction) {
  try {
    const file = await getResumeFile(req.participant!.sub);
    if (!file) return res.status(404).json({ error: 'No resume on file' });
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${file.file_name.replace(/"/g, '')}"`);
    res.send(file.buffer);
  } catch (err) { next(err); }
}

export async function handleClearResume(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await clearResume(req.participant!.sub);
    if (!settings) return res.status(404).json({ error: 'Account not found' });
    res.json(settings);
  } catch (err) { next(err); }
}
