import React, { useState } from 'react';
import { initials } from './communityUtils';

type AvatarSize = 'sm' | 'md' | 'lg';

/**
 * Renders a member's photo (avatar_url) with a deterministic initials fallback.
 * Falls back to initials both when there is no url AND when the image 404s at
 * runtime, so a dead url never leaves an empty circle. Design-E `.cm-avatar`
 * token supplies the sizing/color; this only chooses img vs initials.
 */
const Avatar: React.FC<{
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  onClick?: () => void;
}> = ({ name, src, size = 'md', className = '', onClick }) => {
  const [failed, setFailed] = useState(false);
  const sizeCls = size === 'sm' ? ' sm' : size === 'lg' ? ' lg' : '';
  const clickable = onClick ? ' cm-avatar-btn' : '';
  const cls = `cm-avatar${sizeCls}${clickable}${className ? ' ' + className : ''}`;

  const clickProps = onClick
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  if (src && !failed) {
    return (
      <img
        className={cls}
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        {...clickProps}
      />
    );
  }
  return (
    <span className={cls} aria-label={name} {...clickProps}>
      {initials(name)}
    </span>
  );
};

export default Avatar;
