import React from 'react';
import type { HubCohort, HubEventType } from '../../../../services/commsHubApi';
import type { EventFormState, FormErrors } from './eventForm';
import { TYPE_LABEL } from './eventDisplay';

/**
 * The event form's fields (design 02, CH3.2), in four sections. Every input has a visible label; an
 * error is tied to its input with aria-describedby and aria-invalid, so a screen reader hears what to fix.
 */
type Change = (patch: Partial<EventFormState>) => void;
export interface DescribeControls { busy: boolean; error: string | null; canUndo: boolean; run: () => void; undo: () => void }
interface Props { form: EventFormState; errors: FormErrors; cohorts: HubCohort[]; onChange: Change; describe: DescribeControls }
interface Section { form: EventFormState; errors: FormErrors; onChange: Change }

function err(errors: FormErrors, key: keyof FormErrors): { 'aria-invalid'?: boolean; 'aria-describedby'?: string } {
  return errors[key] ? { 'aria-invalid': true, 'aria-describedby': `ch-err-${String(key)}` } : {};
}
function Err({ errors, k }: { errors: FormErrors; k: keyof FormErrors }): React.ReactElement | null {
  return errors[k] ? <div id={`ch-err-${String(k)}`} className="invalid-feedback d-block">{errors[k]}</div> : null;
}

const TYPES: HubEventType[] = ['session', 'open_house', 'office_hours', 'workshop', 'other'];

function Basics({ form, errors, onChange, cohorts }: Section & { cohorts: HubCohort[] }): React.ReactElement {
  return (
    <>
      <div className="col-12 col-md-8">
        <label className="form-label" htmlFor="ch-title">Title</label>
        <input id="ch-title" className="form-control" value={form.title} maxLength={255} onChange={(e) => onChange({ title: e.target.value })} {...err(errors, 'title')} />
        <Err errors={errors} k="title" />
      </div>
      <div className="col-12 col-md-4">
        <label className="form-label" htmlFor="ch-type">Type</label>
        <select id="ch-type" className="form-select" value={form.event_type} onChange={(e) => onChange({ event_type: e.target.value as HubEventType })}>
          {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      <fieldset className="col-12">
        <legend className="form-label fs-6">Who it is for</legend>
        <div className="form-check">
          <input className="form-check-input" type="radio" name="ch-aud" id="ch-aud-all" checked={form.audienceKind === 'all_members'} onChange={() => onChange({ audienceKind: 'all_members' })} />
          <label className="form-check-label" htmlFor="ch-aud-all">All open cohorts</label>
        </div>
        <div className="form-check">
          <input className="form-check-input" type="radio" name="ch-aud" id="ch-aud-some" checked={form.audienceKind === 'cohorts'} onChange={() => onChange({ audienceKind: 'cohorts' })} />
          <label className="form-check-label" htmlFor="ch-aud-some">Chosen cohorts</label>
        </div>
        {form.audienceKind === 'cohorts' && (
          <div className="mt-2">
            <label className="form-label" htmlFor="ch-cohorts">Cohorts</label>
            <select id="ch-cohorts" className="form-select" multiple size={Math.min(6, Math.max(3, cohorts.length))} value={form.cohort_ids}
              onChange={(e) => onChange({ cohort_ids: Array.from(e.target.selectedOptions).map((o) => o.value) })} {...err(errors, 'cohort_ids')}>
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.status === 'open' ? '' : ` (${c.status})`}</option>)}
            </select>
            <Err errors={errors} k="cohort_ids" />
          </div>
        )}
      </fieldset>
    </>
  );
}

function When({ form, errors, onChange }: Section): React.ReactElement {
  const field = (id: string, label: string, key: 'date' | 'start_time' | 'end_time' | 'repeat_until', type: 'date' | 'time', cls: string): React.ReactElement => (
    <div className={cls}>
      <label className="form-label" htmlFor={id}>{label}</label>
      <input id={id} type={type} className="form-control" value={form[key]} onChange={(e) => onChange({ [key]: e.target.value })} {...err(errors, key)} />
      <Err errors={errors} k={key} />
    </div>
  );
  return (
    <>
      {field('ch-date', 'Date', 'date', 'date', 'col-12 col-sm-4')}
      {field('ch-start', 'Start (Central)', 'start_time', 'time', 'col-6 col-sm-4')}
      {field('ch-end', 'End (Central, optional)', 'end_time', 'time', 'col-6 col-sm-4')}
      <div className="col-12 col-sm-6">
        <label className="form-label" htmlFor="ch-repeat">Repeats</label>
        <select id="ch-repeat" className="form-select" value={form.repeat} onChange={(e) => onChange({ repeat: e.target.value as EventFormState['repeat'] })}>
          <option value="none">Does not repeat</option>
          <option value="weekly">Every week</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Monthly, same date</option>
        </select>
      </div>
      {form.repeat !== 'none' && field('ch-until', 'Last date', 'repeat_until', 'date', 'col-12 col-sm-6')}
    </>
  );
}

