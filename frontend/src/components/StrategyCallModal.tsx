import React, { useState, useMemo } from 'react';
import Modal from './ui/Modal';
import { useCalendarAvailability } from '../hooks/useCalendarAvailability';
import { downloadICS } from '../utils/ics';
import api from '../utils/api';
import { getUTMPayloadFields } from '../services/utmService';
import { trackEvent } from '../utils/tracker';

interface StrategyCallModalProps {
  show: boolean;
  onClose: () => void;
  initialName?: string;
  initialEmail?: string;
  initialCompany?: string;
  initialPhone?: string;
  pageOrigin?: string;
}

type Step = 'date' | 'time' | 'details' | 'submitting' | 'success';

interface BookingResult {
  scheduled_at: string;
  meet_link: string;
  prep_token: string;
}

function formatDateLabel(dateStr: string): { dayOfWeek: string; monthDay: string } {
  const d = new Date(dateStr + 'T12:00:00');
  const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short' });
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { dayOfWeek, monthDay };
}

function formatTime(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: tz,
  });
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return '';
  // +1 (XXX) XXX-XXXX for 11-digit starting with 1
  if (digits.length <= 11 && digits[0] === '1') {
    const d = digits.slice(1);
    if (d.length <= 3) return `+1 (${d}`;
    if (d.length <= 6) return `+1 (${d.slice(0, 3)}) ${d.slice(3)}`;
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
  }
  // (XXX) XXX-XXXX for 10-digit US numbers
  if (digits.length <= 10) {
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  }
  // For longer international numbers, return with + prefix
  return `+${digits}`;
}

function formatConfirmationDate(isoStr: string, tz: string): string {
  return new Date(isoStr).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  });
}

