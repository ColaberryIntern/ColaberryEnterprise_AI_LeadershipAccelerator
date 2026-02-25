import React, { useState, useEffect } from 'react';
import api from '../utils/api';

interface FormErrors {
  [key: string]: string;
}

type FieldName = 'name' | 'email' | 'company' | 'role' | 'phone' | 'message' | 'title' | 'company_size' | 'evaluating_90_days';

const COMPANY_SIZE_OPTIONS = [
  { value: '', label: 'Select company size' },
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-1000', label: '201-1,000 employees' },
  { value: '1001-5000', label: '1,001-5,000 employees' },
  { value: '5001+', label: '5,001+ employees' },
];

interface LeadCaptureFormProps {
  formType: string;
  fields?: FieldName[];
  submitLabel?: string;
  successMessage?: string;
  className?: string;
  showConsent?: boolean;
  captureUtm?: boolean;
  onSuccess?: () => void;
}

function LeadCaptureForm({
  formType,
  fields = ['name', 'email', 'company'],
  submitLabel = 'Submit',
  successMessage = 'Thank you! We\'ll be in touch shortly.',
  className = '',
  showConsent = true,
  captureUtm = false,
  onSuccess,
}: LeadCaptureFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>({
    name: '',
    email: '',
    company: '',
    role: '',
    phone: '',
    message: '',
    title: '',
    company_size: '',
  });
  const [evaluating90Days, setEvaluating90Days] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [utmParams, setUtmParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (captureUtm) {
      const params = new URLSearchParams(window.location.search);
      const utm: Record<string, string> = {};
      if (params.get('utm_source')) utm.utm_source = params.get('utm_source')!;
      if (params.get('utm_campaign')) utm.utm_campaign = params.get('utm_campaign')!;
      setUtmParams(utm);
    }
  }, [captureUtm]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (fields.includes('name') && !formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    if (fields.includes('email')) {
      if (!formData.email.trim()) {
        newErrors.email = 'Email is required';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        newErrors.email = 'Please enter a valid email address';
      }
    }
    if (showConsent && !consentChecked) {
      newErrors.consent = 'You must agree to be contacted';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: Record<string, any> = { form_type: formType };
      fields.forEach((field) => {
        if (field === 'evaluating_90_days') {
          payload.evaluating_90_days = evaluating90Days;
        } else {
          payload[field] = formData[field];
        }
      });
      if (showConsent) {
        payload.consent_contact = consentChecked;
      }
      if (captureUtm) {
        if (utmParams.utm_source) payload.utm_source = utmParams.utm_source;
        if (utmParams.utm_campaign) payload.utm_campaign = utmParams.utm_campaign;
        payload.page_url = window.location.href;
      }
      await api.post('/api/leads', payload);
      setSubmitted(true);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.details) {
        const fieldErrors: FormErrors = {};
        err.response.data.details.forEach((d: { field: string; message: string }) => {
          fieldErrors[d.field] = d.message;
        });
        setErrors(fieldErrors);
      } else if (err.response?.status === 429) {
        setServerError('Too many submissions. Please try again in a few minutes.');
      } else {
        setServerError('Something went wrong. Please try again later.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && !onSuccess) {
    return (
      <div className={`text-center py-4 ${className}`} role="alert">
        <p className="fs-5 mb-0">{successMessage}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className={className}>
      {serverError && (
        <div className="alert alert-danger" role="alert">
          {serverError}
        </div>
      )}
      <div className="row g-3">
        {fields.includes('name') && (
          <div className="col-md-6">
            <label htmlFor={`${formType}-name`} className="form-label">
              Full Name <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className={`form-control ${errors.name ? 'is-invalid' : ''}`}
              id={`${formType}-name`}
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              aria-required="true"
              aria-describedby={errors.name ? `${formType}-name-error` : undefined}
            />
            {errors.name && (
              <div className="invalid-feedback" id={`${formType}-name-error`}>{errors.name}</div>
            )}
          </div>
        )}
        {fields.includes('email') && (
          <div className="col-md-6">
            <label htmlFor={`${formType}-email`} className="form-label">
              Work Email <span className="text-danger">*</span>
            </label>
            <input
              type="email"
              className={`form-control ${errors.email ? 'is-invalid' : ''}`}
              id={`${formType}-email`}
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              aria-required="true"
              aria-describedby={errors.email ? `${formType}-email-error` : undefined}
            />
            {errors.email && (
              <div className="invalid-feedback" id={`${formType}-email-error`}>{errors.email}</div>
            )}
          </div>
        )}
        {fields.includes('company') && (
          <div className="col-md-6">
            <label htmlFor={`${formType}-company`} className="form-label">
              Company
            </label>
            <input
              type="text"
              className="form-control"
              id={`${formType}-company`}
              name="company"
              value={formData.company}
              onChange={handleChange}
            />
          </div>
        )}
        {fields.includes('title') && (
          <div className="col-md-6">
            <label htmlFor={`${formType}-title`} className="form-label">
              Job Title
            </label>
            <input
              type="text"
              className="form-control"
              id={`${formType}-title`}
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. VP of Engineering, Director of AI"
            />
          </div>
        )}
        {fields.includes('phone') && (
          <div className="col-md-6">
            <label htmlFor={`${formType}-phone`} className="form-label">
              Phone Number
            </label>
            <input
              type="tel"
              className="form-control"
              id={`${formType}-phone`}
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+1 (555) 123-4567"
            />
          </div>
        )}
        {fields.includes('company_size') && (
          <div className="col-md-6">
            <label htmlFor={`${formType}-company_size`} className="form-label">
              Company Size
            </label>
            <select
              className="form-select"
              id={`${formType}-company_size`}
              name="company_size"
              value={formData.company_size}
              onChange={handleChange}
            >
              {COMPANY_SIZE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
        {fields.includes('role') && (
          <div className="col-md-6">
            <label htmlFor={`${formType}-role`} className="form-label">
              Job Title / Role
            </label>
            <input
              type="text"
              className="form-control"
              id={`${formType}-role`}
              name="role"
              value={formData.role}
              onChange={handleChange}
            />
          </div>
        )}
        {fields.includes('message') && (
          <div className="col-12">
            <label htmlFor={`${formType}-message`} className="form-label">
              Message
            </label>
            <textarea
              className="form-control"
              id={`${formType}-message`}
              name="message"
              rows={4}
              value={formData.message}
              onChange={handleChange}
            ></textarea>
          </div>
        )}
        {fields.includes('evaluating_90_days') && (
          <div className="col-12">
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id={`${formType}-evaluating`}
                checked={evaluating90Days}
                onChange={(e) => setEvaluating90Days(e.target.checked)}
              />
              <label className="form-check-label" htmlFor={`${formType}-evaluating`}>
                We are actively evaluating AI training programs for the next 90 days
              </label>
            </div>
          </div>
        )}
        {showConsent && (
          <div className="col-12">
            <div className="form-check">
              <input
                type="checkbox"
                className={`form-check-input ${errors.consent ? 'is-invalid' : ''}`}
                id={`${formType}-consent`}
                checked={consentChecked}
                onChange={(e) => {
                  setConsentChecked(e.target.checked);
                  if (errors.consent) {
                    setErrors({ ...errors, consent: '' });
                  }
                }}
              />
              <label className="form-check-label small" htmlFor={`${formType}-consent`}>
                I agree to be contacted by Colaberry about the Enterprise AI Leadership Accelerator <span className="text-danger">*</span>
              </label>
              {errors.consent && (
                <div className="invalid-feedback">{errors.consent}</div>
              )}
            </div>
          </div>
        )}
        <div className="col-12">
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

export default LeadCaptureForm;
