import type { Request, Response } from 'express';
import { sequelize } from '../config/database';
import { loadActorRoster } from '../services/agentDomain/actorRoster';

/**
 * AF11.11 — the people a tool's output can be sent to, so `acts_on_output` is PICKED, not guessed.
 *
 * ## Why this route has to exist for the form to be fillable
 *
 * AF11.7 made `acts_on_output` required and checks it against a roster: an address that is not on
 * it is refused as `acts_on_output_not_a_person`. The roster was readable only from inside the
 * service. So a builder filling the form had to type an email and find out by submitting whether
 * it was one we hold a record of — and the refusal names the rule without being able to say which
 * addresses would pass.
 *
 * That is the exact shape of problem `agentChangeRequestRoutes.ts` records about the dataset
 * picker: *"`read_datasets_not_catalogued` would then be a refusal with no way to resolve it."*
 * Same fix, same section, for the same reason.
 *
 * ## It returns EMAILS ONLY, and that is the whole payload
 *
 * `loadActorRoster` reads `admin_users` and the agent-domain `org_members`, and the only column it
 * selects is the email. No names, no phone numbers, no roles, no community data. The caller is a
 * staff member naming a colleague who will read their agent's output, and the narrowest thing that
 * answers that is the list of addresses the gate will accept.
 *
 * ## An absent roster is reported as absent, never as an empty list
 *
 * `loadActorRoster` never rejects: an unreadable table comes back `roster_absent: true`. That is
 * passed through rather than flattened into `[]`, because a form that drew an empty picker would
 * tell a builder there is nobody to send output to, which is a confident wrong answer. The screen
 * says the roster could not be read and lets them type an address instead, and the gate still has
 * the final say.
 */

export async function handleListAgentDomainActors(req: Request, res: Response): Promise<void> {
  const started = Date.now();
  const actorEmail = (req as any).admin?.email ?? '';

  // No try/catch: `loadActorRoster` cannot reject. A catch here would be a branch no test could
  // enter, which `datasetCatalogController.ts` records as worse than its absence.
  const roster = await loadActorRoster(sequelize);

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: roster.roster_absent ? 'warn' : 'info',
    service: 'backend',
    event: 'agent_domain_actor_roster_read',
    outcome: roster.roster_absent ? 'partial' : 'success',
    duration_ms: Date.now() - started,
    actor_email: actorEmail,
    context: { returned: roster.emails.length, roster_absent: roster.roster_absent },
  }));

  res.json({
    actors: roster.emails,
    /**
     * TRUE means we could not read the roster, or it is empty. The form must show this rather
     * than an empty picker: the gate refuses an unknown address, so a builder who cannot see the
     * list needs to know the list is missing and not that nobody exists.
     */
    roster_absent: roster.roster_absent,
    note: roster.roster_absent
      ? 'We could not read the people record just now, so this list is missing rather than empty. '
        + 'You can still type an address; it is checked when you file.'
      : 'The people we hold a record of. The address you name has to be one of these.',
  });
}
