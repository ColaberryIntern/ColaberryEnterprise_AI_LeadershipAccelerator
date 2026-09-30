import React, { useEffect, useRef, useState } from 'react';
import api from '../../../utils/api';
import { useToast } from '../../ui/ToastProvider';
import { MERGE_TAGS, resolveMergeTagsClient, hasUnresolvedMergeTags, insertAtCursor } from '../../../utils/kbMergeTags';

interface KbCourse { id: string; name: string; slug: string; is_active: boolean; }
interface KbCohort {
  id: string; course_id: string; name: string; cohort_number: number;
  open_house_date: string | null; open_house_url: string | null; start_date: string | null; end_date: string | null;
  expo_date: string | null; price_annual: number | null; price_monthly: number | null;
  seats_total: number | null; seats_remaining: number | null;
  enrollment_url: string | null; waitlist_url: string | null; is_active: boolean;
}
interface Person { id: string; name: string; }
interface KbEntry {
  id: string; course_id: string | null; main_category: string; sub_category: string | null;
  question_pattern: string; answer_template: string; primary_person_id: string | null;
  team_person_ids: string[]; priority: 'High' | 'Medium' | 'Low'; response_time: string | null;
  automation_potential: 'High' | 'Medium' | 'Low'; emotional_tone: string | null;
  calendar_link: string | null; email_examples: string | null; escalation_logic: string | null;
  keywords: string | null; notes: string | null; is_active: boolean;
}

interface Props {
  entry: KbEntry | null;
  courses: KbCourse[];
  cohorts: KbCohort[];
  persons: Person[];
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  course_id: string; main_category: string; sub_category: string; question_pattern: string; answer_template: string;
  primary_person_id: string; team_person_ids: string[]; escalation_logic: string; priority: 'High' | 'Medium' | 'Low';
  response_time: string; automation_potential: 'High' | 'Medium' | 'Low'; emotional_tone: string; calendar_link: string;
  email_examples: string; keywords: string; notes: string; is_active: boolean;
}

const EMPTY_FORM: FormState = {
  course_id: '', main_category: '', sub_category: '', question_pattern: '', answer_template: '',
  primary_person_id: '', team_person_ids: [], escalation_logic: '', priority: 'Medium',
  response_time: '', automation_potential: 'Medium', emotional_tone: '', calendar_link: '',
  email_examples: '', keywords: '', notes: '', is_active: true,
};

