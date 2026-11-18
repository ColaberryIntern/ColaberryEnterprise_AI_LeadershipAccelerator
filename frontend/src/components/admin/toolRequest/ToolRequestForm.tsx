import React, { useEffect, useState } from 'react';
import ListField from './ListField';
import DatasetPicker from './DatasetPicker';
import { issuesByField, FORM_GROUPS } from './toolRequestFormFields';
import {
  CHANGE_REQUEST_TITLE_MAX,
  TOOL_ACTOR_MAX,
  TOOL_ENVIRONMENTS,
  TOOL_NAME_MAX,
  TOOL_NARRATIVE_MAX,
  TOOL_PRODUCT_STATES,
  TOOL_PURPOSE_MAX,
  TOOL_RUN_FREQUENCIES,
  TOOL_SIDE_EFFECTS_MAX,
  draftToolRequest,
  errorMessage,
  fetchActorRoster,
  fetchMyDomainCapabilities,
  fileChangeRequest,
  toolRequestIssues,
  type ChangeRequest,
  type DraftGrounding,
  type ProjectedCapability,
  type ToolRequestIssue,
  type ToolRequestSubmission,
} from '../../../services/agentDomainApi';

/**
 * AF11.11 — the form that files a tool request. The thing that was missing.
 *
 * Every rung of this ladder was built before the form was: AF11.1 defined the contract, AF11.2 the
 * duplicate check, AF11.3 the review console, AF11.4 the grant, AF11.6 the scaffold, AF11.7 the
 * three questions, AF11.8 the decision package, AF11.9 the front door and AF11.10 the board. The
 * API accepted `kind: 'tool'` with a full payload the whole time. Nothing could reach it, because
 * `AdminChangeRequestsPage` sent a title and a description and no `kind`, which is why production
 * holds zero tool requests.
 *
 * ## THE SERVER IS THE ONLY AUTHORITY ON COMPLETENESS, and this form does not duplicate it
 *
 * The obvious build is to validate all twenty-four fields here and only submit a complete request.
 * That is the wrong call and the schema says why in its own header: *"presence is decided in
 * exactly one place"*, because *"splitting the same rule across a Zod `.min(1)` and a contract
 * check would mean two definitions of 'complete' drifting apart, and the one the tests assert would
 * not be the one the API enforces."*
 *
 * So this form has no required-field logic. It submits what was typed, and renders the named
 * refusals that come back. There is exactly one definition of a complete tool request and it lives
 * on the server.
 *
 * The one thing checked here is `maxLength` on the inputs, and that is a different kind of rule: a
 * control that lets somebody type 2,000 characters the API will refuse is a control that wastes
 * their typing. The limits are imported from `agentDomainApi.ts` rather than written again.
 *
 * ## EVERY REFUSAL LANDS ON ITS FIELD
 *
 * A first submit can legitimately return a dozen named issues, and a dozen sentences in one box is
 * a list the reader has to match back to inputs by hand. `issuesByField` maps each rule to its
 * field; anything unmapped surfaces above the form rather than disappearing.
 *
 * ## THE FORM NEVER CLEARS ON A REFUSAL
 *
 * Twenty-four fields retyped because one date was wrong is how somebody stops filing requests.
 * The existing change-request form already records this rule: *"the form stays filled so a
 * one-character fix does not mean retyping it."*
 *
 * ## It does NOT prefill `tried_in_product` from the front door
 *
 * `AddCapabilityFrontDoor` answers whether the product can already do this, and carrying that
 * answer into this field would give it two sources. The front door's own header names the
 * consequence: they *"would disagree the first time a builder changed their mind after actually
 * using the feature."* The builder answers it here.
 */

const RUN_FREQUENCY_WORDS: Record<string, string> = {
  once: 'Once',
  on_demand: 'When somebody asks',
  per_event: 'Every time something happens',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
};

const PRODUCT_STATE_WORDS: Record<string, string> = {
  used_by_hand: 'I have done this in the app myself, by hand',
  exists_unused: 'The app can do this, but I have not tried it',
  not_built: 'The app cannot do this today',
};

/** Blank rows are not answers. The contract drops them and then judges what is left. */
function cleanList(values: string[]): string[] {
  return values.map((v) => v.trim()).filter((v) => v.length > 0);
}

