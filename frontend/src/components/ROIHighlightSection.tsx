import React from 'react';

interface ROIHighlightSectionProps {
  headline: string;
  subtext: string;
  buttonText?: string;
  presetValues?: {
    employees?: number;
    hours?: number;
    cost?: number;
    weeks?: number;
    investment?: number;
  };
}

function ROIHighlightSection({
  headline,
  subtext,
  buttonText = 'Calculate Your ROI',
  presetValues,
}: ROIHighlightSectionProps) {
  let href = '/executive-roi-calculator';

  if (presetValues) {
    const params = new URLSearchParams();
    if (presetValues.employees != null) params.set('employees', String(presetValues.employees));
    if (presetValues.hours != null) params.set('hours', String(presetValues.hours));
    if (presetValues.cost != null) params.set('cost', String(presetValues.cost));
    if (presetValues.weeks != null) params.set('weeks', String(presetValues.weeks));
    if (presetValues.investment != null) params.set('investment', String(presetValues.investment));
    const qs = params.toString();
    if (qs) href += `?${qs}`;
  }

  return (
    <section className="section-alt" aria-label="ROI Calculator">
      <div className="container text-center" style={{ maxWidth: '700px' }}>
        <h2 className="h4 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>
          {headline}
        </h2>
        <p className="mb-4" style={{ color: 'var(--color-text-light)' }}>
          {subtext}
        </p>
        <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-lg d-block d-sm-inline-block">
          {buttonText} &rarr;
        </a>
      </div>
    </section>
  );
}

export default ROIHighlightSection;
