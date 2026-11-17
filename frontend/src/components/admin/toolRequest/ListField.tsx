import React from 'react';
import { TOOL_LIST_ITEM_MAX, TOOL_LIST_MAX_ITEMS } from '../../../services/agentDomainApi';

/**
 * AF11.11 — one of the four list fields: reads, produces, touches, inputs.
 *
 * ## One row per entry, not a comma-separated box
 *
 * A single text input split on commas was the obvious cheaper control and it is the wrong one
 * here. `ToolRequestFacts.tsx` records why from the review side: the blast-radius field once
 * rendered as `skool postgres`, which reads as one system rather than two, and *"on the field the
 * ticket calls 'the thing being approved', an approver miscounting the systems is the worst
 * available misreading."* A comma box invites exactly that, because the person typing cannot see
 * where one entry ends. One row per entry means the count on the screen is the count being filed.
 *
 * ## An empty list is a real answer, and is sent as one
 *
 * The contract distinguishes a list that is ABSENT from one that is EMPTY: `list(d.inputs) === null`
 * refuses as `inputs_undeclared`, while `[]` passes for every list except `touches`. So the form
 * always sends an array and this control never collapses an empty list to undefined. The caller
 * strips blank rows before filing, because `['', '', '']` is not three answers.
 */

export default function ListField({
  id,
  values,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const rows = values.length === 0 ? [''] : values;

  function setAt(index: number, value: string) {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  }

  function removeAt(index: number) {
    const next = rows.filter((_, i) => i !== index);
    onChange(next);
  }

  return (
    <div data-testid={`list-${id}`}>
      {rows.map((value, index) => (
        // The index is the key on purpose: these rows have no id, and keying on the value would
        // remount a row on every keystroke and lose the caret.
        // eslint-disable-next-line react/no-array-index-key
        <div className="d-flex gap-2 mb-2" key={index}>
          <input
            id={index === 0 ? id : `${id}-${index}`}
            className="form-control form-control-sm"
            maxLength={TOOL_LIST_ITEM_MAX}
            value={value}
            placeholder={index === 0 ? placeholder : undefined}
            disabled={disabled}
            onChange={(e) => setAt(index, e.target.value)}
            aria-label={`${id} entry ${index + 1}`}
          />
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            disabled={disabled || rows.length === 1}
            onClick={() => removeAt(index)}
            aria-label={`Remove ${id} entry ${index + 1}`}
            title="Remove this entry"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-outline-primary btn-sm"
        disabled={disabled || rows.length >= TOOL_LIST_MAX_ITEMS}
        onClick={() => onChange([...rows, ''])}
      >
        Add another
      </button>
      {rows.length >= TOOL_LIST_MAX_ITEMS && (
        <div className="form-text">
          {`That is the most entries one request can carry (${TOOL_LIST_MAX_ITEMS}).`}
        </div>
      )}
    </div>
  );
}
