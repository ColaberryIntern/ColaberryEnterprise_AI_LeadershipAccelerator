import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { useToast } from '../../components/ui/ToastProvider';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import EntryEditModal from '../../components/admin/knowledgeOps/EntryEditModal';
import PersonEditModal from '../../components/admin/knowledgeOps/PersonEditModal';
import CohortEditModal from '../../components/admin/knowledgeOps/CohortEditModal';

// ── Types ────────────────────────────────────────────────────────────────────

interface KbCourse {
  id: string; name: string; slug: string; is_active: boolean;
}
interface KbCohort {
  id: string; course_id: string; name: string; cohort_number: number;
  open_house_date: string | null; open_house_url: string | null; start_date: string | null; end_date: string | null;
  expo_date: string | null; price_annual: number | null; price_monthly: number | null;
  seats_total: number | null; seats_remaining: number | null;
  enrollment_url: string | null; waitlist_url: string | null; is_active: boolean;
}
interface Person {
  id: string; name: string; email: string | null; phone: string | null;
  work_hours: string | null; time_zone: string | null; areas: string[];
  shift_note: string | null; calendar_link: string | null;
}
interface KbEntry {
  id: string; course_id: string | null; main_category: string; sub_category: string | null;
  question_pattern: string; answer_template: string; primary_person_id: string | null;
  team_person_ids: string[]; priority: 'High' | 'Medium' | 'Low'; response_time: string | null;
  automation_potential: 'High' | 'Medium' | 'Low'; emotional_tone: string | null;
  calendar_link: string | null; email_examples: string | null; escalation_logic: string | null;
  keywords: string | null; notes: string | null; is_active: boolean;
}

type TabId = 'entries' | 'persons' | 'cohorts';

const PRIORITY_COLORS: Record<string, string> = {
  High: 'danger', Medium: 'warning', Low: 'secondary',
};

// ── Component ────────────────────────────────────────────────────────────────

