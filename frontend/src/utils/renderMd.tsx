import React from 'react';

/**
 * Renders **bold** markers from AI-generated strings as <strong> elements.
 * Handles bold only — the only markdown pattern backend queues and priority
 * cards emit. Avoids dangerouslySetInnerHTML.
 */
export function renderMd(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return text;
  return <>{parts.map((p, i) => i % 2 === 1 ? <strong key={i}>{p}</strong> : p)}</>;
}
