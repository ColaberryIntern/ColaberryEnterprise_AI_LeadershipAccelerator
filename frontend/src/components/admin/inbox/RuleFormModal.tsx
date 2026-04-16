import React, { useState, useEffect } from 'react';

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface RuleFormModalProps {
  show: boolean;
  rule?: any;
  onSave: (data: any) => void;
  onClose: () => void;
}

const FIELD_OPTIONS = [
  { value: 'from', label: 'From' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body' },
  { value: 'header', label: 'Header' },
];

const OPERATOR_OPTIONS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'regex', label: 'Regex' },
  { value: 'starts_with', label: 'Starts With' },
];

const TARGET_STATES = ['INBOX', 'AUTOMATION', 'SILENT_HOLD'] as const;

export default function RuleFormModal({ show, rule, onSave, onClose }: RuleFormModalProps) {
  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState('filter');
  const [conditions, setConditions] = useState<Condition[]>([{ field: 'from', operator: 'contains', value: '' }]);
  const [targetState, setTargetState] = useState<string>('SILENT_HOLD');
  const [priority, setPriority] = useState(100);

  useEffect(() => {
    if (rule) {
      setName(rule.name || '');
      setRuleType(rule.rule_type || 'filter');
      setConditions(rule.conditions?.length ? rule.conditions : [{ field: 'from', operator: 'contains', value: '' }]);
      setTargetState(rule.target_state || 'SILENT_HOLD');
      setPriority(rule.priority ?? 100);
    } else {
      setName('');
      setRuleType('filter');
      setConditions([{ field: 'from', operator: 'contains', value: '' }]);
      setTargetState('SILENT_HOLD');
      setPriority(100);
    }
  }, [rule, show]);

  const addCondition = () => {
    setConditions([...conditions, { field: 'from', operator: 'contains', value: '' }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, key: keyof Condition, val: string) => {
    const updated = conditions.map((c, i) => (i === index ? { ...c, [key]: val } : c));
    setConditions(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      rule_type: ruleType,
      conditions,
      target_state: targetState,
      priority,
    });
  };

  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop fade show" />
      <div className="modal show d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-lg">
          <form className="modal-content" onSubmit={handleSubmit}>
            <div className="modal-header">
              <h5 className="modal-title">{rule ? 'Edit Rule' : 'Add Rule'}</h5>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body">
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <label className="form-label small fw-medium">Rule Name</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Rule Type</label>
                  <select className="form-select form-select-sm" value={ruleType} onChange={(e) => setRuleType(e.target.value)}>
                    <option value="filter">Filter</option>
                    <option value="classification">Classification</option>
                    <option value="routing">Routing</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label small fw-medium">Priority</label>
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                    min={0}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Conditions</label>
                {conditions.map((cond, idx) => (
                  <div key={idx} className="d-flex gap-2 mb-2 align-items-center">
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 120 }}
                      value={cond.field}
                      onChange={(e) => updateCondition(idx, 'field', e.target.value)}
                    >
                      {FIELD_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 140 }}
                      value={cond.operator}
                      onChange={(e) => updateCondition(idx, 'operator', e.target.value)}
                    >
                      {OPERATOR_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="form-control form-control-sm flex-grow-1"
                      placeholder="Value..."
                      value={cond.value}
                      onChange={(e) => updateCondition(idx, 'value', e.target.value)}
                      required
                    />
                    {conditions.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => removeCondition(idx)}
                        aria-label="Remove condition"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={addCondition}>
                  + Add Condition
                </button>
              </div>

              <div className="mb-3">
                <label className="form-label small fw-medium">Target State</label>
                <div className="d-flex gap-3">
                  {TARGET_STATES.map((state) => (
                    <div className="form-check" key={state}>
                      <input
                        className="form-check-input"
                        type="radio"
                        name="targetState"
                        id={`state-${state}`}
                        value={state}
                        checked={targetState === state}
                        onChange={(e) => setTargetState(e.target.value)}
                      />
                      <label className="form-check-label small" htmlFor={`state-${state}`}>
                        {state.replace('_', ' ')}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-sm btn-primary">Save Rule</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