interface FormState {
  title: string;
  tool_name: string;
  purpose: string;
  reads: string[];
  produces: string[];
  read_datasets: string[];
  capability_id: string;
  task_unblocked: string;
  task_key: string;
  manual_today: string;
  acts_on_output: string;
  judged_threshold: string;
  judged_measured_from: string;
  tried_in_product: string;
  missing_from_product: string;
  needed_by: string;
  run_frequency: string;
  touches: string[];
  environment: string;
  inputs: string[];
  /** Tri-state until answered: `writes_undeclared` is a real refusal and a default would hide it. */
  writes: boolean | null;
  side_effects: string;
  reversible: boolean | null;
  reversibility_note: string;
}

const EMPTY: FormState = {
  title: '',
  tool_name: '',
  purpose: '',
  reads: [],
  produces: [],
  read_datasets: [],
  capability_id: '',
  task_unblocked: '',
  task_key: '',
  manual_today: '',
  acts_on_output: '',
  judged_threshold: '',
  judged_measured_from: '',
  tried_in_product: '',
  missing_from_product: '',
  needed_by: '',
  run_frequency: '',
  touches: [],
  environment: '',
  inputs: [],
  writes: null,
  side_effects: '',
  reversible: null,
  reversibility_note: '',
};

/** The sentence or sentences refused about one field, under that field. */
function FieldIssues({ issues }: { issues?: ToolRequestIssue[] }) {
  if (!issues || issues.length === 0) return null;
  return (
    <div className="mt-1">
      {issues.map((i) => (
        <div key={i.rule + i.detail} className="small text-danger" data-testid={`issue-${i.rule}`}>
          {i.detail}
        </div>
      ))}
    </div>
  );
}

function Group({
  group,
  children,
}: {
  group: { key: string; heading: string; question: string };
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4" data-testid={`form-group-${group.key}`}>
      <div className="d-flex align-items-baseline gap-2 mb-1">
        <span className="badge-label text-uppercase" style={{ color: 'var(--color-primary)' }}>
          {group.heading}
        </span>
      </div>
      <div className="text-muted small mb-3">{group.question}</div>
      {children}
    </div>
  );
}

