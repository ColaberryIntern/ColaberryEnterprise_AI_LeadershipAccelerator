import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import AgentDomainChangeRequest from '../../models/AgentDomainChangeRequest';
import AgentDomainToolRequestDetail from '../../models/AgentDomainToolRequestDetail';
import { buildToolScaffold } from '../../services/agentDomain/toolScaffold';

/**
 * AF11.6 — the scaffold an approved request emits.
 *
 * ## A READ. It writes no file, registers nothing and deploys nothing
 *
 * The ticket requires emitting *"into a reviewable location, never directly over an existing
 * file"*, and the strongest reading of that is to write nothing at all: this returns the three
 * files as text for a human to review and commit. Nothing can be overwritten because nothing is
 * written, and it cannot fail on a read-only container filesystem either.
 *
 * It also means the endpoint is safe to call twice, which matters: `buildToolScaffold` is
 * deterministic, so re-reading after the request was edited gives a readable diff rather than a
 * second copy of anything.
 *
 * ## ONLY FOR AN APPROVED REQUEST
 *
 * Scaffolding a request nobody has decided would put a tool-shaped file in front of somebody
 * before the decision to build it was taken, which is the quiet way a build starts without an
 * approval. `approve_to_build` is the decision that earns a scaffold.
 *
 * The prefix is `/api/admin/agent-domain-tool-requests`, already mapped to the `program` section
 * at `mgmtSectionGate.ts:178`, so no new row lands with this change. Checked, not assumed.
 */

const router = Router();

const IdParamSchema = z.object({ id: z.string().uuid('Not a change request id.') });

router.get(
  '/api/admin/agent-domain-tool-requests/:id/scaffold',
  requireAdmin,
  async (req, res) => {
    const params = IdParamSchema.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.issues[0]?.message ?? 'Bad id.' });
      return;
    }
    try {
      const request = await AgentDomainChangeRequest.findByPk(params.data.id);
      if (!request) {
        res.status(404).json({ error: 'No such request.' });
        return;
      }
      if (String(request.kind ?? 'change') !== 'tool') {
        res.status(409).json({ error: 'A scaffold is emitted from a tool request.' });
        return;
      }
      if (String(request.status) !== 'approved') {
        // Not a permissions problem and not a bad request: the decision simply has not been
        // taken, and saying so plainly is what stops somebody reading a 403 and going looking
        // for an access issue that does not exist.
        res.status(409).json({
          error: `This request is ${request.status}. A scaffold is emitted once it is approved to build.`,
        });
        return;
      }
      const detail = await AgentDomainToolRequestDetail.findByPk(params.data.id);
      if (!detail) {
        res.status(409).json({ error: 'This request carries no details, so there is nothing to emit from.' });
        return;
      }

      const scaffold = buildToolScaffold({
        tool_name: detail.tool_name,
        purpose: detail.purpose,
        reads: Array.isArray(detail.reads) ? detail.reads.map(String) : [],
        produces: Array.isArray(detail.produces) ? detail.produces.map(String) : [],
        inputs: Array.isArray(detail.inputs) ? detail.inputs.map(String) : [],
        writes: Boolean(detail.writes),
        capability_id: detail.capability_id,
        domain_key: detail.domain_key,
      });
      res.json({ scaffold });
    } catch (err: unknown) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service: 'backend',
        event: 'tool_scaffold_unavailable',
        outcome: 'failure',
        error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
        context: { message: err instanceof Error ? err.message : String(err) },
      }));
      res.status(500).json({ error: 'Could not emit the scaffold.' });
    }
  },
);

export default router;