const AdminKnowledgeOpsPage: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabId>('entries');

  const [courses, setCourses] = useState<KbCourse[]>([]);
  const [cohorts, setCohorts] = useState<KbCohort[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterCategory, setFilterCategory] = useState('');
  const [filterCourse, setFilterCourse] = useState('');
  const [exporting, setExporting] = useState(false);
  const [forceIncludeUnresolved, setForceIncludeUnresolved] = useState(false);

  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KbEntry | null>(null);
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [cohortModalOpen, setCohortModalOpen] = useState(false);
  const [editingCohort, setEditingCohort] = useState<KbCohort | null>(null);
  const [cohortModalCourseId, setCohortModalCourseId] = useState<string | undefined>(undefined);

  const personMap = React.useMemo(() => new Map(persons.map((p) => [p.id, p])), [persons]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [coursesRes, cohortsRes, personsRes, entriesRes] = await Promise.all([
        api.get('/api/admin/kb/courses'),
        api.get('/api/admin/kb/cohorts'),
        api.get('/api/admin/kb/persons'),
        api.get('/api/admin/kb/entries?active=false'),
      ]);
      setCourses(coursesRes.data.courses ?? []);
      setCohorts(cohortsRes.data.cohorts ?? []);
      setPersons(personsRes.data.persons ?? []);
      setEntries(entriesRes.data.entries ?? []);
    } catch {
      showToast('Failed to load Knowledge Ops data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (filterCourse) params.set('course_id', filterCourse);
      if (forceIncludeUnresolved) params.set('force_include_unresolved', 'true');
      const qs = params.toString();
      const res = await api.get(`/api/admin/kb/export/synthflow${qs ? `?${qs}` : ''}`, { responseType: 'blob' });
      const skipped = res.headers['x-skipped-entries'] ?? '0';
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'synthflow-kb-export.csv'; a.click();
      URL.revokeObjectURL(url);
      if (Number(skipped) > 0) {
        showToast(`Exported. ${skipped} entries skipped (unresolved merge tags).`, 'warning');
      } else {
        showToast('Synthflow CSV exported successfully.', 'success');
      }
    } catch {
      showToast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleActivateCohort = async (cohortId: string) => {
    try {
      await api.post(`/api/admin/kb/cohorts/${cohortId}/activate`);
      showToast('Cohort activated.', 'success');
      loadAll();
    } catch {
      showToast('Failed to activate cohort', 'error');
    }
  };

  const handleDeactivateEntry = async (entryId: string) => {
    try {
      await api.delete(`/api/admin/kb/entries/${entryId}`);
      showToast('Entry deactivated.', 'success');
      loadAll();
    } catch {
      showToast('Failed to deactivate entry', 'error');
    }
  };

  const filteredEntries = entries.filter((e) => {
    if (filterCategory && e.main_category !== filterCategory) return false;
    if (filterCourse && e.course_id !== filterCourse) return false;
    return true;
  });

  const categories = [...new Set(entries.map((e) => e.main_category))].sort();

  if (loading) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: 300 }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-4 py-3">
      <PageHeader
        title="Knowledge Operations"
        subtitle="Single source of truth — KB entries, routing, cohort data, and Synthflow export"
        actions={
          <div className="d-flex align-items-center gap-2">
            <div className="form-check form-switch mb-0">
              <input className="form-check-input" type="checkbox" role="switch" id="forceIncludeUnresolved"
                checked={forceIncludeUnresolved} onChange={(e) => setForceIncludeUnresolved(e.target.checked)} />
              <label className="form-check-label small text-muted" htmlFor="forceIncludeUnresolved">
                Include incomplete (shows [TBD])
              </label>
            </div>
            <button className="btn btn-sm btn-outline-success" onClick={handleExport} disabled={exporting}>
              <i className="bi bi-download me-1" />
              {exporting ? 'Exporting…' : 'Export for Synthflow'}
            </button>
          </div>
        }
      />

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3">
        {(['entries', 'persons', 'cohorts'] as TabId[]).map((tab) => (
          <li key={tab} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'entries' && <><i className="bi bi-journal-text me-1" />KB Entries ({entries.length})</>}
              {tab === 'persons' && <><i className="bi bi-people me-1" />Responsible Persons ({persons.length})</>}
              {tab === 'cohorts' && <><i className="bi bi-calendar3 me-1" />Cohorts</>}
            </button>
          </li>
        ))}
      </ul>

      {/* ── KB ENTRIES TAB ──────────────────────────────────────────────────── */}
      {activeTab === 'entries' && (
        <SectionCard>
          {/* Filters */}
          <div className="d-flex gap-2 mb-3 flex-wrap">
            <select
              className="form-select form-select-sm w-auto"
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
            >
              <option value="">All courses</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              className="form-select form-select-sm w-auto"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            {(filterCourse || filterCategory) && (
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => { setFilterCourse(''); setFilterCategory(''); }}
              >
                Clear
              </button>
            )}
            <span className="ms-auto text-muted small align-self-center">
              {filteredEntries.length} of {entries.length} entries
            </span>
            <button
              className="btn btn-sm btn-primary"
              onClick={() => { setEditingEntry(null); setEntryModalOpen(true); }}
            >
              <i className="bi bi-plus-lg me-1" />Add Entry
            </button>
          </div>

          {/* Table */}
          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle">
              <thead className="table-light">
                <tr>
                  <th>Category</th>
                  <th>Question Pattern</th>
                  <th>Primary Person</th>
                  <th>Priority</th>
                  <th>Automation</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry) => {
                  const primary = entry.primary_person_id ? personMap.get(entry.primary_person_id) : null;
                  return (
                    <tr key={entry.id} className={entry.is_active ? '' : 'text-muted'}>
                      <td>
                        <div className="fw-semibold small">{entry.main_category}</div>
                        {entry.sub_category && (
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>{entry.sub_category}</div>
                        )}
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <div className="text-truncate small" title={entry.question_pattern}>
                          {entry.question_pattern}
                        </div>
                        {entry.answer_template.includes('[TBD]') && (
                          <span className="badge bg-warning text-dark ms-1" style={{ fontSize: '0.65rem' }}>
                            TBD tags
                          </span>
                        )}
                        {entry.notes?.includes('PHASE 2') && (
                          <span className="badge bg-secondary ms-1" style={{ fontSize: '0.65rem' }}>
                            Phase 2
                          </span>
                        )}
                      </td>
                      <td className="small">{primary?.name ?? <span className="text-muted">—</span>}</td>
                      <td>
                        <span className={`badge bg-${PRIORITY_COLORS[entry.priority]}`}>
                          {entry.priority}
                        </span>
                      </td>
                      <td>
                        <span className={`badge bg-${PRIORITY_COLORS[entry.automation_potential]} bg-opacity-50`}>
                          {entry.automation_potential}
                        </span>
                      </td>
                      <td>
                        {entry.is_active
                          ? <span className="badge bg-success-subtle text-success">Active</span>
                          : <span className="badge bg-secondary-subtle text-secondary">Inactive</span>}
                      </td>
                      <td className="text-end">
                        <button className="btn btn-xs btn-outline-secondary py-0 px-2 me-1" style={{ fontSize: '0.75rem' }}
                          onClick={() => { setEditingEntry(entry); setEntryModalOpen(true); }}>
                          Edit
                        </button>
                        {entry.is_active && (
                          <button className="btn btn-xs btn-outline-danger py-0 px-2" style={{ fontSize: '0.75rem' }}
                            onClick={() => handleDeactivateEntry(entry.id)}>
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── RESPONSIBLE PERSONS TAB ─────────────────────────────────────────── */}
      {activeTab === 'persons' && (
        <>
          <div className="d-flex justify-content-end mb-3">
            <button className="btn btn-sm btn-primary" onClick={() => { setEditingPerson(null); setPersonModalOpen(true); }}>
              <i className="bi bi-plus-lg me-1" />Add Person
            </button>
          </div>
          <div className="row g-3">
            {persons.map((person) => (
              <div key={person.id} className="col-md-6 col-xl-4">
                <div className="card h-100 shadow-sm">
                  <div className="card-body">
                    <div className="d-flex align-items-center mb-2">
                      <div
                        className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-2 fw-bold"
                        style={{ width: 38, height: 38, fontSize: 15, flexShrink: 0 }}
                      >
                        {person.name.charAt(0)}
                      </div>
                      <div className="flex-grow-1">
                        <div className="fw-semibold">{person.name}</div>
                        <div className="text-muted small">{person.areas.join(', ')}</div>
                      </div>
                      <button className="btn btn-xs btn-outline-secondary py-0 px-2" style={{ fontSize: '0.75rem' }}
                        onClick={() => { setEditingPerson(person); setPersonModalOpen(true); }}>
                        Edit
                      </button>
                    </div>
                    <ul className="list-unstyled small mb-0">
                      {person.email && (
                        <li><i className="bi bi-envelope me-1 text-muted" />{person.email}</li>
                      )}
                      {person.phone && (
                        <li><i className="bi bi-telephone me-1 text-muted" />{person.phone}</li>
                      )}
                      {person.work_hours && (
                        <li><i className="bi bi-clock me-1 text-muted" />{person.work_hours}</li>
                      )}
                      {person.time_zone && (
                        <li><i className="bi bi-globe me-1 text-muted" />{person.time_zone}</li>
                      )}
                      {person.shift_note && (
                        <li className="text-muted fst-italic mt-1">{person.shift_note}</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── COHORTS TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'cohorts' && (
        <div>
          {courses.map((course) => {
            const courseCohorts = cohorts.filter((c) => c.course_id === course.id);
            const activeCohort = courseCohorts.find((c) => c.is_active);
            return (
              <SectionCard
                key={course.id}
                title={course.name}
                className="mb-3"
                actions={
                  <button className="btn btn-sm btn-primary" onClick={() => {
                    setEditingCohort(null);
                    setCohortModalCourseId(course.id);
                    setCohortModalOpen(true);
                  }}>
                    <i className="bi bi-plus-lg me-1" />Add Cohort
                  </button>
                }
              >
                {activeCohort ? (
                  <div className="border border-success rounded p-3 mb-3 bg-success-subtle">
                    <div className="d-flex justify-content-between align-items-start">
                      <div>
                        <span className="badge bg-success me-2">Active</span>
                        <strong>{activeCohort.name}</strong>
                        <span className="text-muted small ms-2">Cohort #{activeCohort.cohort_number}</span>
                      </div>
                      <button className="btn btn-xs btn-outline-secondary py-0 px-2" style={{ fontSize: '0.75rem' }}
                        onClick={() => { setEditingCohort(activeCohort); setCohortModalOpen(true); }}>
                        Edit
                      </button>
                    </div>
                    <div className="row g-2 mt-2 small">
                      <div className="col-6 col-md-3">
                        <div className="text-muted">Open House</div>
                        <div>{activeCohort.open_house_date ?? '—'}</div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="text-muted">Start Date</div>
                        <div>{activeCohort.start_date ?? '—'}</div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="text-muted">End Date</div>
                        <div>{activeCohort.end_date ?? '—'}</div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="text-muted">Expo</div>
                        <div>{activeCohort.expo_date ?? '—'}</div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="text-muted">Annual price</div>
                        <div>{activeCohort.price_annual != null ? `$${activeCohort.price_annual}/mo` : '—'}</div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="text-muted">Monthly price</div>
                        <div>{activeCohort.price_monthly != null ? `$${activeCohort.price_monthly}/mo` : '—'}</div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="text-muted">Seats remaining</div>
                        <div>
                          {activeCohort.seats_remaining != null && activeCohort.seats_total != null
                            ? `${activeCohort.seats_remaining} / ${activeCohort.seats_total}`
                            : '—'}
                        </div>
                      </div>
                      <div className="col-6 col-md-3">
                        <div className="text-muted">Enrollment URL</div>
                        <div className="text-truncate">{activeCohort.enrollment_url ?? '—'}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted small">No active cohort for this course.</p>
                )}

                {courseCohorts.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-sm table-hover small">
                      <thead className="table-light">
                        <tr>
                          <th>#</th><th>Name</th><th>Start</th><th>End</th><th>Status</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseCohorts.filter((c) => !c.is_active).map((c) => (
                          <tr key={c.id}>
                            <td>{c.cohort_number}</td>
                            <td>{c.name}</td>
                            <td>{c.start_date ?? '—'}</td>
                            <td>{c.end_date ?? '—'}</td>
                            <td><span className="badge bg-secondary">Inactive</span></td>
                            <td>
                              <button className="btn btn-xs btn-outline-secondary py-0 px-2 me-1" style={{ fontSize: '0.75rem' }}
                                onClick={() => { setEditingCohort(c); setCohortModalOpen(true); }}>
                                Edit
                              </button>
                              <button className="btn btn-xs btn-outline-success py-0 px-2" style={{ fontSize: '0.75rem' }}
                                onClick={() => handleActivateCohort(c.id)}>
                                Activate
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}

      {entryModalOpen && (
        <EntryEditModal
          entry={editingEntry}
          courses={courses}
          cohorts={cohorts}
          persons={persons}
          onClose={() => setEntryModalOpen(false)}
          onSaved={loadAll}
        />
      )}
      {personModalOpen && (
        <PersonEditModal
          person={editingPerson}
          onClose={() => setPersonModalOpen(false)}
          onSaved={loadAll}
        />
      )}
      {cohortModalOpen && (
        <CohortEditModal
          cohort={editingCohort}
          defaultCourseId={cohortModalCourseId}
          courses={courses}
          hasActiveCohortForCourse={cohorts.some((c) => c.course_id === (editingCohort?.course_id ?? cohortModalCourseId) && c.is_active)}
          onClose={() => setCohortModalOpen(false)}
          onSaved={loadAll}
        />
      )}
    </div>
  );
};

export default AdminKnowledgeOpsPage;
