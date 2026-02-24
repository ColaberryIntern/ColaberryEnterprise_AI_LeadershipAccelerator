import React from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';

function EnrollCancelPage() {
  return (
    <>
      <SEOHead
        title="Enrollment Cancelled"
        description="Your enrollment payment was not completed. No charges were made."
      />

      <section className="section" aria-label="Enrollment Cancelled">
        <div className="container text-center" style={{ maxWidth: '600px' }}>
          <div className="py-5">
            <div className="fs-1 mb-3" aria-hidden="true">⚠️</div>
            <h1 className="display-6 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
              Payment Not Completed
            </h1>
            <p className="fs-5 text-muted mb-4">
              No charges were made. Your enrollment was not finalized.
            </p>
            <p className="text-muted mb-4">
              If you experienced an issue during checkout, please try again or
              contact our team for assistance at{' '}
              <a href="mailto:info@colaberry.com">info@colaberry.com</a>.
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <Link to="/enroll" className="btn btn-primary btn-lg">
                Try Again
              </Link>
              <Link to="/contact" className="btn btn-outline-primary btn-lg">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default EnrollCancelPage;