export default function ToolRequestForm({
  domainKey,
  agentId,
  agentDisplayName,
  onFiled,
}: {
  domainKey: string;
  /** Null when the domain has no agent yet, which is a real state the gate refuses by name. */
  agentId: string | null;
  agentDisplayName: string | null;
  onFiled: (created: ChangeRequest) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [filing, setFiling] = useState(false);
  const [problem, setProblem] = useState('');
  const [issues, setIssues] = useState<ToolRequestIssue[]>([]);
  const [filed, setFiled] = useState('');

  const [capabilities, setCapabilities] = useState<ProjectedCapability[]>([]);
  const [capabilityTotal, setCapabilityTotal] = useState(0);
  const [capabilityProblem, setCapabilityProblem] = useState('');
  const [actors, setActors] = useState<string[]>([]);
  const [rosterAbsent, setRosterAbsent] = useState(false);

  // AF11.12 — the drafter. Separate problem state from `problem`, because a drafter that is
  // unreachable must not render as "could not file that request": the form is still fillable by
  // hand and saying otherwise would stop somebody who could have carried on.
  const [intent, setIntent] = useState('');
  const [drafting, setDrafting] = useState<'' | 'from_intent' | 'suggest'>('');
  const [draftProblem, setDraftProblem] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [grounding, setGrounding] = useState<DraftGrounding | null>(null);
  /**
   * AF11.13 — the drafted ten-block case, held until the request is filed and sent with it.
   *
   * Held rather than rendered as twenty more inputs: the case is what the APPROVER reads, and
   * putting it on the filing form would double a form that is already long. The builder edits it
   * on the request after filing, which is where the review console already shows it.
   */
  const [draftedPackage, setDraftedPackage] = useState<Record<string, unknown> | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * Load a draft into the fields.
   *
   * Every value is written through the SAME `FormState` the typed version uses, so from here on
   * there is no such thing as a drafted request: there is a form with text in it. A field the
   * drafter omitted is left exactly as it was rather than blanked, because a second draft should
   * not silently discard something already corrected by hand.
   */
  function applyDraft(detail: ToolRequestSubmission, title: string) {
    setForm((prev) => {
      const str = (v: string | null | undefined, fallback: string) =>
        (typeof v === 'string' && v.trim() ? v : fallback);
      const list = (v: ReadonlyArray<string> | undefined, fallback: string[]) =>
        (Array.isArray(v) ? [...v] : fallback);
      const bool = (v: boolean | null | undefined, fallback: boolean | null) =>
        (typeof v === 'boolean' ? v : fallback);
      return {
        ...prev,
        title: title.trim() || prev.title,
        tool_name: str(detail.tool_name, prev.tool_name),
        purpose: str(detail.purpose, prev.purpose),
        reads: list(detail.reads, prev.reads),
        produces: list(detail.produces, prev.produces),
        read_datasets: list(detail.read_datasets, prev.read_datasets),
        capability_id: str(detail.capability_id, prev.capability_id),
        task_unblocked: str(detail.task_unblocked, prev.task_unblocked),
        task_key: str(detail.task_key, prev.task_key),
        manual_today: str(detail.manual_today, prev.manual_today),
        acts_on_output: str(detail.acts_on_output, prev.acts_on_output),
        judged_threshold: str(detail.judged_threshold, prev.judged_threshold),
        judged_measured_from: str(detail.judged_measured_from, prev.judged_measured_from),
        tried_in_product: str(detail.tried_in_product, prev.tried_in_product),
        missing_from_product: str(detail.missing_from_product, prev.missing_from_product),
        needed_by: str(detail.needed_by, prev.needed_by),
        run_frequency: str(detail.run_frequency, prev.run_frequency),
        touches: list(detail.touches, prev.touches),
        environment: str(detail.environment, prev.environment),
        inputs: list(detail.inputs, prev.inputs),
        writes: bool(detail.writes, prev.writes),
        side_effects: str(detail.side_effects, prev.side_effects),
        reversible: bool(detail.reversible, prev.reversible),
        reversibility_note: str(detail.reversibility_note, prev.reversibility_note),
      };
    });
  }

  async function onDraft(mode: 'from_intent' | 'suggest') {
    setDraftProblem('');
    setDraftNote('');
    // Clearing the previous refusals too: they were about the previous text, and leaving them
    // under fields the drafter has just rewritten would point at the wrong thing.
    setIssues([]);
    setProblem('');
    setDrafting(mode);
    try {
      const d = await draftToolRequest(domainKey, mode === 'from_intent' ? intent : null);
      applyDraft(d.tool_request, d.title);
      setDraftedPackage(
        d.decision_package && Object.keys(d.decision_package).length > 0 ? d.decision_package : null,
      );
      setGrounding(d.grounded_in);
      setDraftNote(d.note);
    } catch (e) {
      setDraftProblem(errorMessage(e, 'Could not draft that just now. You can still fill it in.'));
    } finally {
      setDrafting('');
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetchMyDomainCapabilities(domainKey);
        if (!alive) return;
        setCapabilities(res.capabilities);
        setCapabilityTotal(res.capability_total);
        setCapabilityProblem('');
      } catch (e) {
        if (!alive) return;
        setCapabilities([]);
        // An unreadable registry must not read as "this domain has no capabilities": the gate
        // refuses an id that is not on the roster, so a builder shown an empty list would have
        // nothing to pick and no way to know why.
        setCapabilityProblem(errorMessage(e, 'Could not read this domain’s capabilities.'));
      }
      try {
        const res = await fetchActorRoster();
        if (!alive) return;
        setActors(res.actors);
        setRosterAbsent(res.roster_absent);
      } catch {
        if (!alive) return;
        setActors([]);
        setRosterAbsent(true);
      }
    })();
    return () => { alive = false; };
  }, [domainKey]);

  const grouped = issuesByField(issues);
  const byField = grouped.byField;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProblem('');
    setIssues([]);
    setFiled('');
    setFiling(true);

    const tool_request: ToolRequestSubmission = {
      ...(agentId ? { agent_id: agentId } : {}),
      tool_name: form.tool_name.trim(),
      purpose: form.purpose.trim(),
      // Lists are ALWAYS sent, including empty ones. The contract reads an absent list as
      // `*_undeclared` and an empty one as a real answer, so omitting them would turn "this tool
      // reads nothing" into "you did not say what it reads".
      reads: cleanList(form.reads),
      produces: cleanList(form.produces),
      read_datasets: cleanList(form.read_datasets),
      touches: cleanList(form.touches),
      inputs: cleanList(form.inputs),
      capability_id: form.capability_id.trim(),
      task_unblocked: form.task_unblocked.trim(),
      task_key: form.task_key.trim().toLowerCase(),
      manual_today: form.manual_today.trim(),
      acts_on_output: form.acts_on_output.trim(),
      judged_threshold: form.judged_threshold.trim(),
      judged_measured_from: form.judged_measured_from.trim(),
      missing_from_product: form.missing_from_product.trim(),
      needed_by: form.needed_by.trim(),
      // The enums are sent only when chosen. The schema is `.strict()` and typed, so an empty
      // string would be a shape error reported as `invalid_enum_value`, where leaving the key out
      // lets the contract answer `*_missing` and name the field instead.
      ...(form.tried_in_product
        ? { tried_in_product: form.tried_in_product as ToolRequestSubmission['tried_in_product'] }
        : {}),
      ...(form.run_frequency
        ? { run_frequency: form.run_frequency as ToolRequestSubmission['run_frequency'] }
        : {}),
      ...(form.environment
        ? { environment: form.environment as ToolRequestSubmission['environment'] }
        : {}),
      ...(form.writes === null ? {} : { writes: form.writes }),
      /**
       * The three write-only fields are sent ONLY on a writing tool, and OMITTED otherwise.
       *
       * Omitted, not null. These are `.optional()` in `agentToolRequestSchema.ts` and NOT
       * `.nullable()`, so an explicit `null` is a shape error. The first version of this form sent
       * nulls, reasoning from `ToolRequestDetailInput`, whose TypeScript type does allow
       * `string | null`: that type describes what the CONTRACT reads, while the Zod schema
       * describes what the WIRE accepts, and they differ here. Every read-only tool request would
       * have been refused with a Zod error about a field the builder was never shown.
       *
       * Omitting them is also all that is needed, because `acceptToolRequest` already stores the
       * nulls itself: `side_effects: writes ? text(d.side_effects) : null`.
       *
       * `agentToolRequestSchema.formPayload.test.ts` pins both directions.
       */
      ...(form.writes === true
        ? {
          side_effects: form.side_effects.trim(),
          ...(form.reversible === null ? {} : { reversible: form.reversible }),
          // Omitted when blank: the note is optional even on a writing tool, and an empty string
          // would be stored as an answer rather than left absent.
          ...(form.reversibility_note.trim()
            ? { reversibility_note: form.reversibility_note.trim() }
            : {}),
        }
        : {}),
    };

    try {
      const created = await fileChangeRequest({
        domain_key: domainKey,
        title: form.title.trim(),
        kind: 'tool',
        tool_request,
        // AF11.13 — the drafted case travels with the request, so it arrives finished. Absent
        // when nothing was drafted, which files exactly as before.
        ...(draftedPackage ? { decision_package: draftedPackage } : {}),
      });
      setForm(EMPTY);
      setDraftedPackage(null);
      setFiled(draftedPackage
        ? 'Filed, with its case attached. Nothing is built yet: somebody will read it and decide. '
          + 'The simulated run is still blank, so it is not in front of anyone until that is done.'
        : 'Filed. Nothing is built yet: somebody will read it and decide.');
      onFiled(created);
    } catch (err) {
      // The form is NOT cleared. See the header.
      const named = toolRequestIssues(err);
      setIssues(named);
      // The top-level sentence is shown only when there are no named issues to show instead, so a
      // refusal does not read as both a field problem and a general failure.
      if (named.length === 0) {
        setProblem(errorMessage(err, 'Could not file that request.'));
      }
    } finally {
      setFiling(false);
    }
  }

  const groups = Object.fromEntries(FORM_GROUPS.map((g) => [g.key, g])) as Record<
    string,
    { key: string; heading: string; question: string }
  >;

  return (
    <form onSubmit={onSubmit} data-testid="tool-request-form">
      <p className="text-muted small">
        This is the scope sheet. It asks more than a change request does because approving it lets
        an agent act on real systems. Nothing is built by filing it.
      </p>

      {/*
        AF11.12 — the drafter.
        Above the fields rather than beside the submit button, because its job is to save somebody
        the blank page, and a control that does that is useless once they have filled it in.
      */}
      <div className="border rounded p-3 mb-4 bg-light" data-testid="tool-request-drafter">
        <div className="fw-semibold small mb-1">Let the AI write the first draft</div>
        <div className="form-text mb-2">
          Say what you want the tool to do and it fills this in. Read it, change what is wrong,
          then file it. You are not expected to come up with every field yourself.
        </div>
        <div className="d-flex gap-2 flex-wrap align-items-start">
          <input
            className="form-control form-control-sm"
            style={{ maxWidth: 420 }}
            id="tr-intent"
            aria-label="What do you want the tool to do"
            placeholder="e.g. scan last week's calls and tell me which ones went badly"
            value={intent}
            maxLength={2000}
            disabled={drafting !== ''}
            onChange={(e) => setIntent(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid="draft-from-intent"
            disabled={drafting !== '' || intent.trim().length === 0}
            onClick={() => onDraft('from_intent')}
          >
            {drafting === 'from_intent' ? 'Drafting…' : 'Draft this for me'}
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            data-testid="draft-suggest"
            disabled={drafting !== ''}
            onClick={() => onDraft('suggest')}
          >
            {drafting === 'suggest' ? 'Thinking…' : 'Suggest one for me'}
          </button>
        </div>

        {draftProblem && (
          <div className="alert alert-warning small mt-2 mb-0" role="alert" data-testid="draft-problem">
            {draftProblem}
          </div>
        )}
        {draftNote && (
          <div className="form-text mt-2" data-testid="draft-note">{draftNote}</div>
        )}
        {/*
          What it was able to write against. Shown because a blank `acts_on_output` after a draft
          has two very different causes, and the builder can only act on one of them.
        */}
        {draftedPackage && (
          <div className="form-text mt-2" data-testid="draft-package">
            It also wrote the case for deciding this: the summary, the problem, the options and
            the recommendation. That goes with the request when you file it. The simulated run is
            left blank on purpose, because somebody has to actually run it.
          </div>
        )}
        {grounding && (
          <div className="form-text mt-1" data-testid="draft-grounding">
            Written against {grounding.capabilities} capabilities, {grounding.datasets} datasets
            {grounding.actor_roster_absent
              ? ', and no people list, so it left the person who acts on the output blank.'
              : ` and ${grounding.actors} people.`}
          </div>
        )}
      </div>

      {/* Unmapped refusals, and the ones about the request rather than a field. */}
      {byField.__form && byField.__form.length > 0 && (
        <div className="alert alert-danger small" role="alert">
          {byField.__form.map((i) => (
            <div key={i.rule + i.detail} data-testid={`issue-${i.rule}`}>{i.detail}</div>
          ))}
        </div>
      )}

      {/* THE ROUTES. Not errors: nothing typed is wrong, the ask is just the wrong one. */}
      {grouped.routes.map((r) => (
        <div
          className="border border-2 rounded p-3 mb-3"
          style={{ borderColor: 'var(--color-primary)' }}
          key={r.rule}
          data-testid={`route-${r.rule}`}
        >
          <div className="fw-semibold mb-1">{r.heading}</div>
          <div className="small">{r.next}</div>
          <div className="form-text mt-2">{r.detail}</div>
        </div>
      ))}

      {problem && <div className="alert alert-danger small" role="alert">{problem}</div>}
      {filed && <div className="alert alert-success small" role="alert">{filed}</div>}

      <div className="mb-4">
        <label className="form-label small fw-medium" htmlFor="tr-title">
          In one line, what is this tool
        </label>
        <input
          id="tr-title"
          className="form-control form-control-sm"
          maxLength={CHANGE_REQUEST_TITLE_MAX}
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
        />
        <div className="form-text">{`${form.title.length} of ${CHANGE_REQUEST_TITLE_MAX}`}</div>
      </div>

      {/* WORTH BUILDING, first, because it decides the request before the blast radius matters. */}
      <Group group={groups.worth_building}>
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-acts-on-output">
            Who reads what this produces, and acts on it
          </label>
          <input
            id="tr-acts-on-output"
            className="form-control form-control-sm"
            style={{ maxWidth: 420 }}
            maxLength={TOOL_ACTOR_MAX}
            list="tr-actor-list"
            value={form.acts_on_output}
            placeholder="their work email"
            onChange={(e) => set('acts_on_output', e.target.value)}
          />
          <datalist id="tr-actor-list">
            {actors.map((a) => <option key={a} value={a} />)}
          </datalist>
          <div className="form-text">
            One person, not a team and not a role. If nobody is waiting for this output, that is
            worth knowing before it is built.
          </div>
          {rosterAbsent && (
            <div className="form-text text-warning">
              We could not read the people record, so there are no suggestions here. You can still
              type an address; it is checked when you file.
            </div>
          )}
          <FieldIssues issues={byField.acts_on_output} />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-judged-threshold">
            What number decides whether it worked
          </label>
          <input
            id="tr-judged-threshold"
            className="form-control form-control-sm"
            maxLength={TOOL_NARRATIVE_MAX}
            value={form.judged_threshold}
            placeholder="for example, 8 of 10 drafts need no edit"
            onChange={(e) => set('judged_threshold', e.target.value)}
          />
          <div className="form-text">
            This has to contain an actual number. &quot;Better drafts&quot; cannot be checked later.
          </div>
          <FieldIssues issues={byField.judged_threshold} />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-judged-measured-from">
            What we already record that would produce that number
          </label>
          <textarea
            id="tr-judged-measured-from"
            className="form-control form-control-sm"
            rows={2}
            maxLength={TOOL_NARRATIVE_MAX}
            value={form.judged_measured_from}
            onChange={(e) => set('judged_measured_from', e.target.value)}
          />
          <FieldIssues issues={byField.judged_measured_from} />
        </div>

        <div className="mb-3">
          <span className="form-label small fw-medium d-block">
            Have you done this in the app by hand?
          </span>
          {TOOL_PRODUCT_STATES.map((state) => (
            <div className="form-check" key={state}>
              <input
                className="form-check-input"
                type="radio"
                name="tried_in_product"
                id={`tr-tried-${state}`}
                checked={form.tried_in_product === state}
                onChange={() => set('tried_in_product', state)}
              />
              <label className="form-check-label small" htmlFor={`tr-tried-${state}`}>
                {PRODUCT_STATE_WORDS[state]}
              </label>
            </div>
          ))}
          <FieldIssues issues={byField.tried_in_product} />

          {/* PRE-EMPT THE ROUTE rather than spend a submit on it. The gate refuses both of these
              answers by name, so saying so here saves a round trip and, more to the point, tells
              the builder the shorter request exists. */}
          {(form.tried_in_product === 'used_by_hand' || form.tried_in_product === 'exists_unused') && (
            <div className="alert alert-warning small mt-2 mb-0" role="alert">
              {form.tried_in_product === 'used_by_hand'
                ? 'Then this is a grant, not a build: the thing exists and your agent has not been '
                  + 'given it. Ask for the grant instead. It is a much shorter request.'
                : 'Then go and use it first, and confirm it does what you need. If it turns out it '
                  + 'cannot, come back and say what was missing.'}
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-missing-from-product">
            What the app cannot do today
          </label>
          <textarea
            id="tr-missing-from-product"
            className="form-control form-control-sm"
            rows={2}
            maxLength={TOOL_NARRATIVE_MAX}
            value={form.missing_from_product}
            onChange={(e) => set('missing_from_product', e.target.value)}
          />
          <FieldIssues issues={byField.missing_from_product} />
        </div>
      </Group>

      <Group group={groups.who}>
        <div className="mb-3">
          <span className="form-label small fw-medium d-block">The agent that would hold it</span>
          {agentId ? (
            <div className="small">
              <strong>{agentDisplayName || 'This domain’s agent'}</strong>
              <div className="text-muted"><code className="small">{agentId}</code></div>
              <div className="form-text">
                Your domain has one agent, so there is nothing to choose here.
              </div>
            </div>
          ) : (
            // A domain with no agent is a real state, and the gate refuses it by name. Saying so
            // here stops somebody filling in twenty-three fields first.
            <div className="alert alert-warning small mb-0" role="alert">
              This domain has no agent on record yet, so there is nothing to hold the tool. Ask Kes
              to provision one, then come back. Filing now would be refused for this reason.
            </div>
          )}
          <FieldIssues issues={byField.agent_id} />
        </div>
      </Group>

      <Group group={groups.what}>
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-tool-name">Tool name</label>
          <input
            id="tr-tool-name"
            className="form-control form-control-sm"
            style={{ maxWidth: 420 }}
            maxLength={TOOL_NAME_MAX}
            value={form.tool_name}
            placeholder="read_cron_registry"
            onChange={(e) => set('tool_name', e.target.value)}
          />
          <div className="form-text">
            One tool per request. A name joining two things with &quot;and&quot; is refused, because
            two capabilities approved as one cannot be granted separately later.
          </div>
          <FieldIssues issues={byField.tool_name} />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-purpose">What it is for</label>
          <textarea
            id="tr-purpose"
            className="form-control form-control-sm"
            rows={3}
            maxLength={TOOL_PURPOSE_MAX}
            value={form.purpose}
            onChange={(e) => set('purpose', e.target.value)}
          />
          <FieldIssues issues={byField.purpose} />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-reads">What it reads</label>
          <ListField
            id="tr-reads"
            values={form.reads}
            onChange={(v) => set('reads', v)}
            placeholder="the cron registry table"
          />
          <div className="form-text">
            In words. The specific database tables go under Which data, further down.
          </div>
          <FieldIssues issues={byField.reads} />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-produces">What it produces</label>
          <ListField
            id="tr-produces"
            values={form.produces}
            onChange={(v) => set('produces', v)}
            placeholder="a list of scheduled jobs"
          />
          <FieldIssues issues={byField.produces} />
        </div>
      </Group>

      <Group group={groups.what_for}>
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-capability">
            The capability it serves
          </label>
          <select
            id="tr-capability"
            className="form-select form-select-sm"
            value={form.capability_id}
            onChange={(e) => set('capability_id', e.target.value)}
          >
            <option value="">Choose a capability…</option>
            {capabilities.map((c) => (
              <option key={c.capability_id} value={c.capability_id}>
                {`${c.capability_id} (${c.name})`}
              </option>
            ))}
          </select>
          {capabilityProblem ? (
            <div className="form-text text-warning">
              {`${capabilityProblem} This list is missing rather than empty, so do not work around `
                + 'it: the id is checked when you file.'}
            </div>
          ) : (
            <div className="form-text">
              {capabilityTotal > capabilities.length
                ? `Showing ${capabilities.length} of ${capabilityTotal} in this domain.`
                : `${capabilities.length} in this domain.`}
            </div>
          )}
          <FieldIssues issues={byField.capability_id} />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-task-unblocked">
            What work this unblocks
          </label>
          <textarea
            id="tr-task-unblocked"
            className="form-control form-control-sm"
            rows={2}
            maxLength={TOOL_NARRATIVE_MAX}
            value={form.task_unblocked}
            onChange={(e) => set('task_unblocked', e.target.value)}
          />
          <FieldIssues issues={byField.task_unblocked} />
        </div>

        {/* AF12.1 — THE TASK KEY.
            Ali, 17 Nov 2026: *"I think we need to do a better job of differentiating between a
            task and a tool. They can be the same, but they can also be different and you have a
            task that uses multiple tools."*

            This field is the whole mechanism for that distinction. Without it the console can
            only ever show one request at a time, so deciding tool 2 of 3 happens with the other
            two invisible. The help text teaches the difference by asking for it, which is the
            only place a builder reliably reads an explanation. */}
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-task-key">
            Task key
          </label>
          <input
            id="tr-task-key"
            className="form-control form-control-sm"
            style={{ maxWidth: 360 }}
            maxLength={48}
            value={form.task_key}
            placeholder="weekly_unpaid_explorer_report"
            onChange={(e) => set('task_key', e.target.value)}
          />
          <div className="form-text">
            A short name for the PIECE OF WORK, lowercase with underscores. If this task needs
            more than one tool, give every one of those requests the same key: that is what lets
            them be decided together instead of one at a time with the others invisible. A task
            that needs exactly one tool still gets a key.
          </div>
          <FieldIssues issues={byField.task_key} />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-manual-today">
            How it is done today, by hand
          </label>
          <textarea
            id="tr-manual-today"
            className="form-control form-control-sm"
            rows={2}
            maxLength={TOOL_NARRATIVE_MAX}
            value={form.manual_today}
            onChange={(e) => set('manual_today', e.target.value)}
          />
          <FieldIssues issues={byField.manual_today} />
        </div>
      </Group>

      <Group group={groups.when}>
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-needed-by">Needed by</label>
          <input
            id="tr-needed-by"
            type="date"
            className="form-control form-control-sm"
            style={{ maxWidth: 220 }}
            value={form.needed_by}
            onChange={(e) => set('needed_by', e.target.value)}
          />
          <FieldIssues issues={byField.needed_by} />
        </div>

        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-run-frequency">
            How often it would run
          </label>
          <select
            id="tr-run-frequency"
            className="form-select form-select-sm"
            style={{ maxWidth: 320 }}
            value={form.run_frequency}
            onChange={(e) => set('run_frequency', e.target.value)}
          >
            <option value="">Choose…</option>
            {TOOL_RUN_FREQUENCIES.map((f) => (
              <option key={f} value={f}>{RUN_FREQUENCY_WORDS[f]}</option>
            ))}
          </select>
          <FieldIssues issues={byField.run_frequency} />
        </div>
      </Group>

      <Group group={groups.where}>
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-touches">
            Every system it would touch
          </label>
          <ListField
            id="tr-touches"
            values={form.touches}
            onChange={(v) => set('touches', v)}
            placeholder="one system per row"
          />
          <div className="form-text">
            One per row. This is the field being approved, so an approver counting these is counting
            what you listed.
          </div>
          <FieldIssues issues={byField.touches} />
        </div>
      </Group>

      <Group group={groups.which_data}>
        <div className="mb-3">
          <span className="form-label small fw-medium d-block">Where it runs</span>
          {TOOL_ENVIRONMENTS.map((env) => (
            <div className="form-check form-check-inline" key={env}>
              <input
                className="form-check-input"
                type="radio"
                name="environment"
                id={`tr-env-${env}`}
                checked={form.environment === env}
                onChange={() => set('environment', env)}
              />
              <label className="form-check-label small" htmlFor={`tr-env-${env}`}>{env}</label>
            </div>
          ))}
          <div className="form-text">
            A sandbox grant is wide on purpose. A production grant is narrowed to the datasets you
            name below, so a production tool has to name them.
          </div>
          <FieldIssues issues={byField.environment} />
        </div>

        <div className="mb-3">
          <span className="form-label small fw-medium d-block">
            Which datasets it reads
            {form.environment === 'production' && (
              <span className="badge bg-warning text-dark ms-2">required in production</span>
            )}
          </span>
          <DatasetPicker
            selected={form.read_datasets}
            onChange={(v) => set('read_datasets', v)}
          />
          <div className="form-text">
            Leave this empty if the tool reads no database. Say what it reads under What, and the
            systems under Where.
          </div>
          <FieldIssues issues={byField.read_datasets} />
        </div>
      </Group>

      <Group group={groups.how}>
        <div className="mb-3">
          <label className="form-label small fw-medium" htmlFor="tr-inputs">
            What it needs as input
          </label>
          <ListField
            id="tr-inputs"
            values={form.inputs}
            onChange={(v) => set('inputs', v)}
            placeholder="a community id"
          />
          <FieldIssues issues={byField.inputs} />
        </div>

        <div className="mb-3">
          <span className="form-label small fw-medium d-block">Does it write anything?</span>
          <div className="form-check form-check-inline">
            <input
              className="form-check-input"
              type="radio"
              name="writes"
              id="tr-writes-yes"
              checked={form.writes === true}
              onChange={() => set('writes', true)}
            />
            <label className="form-check-label small" htmlFor="tr-writes-yes">
              Yes, it writes
            </label>
          </div>
          <div className="form-check form-check-inline">
            <input
              className="form-check-input"
              type="radio"
              name="writes"
              id="tr-writes-no"
              checked={form.writes === false}
              onChange={() => set('writes', false)}
            />
            <label className="form-check-label small" htmlFor="tr-writes-no">
              No, it only reads
            </label>
          </div>
          <div className="form-text">
            Reading and writing are different grants. Leaving this blank is not an answer.
          </div>
          <FieldIssues issues={byField.writes} />
        </div>

        {/* Only a writing tool is asked these. The contract wants them null otherwise, and asking
            about side effects a read tool does not have would collect an answer nobody can use. */}
        {form.writes === true && (
          <>
            <div className="mb-3">
              <label className="form-label small fw-medium" htmlFor="tr-side-effects">
                What it changes
              </label>
              <textarea
                id="tr-side-effects"
                className="form-control form-control-sm"
                rows={3}
                maxLength={TOOL_SIDE_EFFECTS_MAX}
                value={form.side_effects}
                onChange={(e) => set('side_effects', e.target.value)}
              />
              <FieldIssues issues={byField.side_effects} />
            </div>

            <div className="mb-3">
              <span className="form-label small fw-medium d-block">Can the change be undone?</span>
              <div className="form-check form-check-inline">
                <input
                  className="form-check-input"
                  type="radio"
                  name="reversible"
                  id="tr-reversible-yes"
                  checked={form.reversible === true}
                  onChange={() => set('reversible', true)}
                />
                <label className="form-check-label small" htmlFor="tr-reversible-yes">Yes</label>
              </div>
              <div className="form-check form-check-inline">
                <input
                  className="form-check-input"
                  type="radio"
                  name="reversible"
                  id="tr-reversible-no"
                  checked={form.reversible === false}
                  onChange={() => set('reversible', false)}
                />
                <label className="form-check-label small" htmlFor="tr-reversible-no">No</label>
              </div>
              <FieldIssues issues={byField.reversible} />
            </div>

            <div className="mb-3">
              <label className="form-label small fw-medium" htmlFor="tr-reversibility-note">
                How it would be undone, or why it cannot be
              </label>
              <textarea
                id="tr-reversibility-note"
                className="form-control form-control-sm"
                rows={2}
                maxLength={TOOL_NARRATIVE_MAX}
                value={form.reversibility_note}
                onChange={(e) => set('reversibility_note', e.target.value)}
              />
              <FieldIssues issues={byField.reversibility_note} />
            </div>
          </>
        )}
      </Group>

      <button className="btn btn-primary btn-sm" type="submit" disabled={filing}>
        {filing ? 'Filing…' : 'File this tool request'}
      </button>
      <div className="form-text">
        Filing records the request. It does not start a build, and it does not grant anything.
      </div>
    </form>
  );
}
