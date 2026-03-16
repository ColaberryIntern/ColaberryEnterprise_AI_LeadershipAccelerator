import React from 'react';

interface AgentActivityListProps {
  agents: string[];
  visibleCount?: number;
  animated?: boolean;
}

export default function AgentActivityList({
  agents,
  visibleCount,
  animated = false,
}: AgentActivityListProps) {
  const visible = visibleCount !== undefined ? agents.slice(0, visibleCount) : agents;

  return (
    <ul className="list-unstyled mb-0 small">
      {visible.map((agent, i) => (
        <li
          key={agent}
          className="d-flex align-items-center gap-2 mb-1"
          style={
            animated
              ? {
                  animation: 'fadeIn 0.3s ease forwards',
                  animationDelay: `${i * 150}ms`,
                  opacity: 0,
                }
              : undefined
          }
        >
          <span
            className="d-inline-block rounded-circle"
            style={{
              width: 6,
              height: 6,
              backgroundColor: 'var(--color-accent)',
              flexShrink: 0,
            }}
          />
          <span className="text-muted">{agent}</span>
        </li>
      ))}
    </ul>
  );
}
