import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import api from '../utils/api';
import { downloadICS } from '../utils/ics';

interface EnrollmentData {
  enrollment: {
    id: string;
    full_name: string;
    email: string;
    company: string;
    payment_status: string;
  };
  cohort: {
    name: string;
    start_date: string;
    core_day: string;
    core_time: string;
    optional_lab_day: string | null;
  } | null;
}

function EnrollSuccessPage() {
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<EnrollmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setLoading(false);
      return;
    }

    api
      .get(`/api/enrollment/verify?session_id=${sessionId}`)
      .then((res) => setData(res.data))
      .catch(() => setError('Unable to verify enrollment. Please check your email for confirmation details.'))
      .finally(() => setLoading(false));
  }, [searchParams]);

  const handleDownloadCalendar = () => {
    if (!data?.cohort) return;

    const startDate = new Date(data.cohort.start_date + 'T13:00:00');
    const endDate = new Date(data.cohort.start_date + 'T15:00:00');

    downloadICS(
      {
        title: `Enterprise AI Leadership Accelerator — ${data.cohort.name}`,
        description: `Cohort start date. Core sessions: ${data.cohort.core_day} at ${data.cohort.core_time}.${
          data.cohort.optional_lab_day
            ? ` Optional Architecture Lab: ${data.cohort.optional_lab_day}.`
            : ''
        } Pre-class requirements: Claude Code paid account, Company-approved LLM key.`,
        startDate,
        endDate,
      },
      'colaberry-accelerator.ics'
    );
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <>
      <SEOHead
        title="Enrollment Confirmed"
        description="Your enrollment in the Enterprise AI Leadership Accelerator has been confirmed."
      />

      <section className="section" aria-label="Enrollment Confirmation">
        <div className="container content-narrow">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="mt-3 text-muted">Verifying your enrollment...</p>
            </div>
          ) : error ? (
            <div className="text-center py-5">
              <h2 className="mb-3">Enrollment Processing</h2>
              <p className="text-muted">{error}</p>
              <p className="text-muted">
                Contact us at{' '}
                <a href="mailto:info@colaberry.com">info@colaberry.com</a> if you
                need assistance.
              </p>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="fs-1 mb-3" aria-hidden="true">🎉</div>
              <h1 className="display-6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
                You're Officially Enrolled
              </h1>

              {data?.cohort && (
                <>
                  <div className="card border-0 shadow-sm p-4 mb-4 text-start">
                    <h2 className="h5 mb-3" style={{ color: 'var(--color-primary)' }}>
                      📅 Your Cohort Details
                    </h2>
                    <ul className="list-unstyled fs-5 mb-0">
                      <li className="mb-2">
                        <strong>Cohort:</strong> {data.cohort.name}
                      </li>
                      <li className="mb-2">
                        <strong>Starts:</strong>{' '}
                        {formatDate(data.cohort.start_date)}
                      </li>
                      <li className="mb-2">
                        <strong>Core Sessions:</strong> {data.cohort.core_day} at{' '}
                        {data.cohort.core_time}
                      </li>
                      {data.cohort.optional_lab_day && (
                        <li className="mb-2">
                          <strong>Optional Architecture Lab:</strong>{' '}
                          {data.cohort.optional_lab_day}
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="callout-box text-start mb-4">
                    <h3 className="h6 mb-2">📘 Pre-Class Requirements</h3>
                    <ul className="text-muted mb-0">
                      <li className="mb-1">
                        <strong>Claude Code paid account</strong> (Max or Team plan)
                      </li>
                      <li className="mb-1">
                        <strong>Company-approved LLM API key</strong> (OpenAI,
                        Anthropic, or equivalent)
                      </li>
                      <li className="mb-1">
                        <strong>GitHub account</strong> with repository creation
                        access
                      </li>
                    </ul>
                  </div>

                  <div className="d-flex justify-content-center gap-3 flex-wrap mb-4">
                    <button
                      className="btn btn-primary btn-lg"
                      onClick={handleDownloadCalendar}
                    >
                      📅 Add to Calendar
                    </button>
                    <Link to="/program" className="btn btn-outline-primary btn-lg">
                      View Program Details
                    </Link>
                  </div>
                </>
              )}

              {!data?.cohort && (
                <p className="text-muted fs-5">
                  A confirmation email has been sent to your inbox with all the
                  details you need to get started.
                </p>
              )}

              <p className="text-muted">
                Questions? Contact us at{' '}
                <a href="mailto:info@colaberry.com">info@colaberry.com</a>
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export default EnrollSuccessPage;
