import React from 'react';

interface ExecutiveTestimonialProps {
  quote: string;
  name: string;
  title: string;
  industry: string;
  companySize?: string;
}

function ExecutiveTestimonial({ quote, name, title, industry, companySize }: ExecutiveTestimonialProps) {
  return (
    <section className="section" aria-label="Executive Testimonial">
      <div className="container" style={{ maxWidth: '800px' }}>
        <blockquote
          className="ps-4 mb-4"
          style={{
            borderLeft: '4px solid var(--color-primary)',
            fontSize: '1.25rem',
            lineHeight: 1.7,
            color: 'var(--color-text)',
          }}
        >
          <p className="mb-0 fst-italic">&ldquo;{quote}&rdquo;</p>
        </blockquote>
        <div className="d-flex flex-wrap align-items-center gap-2 ps-4">
          <span className="fw-bold">{name}</span>
          <span className="text-muted">&mdash; {title}</span>
          <span className="badge rounded-pill bg-light text-dark border px-3 py-1">{industry}</span>
          {companySize && (
            <span className="badge rounded-pill bg-light text-dark border px-3 py-1">{companySize}</span>
          )}
        </div>
      </div>
    </section>
  );
}

export default ExecutiveTestimonial;
