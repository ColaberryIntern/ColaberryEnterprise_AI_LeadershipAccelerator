import React, { useState } from 'react';
import api from '../utils/api';

interface FormErrors {
  [key: string]: string;
}

type FieldName = 'name' | 'email' | 'company' | 'role' | 'message';

interface LeadCaptureFormProps {
  formType: string;
  fields?: FieldName[];
  submitLabel?: string;
  successMessage?: string;
  className?: string;
}

function LeadCaptureForm({
  formType,
  fields = ['name', 'email', 'company'],
  submitLabel = 'Submit',
  successMessage = '✅ Thank you! We\'ll be in touch shortly.',
  className = '',
}: LeadCaptureFormProps) {
  const [formData, setFormData] = useState<Record<string, string>>({
    name: '',
    email: '',
    company: '',
    role: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');

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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
      const payload: Record<string, string> = { form_type: formType };
      fields.forEach((field) => {
        payload[field] = formData[field];
      });
      await api.post('/api/leads', payload);
      setSubmitted(true);
    } catch (err: any) {
      if (err.response?.status === 400 && err.response?.data?.details) {
        const fieldErrors: FormErrors = {};
        err.response.data.details.forEach((d: { field: string; message: string }) => {
          fieldErrors[d.field] = d.message;
        });
        setErrors(fieldErrors);
      } else {
        setServerError('Something went wrong. Please try again later.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
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
          <div className={fields.length <= 3 ? 'col-md-4' : 'col-md-6'}>
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
          <div className={fields.length <= 3 ? 'col-md-4' : 'col-md-6'}>
            <label htmlFor={`${formType}-email`} className="form-label">
              Email <span className="text-danger">*</span>
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
          <div className={fields.length <= 3 ? 'col-md-4' : 'col-md-6'}>
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
