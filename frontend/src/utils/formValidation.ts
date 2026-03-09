export interface ValidationRules {
  required?: string[];
  conditionalRequired?: {
    when: { field: string; equals: unknown };
    require: string[];
  }[];
  email?: string[];
  phone?: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s().-]{7,20}$/;

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Full name',
  email: 'Email',
  phone: 'Phone',
  company: 'Company',
  title: 'Title',
  companySize: 'Company size',
  industry: 'Industry',
  primaryObjective: 'Primary objective',
  budgetOwner: 'Budget owner',
  timeline: 'Timeline',
  message: 'Message',
};

function label(field: string): string {
  return FIELD_LABELS[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

/**
 * Validate form data against rules. Returns a map of field → error message.
 * Empty map means no errors.
 */
export function validateForm(
  data: Record<string, unknown>,
  rules: ValidationRules,
): Record<string, string> {
  const errors: Record<string, string> = {};

  // Required fields
  if (rules.required) {
    for (const field of rules.required) {
      const val = data[field];
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        errors[field] = `${label(field)} is required`;
      }
    }
  }

  // Conditional required
  if (rules.conditionalRequired) {
    for (const rule of rules.conditionalRequired) {
      const triggerVal = data[rule.when.field];
      if (triggerVal === rule.when.equals) {
        for (const field of rule.require) {
          const val = data[field];
          if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
            errors[field] = `${label(field)} is required`;
          }
        }
      }
    }
  }

  // Email format
  if (rules.email) {
    for (const field of rules.email) {
      const val = data[field];
      if (typeof val === 'string' && val.trim() && !EMAIL_RE.test(val)) {
        errors[field] = 'Please enter a valid email address';
      }
    }
  }

  // Phone format
  if (rules.phone) {
    for (const field of rules.phone) {
      const val = data[field];
      if (typeof val === 'string' && val.trim() && !PHONE_RE.test(val.replace(/\s/g, ''))) {
        errors[field] = 'Please enter a valid phone number';
      }
    }
  }

  return errors;
}