const EntryEditModal: React.FC<Props> = ({ entry, courses, cohorts, persons, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [showTagRef, setShowTagRef] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setForm(entry ? {
      course_id: entry.course_id ?? '',
      main_category: entry.main_category,
      sub_category: entry.sub_category ?? '',
      question_pattern: entry.question_pattern,
      answer_template: entry.answer_template,
      primary_person_id: entry.primary_person_id ?? '',
      team_person_ids: entry.team_person_ids ?? [],
      escalation_logic: entry.escalation_logic ?? '',
      priority: entry.priority,
      response_time: entry.response_time ?? '',
      automation_potential: entry.automation_potential,
      emotional_tone: entry.emotional_tone ?? '',
      calendar_link: entry.calendar_link ?? '',
      email_examples: entry.email_examples ?? '',
      keywords: entry.keywords ?? '',
      notes: entry.notes ?? '',
      is_active: entry.is_active,
    } : EMPTY_FORM);
  }, [entry]);

  const course = courses.find((c) => c.id === form.course_id) ?? null;
  const activeCohort = cohorts.find((c) => c.course_id === form.course_id && c.is_active) ?? null;
  const resolvedPreview = resolveMergeTagsClient(form.answer_template, activeCohort, course);
  const unresolvedInPreview = hasUnresolvedMergeTags(resolvedPreview);

  const insertTag = (tag: string) => {
    const next = insertAtCursor(textareaRef.current, form.answer_template, tag);
    setForm((f) => ({ ...f, answer_template: next }));
  };

  const canSave = form.main_category.trim() && form.question_pattern.trim() && form.answer_template.trim();

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        course_id: form.course_id || null,
        main_category: form.main_category,
        sub_category: form.sub_category || undefined,
        question_pattern: form.question_pattern,
        answer_template: form.answer_template,
        primary_person_id: form.primary_person_id || null,
        team_person_ids: form.team_person_ids,
        escalation_logic: form.escalation_logic || undefined,
        priority: form.priority,
        response_time: form.response_time || undefined,
        automation_potential: form.automation_potential,
        emotional_tone: form.emotional_tone || undefined,
        calendar_link: form.calendar_link || undefined,
        email_examples: form.email_examples || undefined,
        keywords: form.keywords || undefined,
        notes: form.notes || undefined,
        is_active: form.is_active,
      };
      if (entry) {
        await api.put(`/api/admin/kb/entries/${entry.id}`, payload);
        showToast('Entry updated.', 'success');
      } else {
        await api.post('/api/admin/kb/entries', payload);
        showToast('Entry created.', 'success');
      }
      onSaved();
      onClose();
    } catch {
      showToast('Failed to save entry.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-backdrop show" />
      <div className="modal show d-block" role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{entry ? 'Edit KB Entry' : 'Add KB Entry'}</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">
              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Course</label>
                  <select className="form-select form-select-sm" value={form.course_id}
                    onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
                    <option value="">All courses (global)</option>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Main Category</label>
                  <input type="text" className="form-control form-control-sm" value={form.main_category}
                    onChange={(e) => setForm({ ...form, main_category: e.target.value })} placeholder="Pricing & Enrollment" />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Sub Category</label>
                  <input type="text" className="form-control form-control-sm" value={form.sub_category}
                    onChange={(e) => setForm({ ...form, sub_category: e.target.value })} placeholder="Pricing" />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Question Pattern</label>
                <input type="text" className="form-control form-control-sm" value={form.question_pattern}
                  onChange={(e) => setForm({ ...form, question_pattern: e.target.value })}
                  placeholder="How much does the program cost?" />
              </div>

              <div className="mb-2">
                <div className="d-flex justify-content-between align-items-center">
                  <label className="form-label small fw-medium mb-0">Answer Template</label>
                  <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setShowTagRef((v) => !v)}>
                    {showTagRef ? 'Hide' : 'Show'} Merge Tag Reference
                  </button>
                </div>
                <textarea ref={textareaRef} className="form-control form-control-sm" rows={4}
                  value={form.answer_template}
                  onChange={(e) => setForm({ ...form, answer_template: e.target.value })}
                  placeholder="Use {{cohort.X}} / {{course.X}} merge tags..." />
              </div>

              {showTagRef && (
                <div className="border rounded p-2 mb-3 bg-light-subtle" style={{ maxHeight: 180, overflowY: 'auto' }}>
                  <div className="small text-muted mb-1">Click a tag to insert it at the cursor:</div>
                  <div className="d-flex flex-wrap gap-1">
                    {MERGE_TAGS.map((mt) => (
                      <button key={mt.tag} type="button" className="btn btn-outline-secondary btn-sm py-0 px-2"
                        style={{ fontSize: '0.7rem' }} title={mt.label} onClick={() => insertTag(mt.tag)}>
                        {mt.tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="border rounded p-2 mb-3 bg-light-subtle">
                <div className="small text-muted mb-1 d-flex justify-content-between">
                  <span>Live preview (resolved against active cohort)</span>
                  {unresolvedInPreview && <span className="badge bg-warning text-dark">Unresolved tags</span>}
                </div>
                <div className="small" style={{ whiteSpace: 'pre-wrap' }}>{resolvedPreview || <em className="text-muted">Nothing to preview yet.</em>}</div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Primary Person</label>
                  <select className="form-select form-select-sm" value={form.primary_person_id}
                    onChange={(e) => setForm({ ...form, primary_person_id: e.target.value })}>
                    <option value="">None</option>
                    {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Team Members (handlers)</label>
                  <select multiple className="form-select form-select-sm" size={3} value={form.team_person_ids}
                    onChange={(e) => setForm({ ...form, team_person_ids: Array.from(e.target.selectedOptions, (o) => o.value) })}>
                    {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Priority</label>
                  <select className="form-select form-select-sm" value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as FormState['priority'] })}>
                    <option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Response Time</label>
                  <input type="text" className="form-control form-control-sm" value={form.response_time}
                    onChange={(e) => setForm({ ...form, response_time: e.target.value })} placeholder="< 2 hours" />
                </div>
                <div className="col-md-4">
                  <label className="form-label small fw-medium">Automation Potential</label>
                  <select className="form-select form-select-sm" value={form.automation_potential}
                    onChange={(e) => setForm({ ...form, automation_potential: e.target.value as FormState['automation_potential'] })}>
                    <option value="High">High</option><option value="Medium">Medium</option><option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Emotional Tone</label>
                  <input type="text" className="form-control form-control-sm" value={form.emotional_tone}
                    onChange={(e) => setForm({ ...form, emotional_tone: e.target.value })} placeholder="Informational" />
                </div>
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Calendar Link (override)</label>
                  <input type="text" className="form-control form-control-sm" value={form.calendar_link}
                    onChange={(e) => setForm({ ...form, calendar_link: e.target.value })} placeholder="Falls back to primary person's link" />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Escalation Logic</label>
                <input type="text" className="form-control form-control-sm" value={form.escalation_logic}
                  onChange={(e) => setForm({ ...form, escalation_logic: e.target.value })} />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Keywords (comma-separated)</label>
                <input type="text" className="form-control form-control-sm" value={form.keywords}
                  onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="price, cost, how much" />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Real Email Examples</label>
                <textarea className="form-control form-control-sm" rows={2} value={form.email_examples}
                  onChange={(e) => setForm({ ...form, email_examples: e.target.value })} />
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Notes (internal only)</label>
                <textarea className="form-control form-control-sm" rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" role="switch" id="entryIsActive"
                  checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                <label className="form-check-label small" htmlFor="entryIsActive">Active (visible to Cora + Synthflow)</label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={saving || !canSave} onClick={handleSubmit}>
                {saving ? 'Saving…' : entry ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default EntryEditModal;
