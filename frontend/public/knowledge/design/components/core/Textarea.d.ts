import * as React from 'react';
/** Multi-line text field with label, error, and char counter. */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { label?: string; required?: boolean; error?: string; helperText?: string; }
export function Textarea(props: TextareaProps): JSX.Element;
