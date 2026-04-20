import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { Op } from 'sequelize';

const router = Router();

router.get('/api/admin/content-queue', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { OpenclawResponse, OpenclawSignal } = require('../../models');
    const platform = req.query.platform as string;

    const where: any = {
      post_status: { [Op.in]: ['ready_to_post', 'approved'] },
      [Op.or]: [
        { execution_type: 'manual_posting' },
        { execution_type: 'human_execution' },
        { platform: { [Op.in]: ['linkedin', 'medium'] } },
      ],
    };
    if (platform && platform !== 'all') where.platform = platform;

    const responses = await OpenclawResponse.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 100,
    });

    const signalIds = responses.map((r: any) => r.signal_id).filter(Boolean);
    const signals = signalIds.length > 0
      ? await OpenclawSignal.findAll({ where: { id: signalIds }, attributes: ['id', 'title', 'source_url'] })
      : [];
    const signalMap = new Map(signals.map((s: any) => [s.id, s]));

    const items = responses.map((r: any) => {
      const signal = signalMap.get(r.signal_id);
      return {
        id: r.id,
        platform: r.platform,
        content: r.content,
        signal_title: signal?.title || '',
        signal_url: signal?.source_url || '',
        tracked_url: r.tracked_url || '',
        created_at: r.created_at,
        post_status: r.post_status,
      };
    });

    res.json({ items, total: items.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/content-queue/:id/posted', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { OpenclawResponse } = require('../../models');
    const resp = await OpenclawResponse.findByPk(req.params.id);
    if (!resp) return res.status(404).json({ error: 'Not found' });
    await resp.update({ post_status: 'posted', posted_at: new Date() });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/content-queue/:id/skip', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { OpenclawResponse } = require('../../models');
    const resp = await OpenclawResponse.findByPk(req.params.id);
    if (!resp) return res.status(404).json({ error: 'Not found' });
    await resp.update({ post_status: 'rejected' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
