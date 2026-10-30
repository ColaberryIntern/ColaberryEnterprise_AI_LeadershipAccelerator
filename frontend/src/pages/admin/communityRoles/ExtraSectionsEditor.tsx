import React, { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * C82 (Campus HQ H4, option A): grant a staff member admin sections on top of their management role (Sarbjit: Marketing plus AI
 * Internship). Sections their role already gives show checked and locked; the rest are checkboxes. A section you do not hold
 * yourself is disabled (the server applies the same no-escalation rule and is the authority). Saving sends the whole list.
 */

/**
 * The admin section keys and their sidebar names. Mirrors SECTION_KEYS in backend/src/services/access/mgmtRoles.ts; a backend
 * test reads this file and fails when the two lists differ.
 */
export const SECTION_LABEL: Record<string, string> = {
  dashboard: 'Dashboard', trust: 'Trust Center', war_room: 'War Room', revenue: 'Revenue', campaigns: 'Marketing & Campaigns',
  lead_ingestion: 'Lead Ingestion', inbox_content: 'Inbox & Content', program: 'Program', intelligence: 'Intelligence',
  system: 'System', students: 'Student Story', leads: 'Leads', career_review: 'Portfolio Review', internship: 'AI Internship',
  brands: 'Brands', agents: 'Agents', gov_contracts: 'Gov Contracts',
};

export interface ExtraSectionsEditorProps {
  name: string;
  roleSections: string[];
  extras: string[];
  saving: boolean;
  onSave: (sections: string[]) => void;
}

export default function ExtraSectionsEditor({ name, roleSections, extras, saving, onSave }: ExtraSectionsEditorProps): React.ReactElement {
  const { canSection } = useAuth();
  const [picked, setPicked] = useState<string[]>(extras);
  const dirty = picked.length !== extras.length || picked.some((s) => !extras.includes(s));
  const toggle = (s: string) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  return (
    <details className="mt-1" data-testid="extra-sections">
      <summary className="small text-muted">{extras.length ? `+ ${extras.length} extra section${extras.length === 1 ? '' : 's'}` : '+ Extra sections'}</summary>
      <fieldset className="mt-1" aria-label={`Extra sections for ${name}`}>
        {Object.entries(SECTION_LABEL).map(([key, label]) => {
          const fromRole = roleSections.includes(key);
          return (
            <label key={key} className="d-block small">
              <input type="checkbox" className="form-check-input me-1" checked={fromRole || picked.includes(key)}
                disabled={saving || fromRole || !canSection(key)} onChange={() => toggle(key)} data-testid={`extra-${key}`} />
              {label}{fromRole && <span className="text-muted"> (from role)</span>}
            </label>
          );
        })}
        <button type="button" className="btn btn-sm btn-outline-primary mt-1" disabled={saving || !dirty} onClick={() => onSave(picked)} data-testid="extra-save">
          Save sections
        </button>
      </fieldset>
    </details>
  );
}
