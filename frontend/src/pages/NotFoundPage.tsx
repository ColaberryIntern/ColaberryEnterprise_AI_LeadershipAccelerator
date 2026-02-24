import React from 'react';
import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <section className="section text-center" aria-label="Page Not Found">
      <div className="container py-5">
        <h1 className="display-1 fw-bold text-muted">404</h1>
        <h2 className="mb-3">Page Not Found</h2>
        <p className="text-muted mb-4">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/" className="btn btn-primary btn-lg">
          Return Home
        </Link>
      </div>
    </section>
  );
}

export default NotFoundPage;