function LinksAndHosts({ form, errors, onChange }: Section): React.ReactElement {
  const setHost = (i: number, patch: { name?: string; role?: string }): void => onChange({ hosts: form.hosts.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  const link = (id: string, label: string, key: 'join_url' | 'registration_url'): React.ReactElement => (
    <div className="col-12 col-md-6">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input id={id} type="url" className="form-control" value={form[key]} onChange={(e) => onChange({ [key]: e.target.value })} {...err(errors, key)} />
      <Err errors={errors} k={key} />
    </div>
  );
  return (
    <>
      {link('ch-join', 'Join link (Zoom)', 'join_url')}
      {link('ch-reg', 'Registration link (optional, for example Eventbrite)', 'registration_url')}
      <fieldset className="col-12">
        <legend className="form-label fs-6">Hosts and speakers</legend>
        {form.hosts.map((h, i) => (
          <div className="d-flex flex-wrap gap-2 mb-2" key={i}>
            <label className="visually-hidden" htmlFor={`ch-host-${i}`}>Host {i + 1} name</label>
            <input id={`ch-host-${i}`} className="form-control w-auto flex-grow-1" placeholder="Name" value={h.name} onChange={(e) => setHost(i, { name: e.target.value })} />
            <label className="visually-hidden" htmlFor={`ch-host-role-${i}`}>Host {i + 1} role</label>
            <input id={`ch-host-role-${i}`} className="form-control w-auto flex-grow-1" placeholder="Role (optional)" value={h.role ?? ''} onChange={(e) => setHost(i, { role: e.target.value })} />
            <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={() => onChange({ hosts: form.hosts.filter((_, j) => j !== i) })}>
              Remove<span className="visually-hidden"> host {i + 1}</span>
            </button>
          </div>
        ))}
        {form.hosts.length < 6 && (
          <button type="button" className="btn btn-sm btn-outline-secondary comms-hub-action" onClick={() => onChange({ hosts: [...form.hosts, { name: '' }] })}>Add a host</button>
        )}
        <Err errors={errors} k="hosts" />
      </fieldset>
    </>
  );
}

function AboutAndPlacement({ form, onChange, describe }: Omit<Section, 'errors'> & { describe: DescribeControls }): React.ReactElement {
  return (
    <>
      <div className="col-12">
        <div className="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-1">
          <label className="form-label mb-0" htmlFor="ch-desc">What it is about</label>
          <div className="d-flex gap-2">
            {describe.canUndo && <button type="button" className="btn btn-sm btn-link comms-hub-action" onClick={describe.undo}>Undo AI text</button>}
            <button type="button" className="btn btn-sm btn-outline-primary comms-hub-action" onClick={describe.run} disabled={describe.busy || !form.title.trim()}>
              <i className="ri-sparkling-line me-1" aria-hidden="true" />{describe.busy ? 'Writing...' : 'Write with AI'}
            </button>
          </div>
        </div>
        <textarea id="ch-desc" className="form-control" rows={4} maxLength={5000} value={form.description} onChange={(e) => onChange({ description: e.target.value })} aria-describedby="ch-desc-help" />
        {describe.error && <div className="text-danger small mt-1" role="alert">{describe.error}</div>}
        <div id="ch-desc-help" className="form-text">The card already shows the date, time and links from the event, so the description does not need them.</div>
      </div>
      <fieldset className="col-12">
        <legend className="form-label fs-6">Where it shows on the platform</legend>
        {([['calendar', 'Community calendar'], ['events_page', 'Member Events page'], ['campus_rail', 'Campus events rail']] as const).map(([k, label]) => (
          <div className="form-check form-check-inline" key={k}>
            <input className="form-check-input" type="checkbox" id={`ch-place-${k}`} checked={form.placement[k]} onChange={(e) => onChange({ placement: { ...form.placement, [k]: e.target.checked } })} />
            <label className="form-check-label" htmlFor={`ch-place-${k}`}>{label}</label>
          </div>
        ))}
      </fieldset>
    </>
  );
}

export default function EventFormFields({ form, errors, cohorts, onChange, describe }: Props): React.ReactElement {
  return (
    <div className="row g-3">
      <Basics form={form} errors={errors} onChange={onChange} cohorts={cohorts} />
      <When form={form} errors={errors} onChange={onChange} />
      <LinksAndHosts form={form} errors={errors} onChange={onChange} />
      <AboutAndPlacement form={form} onChange={onChange} describe={describe} />
    </div>
  );
}