export default function StrategyCallModal({
  show,
  onClose,
  initialName = '',
  initialEmail = '',
  initialCompany = '',
  initialPhone = '',
  pageOrigin,
}: StrategyCallModalProps) {
  const { dates, loading, error: availError, refetch } = useCalendarAvailability();
  const [step, setStep] = useState<Step>('date');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [company, setCompany] = useState(initialCompany);
  const [phone, setPhone] = useState(initialPhone ? formatPhone(initialPhone) : '');
  const [formError, setFormError] = useState('');
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  // If we already have name + email, the required fields are satisfied
  const hasPrefilledIdentity = !!(initialName && initialEmail);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const slotsForDate = useMemo(() => {
    const found = dates.find((d) => d.date === selectedDate);
    return found?.slots || [];
  }, [dates, selectedDate]);

  const resetState = () => {
    setStep('date');
    setSelectedDate('');
    setSelectedSlot(null);
    setName(initialName);
    setEmail(initialEmail);
    setCompany(initialCompany);
    setPhone(initialPhone ? formatPhone(initialPhone) : '');
    setFormError('');
    setBookingResult(null);
    setEditingDetails(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    setStep('time');
  };

  const handleSlotSelect = (slot: { start: string; end: string }) => {
    setSelectedSlot(slot);
    setStep('details');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError('');

    if (!name.trim()) { setFormError('Name is required'); return; }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Please enter a valid email address');
      return;
    }
    if (!selectedSlot) return;

    setStep('submitting');
    try {
      trackEvent('book_strategy_call_click', {
        page_origin: pageOrigin || window.location.pathname,
      });

      const visitorFp = localStorage.getItem('cb_visitor_fp');
      const res = await api.post('/api/calendar/book', {
        name: name.trim(),
        email: email.trim(),
        company: company.trim(),
        phone: phone.trim(),
        slot_start: selectedSlot.start,
        timezone,
        visitor_fingerprint: visitorFp || undefined,
      });
      setBookingResult(res.data.booking);
      setStep('success');

      // Shadow lead for attribution (calendar/book doesn't accept UTM)
      const utmFields = getUTMPayloadFields();
      api.post('/api/leads', {
        name: name.trim(),
        email: email.trim(),
        company: company.trim(),
        phone: phone.trim(),
        form_type: 'strategy_call',
        ...utmFields,
        visitor_fingerprint: visitorFp || undefined,
      }).catch(() => {});
    } catch (err: any) {
      setStep('details');
      if (err.response?.status === 409) {
        setFormError(err.response.data.error || 'You already have a call scheduled.');
      } else if (err.response?.status === 400 && err.response.data?.details) {
        setFormError(err.response.data.details.map((d: any) => d.message).join('. '));
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    }
  };

  const modalTitle =
    step === 'success'
      ? 'Call Confirmed'
      : step === 'submitting'
        ? 'Booking...'
        : 'Schedule Executive Strategy Call';

  return (
    <Modal show={show} onClose={handleClose} title={modalTitle} size="lg">
      {/* Loading state */}
      {loading && step === 'date' && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Loading availability...</span>
          </div>
          <p className="text-muted">Loading available times...</p>
        </div>
      )}

      {/* Error state */}
      {availError && step === 'date' && (
        <div className="text-center py-5">
          <p className="text-danger mb-3">{availError}</p>
          <button className="btn btn-outline-primary btn-sm" onClick={refetch}>
            Try Again
          </button>
        </div>
      )}

      {/* Step 1: Date selection */}
      {!loading && !availError && step === 'date' && (
        <div>
          <p className="text-muted mb-3">Select a date for your 30-minute strategy call:</p>
          <p className="small text-muted mb-3">
            Times shown in {timezone.replace(/_/g, ' ')}
          </p>
          {dates.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted">No available slots in the next 3 weeks. Please check back later.</p>
            </div>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              {dates.map((d) => {
                const { dayOfWeek, monthDay } = formatDateLabel(d.date);
                return (
                  <button
                    key={d.date}
                    className="btn btn-outline-primary text-center px-3 py-2"
                    style={{ minWidth: '80px' }}
                    onClick={() => handleDateSelect(d.date)}
                  >
                    <div className="small fw-bold">{dayOfWeek}</div>
                    <div className="small">{monthDay}</div>
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                      {d.slots.length} slot{d.slots.length !== 1 ? 's' : ''}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Time selection */}
      {step === 'time' && (
        <div>
          <button
            className="btn btn-link btn-sm ps-0 mb-3"
            onClick={() => { setStep('date'); setSelectedDate(''); }}
          >
            &larr; Back to dates
          </button>
          <p className="text-muted mb-3">
            Available times for{' '}
            <strong>{formatConfirmationDate(selectedSlot?.start || selectedDate + 'T12:00:00', timezone)}</strong>:
          </p>
          <div className="d-flex flex-wrap gap-2">
            {slotsForDate.map((slot) => (
              <button
                key={slot.start}
                className="btn btn-outline-primary px-3 py-2"
                onClick={() => handleSlotSelect(slot)}
              >
                {formatTime(slot.start, timezone)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Details form */}
      {(step === 'details' || step === 'submitting') && selectedSlot && (
        <div>
          <button
            className="btn btn-link btn-sm ps-0 mb-3"
            onClick={() => setStep('time')}
            disabled={step === 'submitting'}
          >
            &larr; Back to times
          </button>

          <div className="alert alert-light border mb-3">
            <strong>{formatConfirmationDate(selectedSlot.start, timezone)}</strong>
            <br />
            {formatTime(selectedSlot.start, timezone)} &ndash; {formatTime(selectedSlot.end, timezone)}
            <span className="text-muted ms-2 small">({timezone.replace(/_/g, ' ')})</span>
          </div>

          {formError && (
            <div className="alert alert-danger py-2" role="alert">{formError}</div>
          )}

          {/* If we have pre-filled identity, show compact confirmation */}
          {hasPrefilledIdentity && !editingDetails ? (
            <div>
              <div className="bg-light rounded p-3 mb-3">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="fw-semibold">{name}</div>
                    <div className="text-muted small">{email}</div>
                    {company && <div className="text-muted small">{company}</div>}
                    {phone && <div className="text-muted small">{phone}</div>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-link btn-sm text-muted p-0"
                    onClick={() => setEditingDetails(true)}
                    disabled={step === 'submitting'}
                  >
                    Edit
                  </button>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-hero-primary btn-lg w-100"
                disabled={step === 'submitting'}
                onClick={() => handleSubmit()}
              >
                {step === 'submitting' ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Booking...
                  </>
                ) : (
                  'Confirm Strategy Call'
                )}
              </button>
              <p className="text-muted small mt-3 mb-0 text-center">
                A confirmation email with call details will be sent to you.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="sc-name" className="form-label">
                    Full Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    id="sc-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={step === 'submitting'}
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="sc-email" className="form-label">
                    Work Email <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    id="sc-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={step === 'submitting'}
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="sc-company" className="form-label">Company</label>
                  <input
                    type="text"
                    className="form-control"
                    id="sc-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    disabled={step === 'submitting'}
                  />
                </div>
                <div className="col-md-6">
                  <label htmlFor="sc-phone" className="form-label">Phone</label>
                  <input
                    type="tel"
                    className="form-control"
                    id="sc-phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(555) 123-4567"
                    disabled={step === 'submitting'}
                  />
                </div>
                <div className="col-12">
                  <button
                    type="submit"
                    className="btn btn-hero-primary btn-lg w-100"
                    disabled={step === 'submitting'}
                  >
                    {step === 'submitting' ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Booking...
                      </>
                    ) : (
                      'Confirm Strategy Call'
                    )}
                  </button>
                </div>
              </div>
              <p className="text-muted small mt-3 mb-0 text-center">
                A confirmation email with call details will be sent to you.
              </p>
            </form>
          )}
        </div>
      )}

      {/* Step 4: Success */}
      {step === 'success' && bookingResult && (
        <div className="py-4 px-2">
          {/* Header */}
          <div className="text-center mb-4">
            <div
              className="rounded-circle bg-success text-white d-inline-flex align-items-center justify-content-center mb-3"
              style={{ width: 48, height: 48, fontSize: '1.5rem' }}
              aria-hidden="true"
            >
              &#10003;
            </div>
            <h4 className="fw-bold mb-0" style={{ color: 'var(--color-accent)' }}>
              Your Executive Strategy Call is Confirmed
            </h4>
          </div>

          {/* Date/time confirmation */}
          <div className="alert alert-light border mb-4">
            <strong>{formatConfirmationDate(bookingResult.scheduled_at, timezone)}</strong>
            <br />
            {formatTime(bookingResult.scheduled_at, timezone)}
            <span className="text-muted ms-2 small">({timezone.replace(/_/g, ' ')})</span>
          </div>

          {/* What to Expect */}
          <div className="bg-light rounded p-3 mb-4 text-start">
            <h6 className="fw-semibold mb-2">What to Expect</h6>
            <ul className="list-unstyled mb-0">
              <li className="mb-1">&#10003; 30-minute focused architecture session</li>
              <li className="mb-1">&#10003; Identify 1&ndash;2 high-impact AI deployment opportunities</li>
              <li>&#10003; Clear internal roadmap recommendation</li>
            </ul>
          </div>

          {/* Action buttons */}
          <div className="d-flex gap-2 justify-content-center mb-3">
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={() => {
                const start = new Date(bookingResult.scheduled_at);
                downloadICS(
                  {
                    title: 'Executive AI Strategy Call \u2014 Colaberry',
                    description: 'Your 30-minute executive AI strategy session with Colaberry.',
                    startDate: start,
                    endDate: new Date(start.getTime() + 30 * 60 * 1000),
                  },
                  'strategy-call.ics',
                );
              }}
            >
              Add to Calendar (.ics)
            </button>
            <a href={`/strategy-call-prep?token=${bookingResult.prep_token}`} className="btn btn-outline-secondary btn-sm">
              Prepare for Your Call
            </a>
          </div>

          {/* Cohort reminder */}
          <div className="border-top pt-3 mt-3 text-center">
            <p className="small text-muted mb-1">
              The next Enterprise AI Cohort begins soon.
            </p>
            <p className="small text-muted mb-0">
              Many strategy call participants join the upcoming cohort.
            </p>
          </div>

          {/* Close */}
          <div className="text-center mt-4">
            <button className="btn btn-outline-secondary btn-sm" onClick={handleClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
