import * as React from 'react';
/** On/off toggle switch (leaf-green when on). */
export interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: React.ReactNode; disabled?: boolean; }
export function Switch(props: SwitchProps): JSX.Element;
