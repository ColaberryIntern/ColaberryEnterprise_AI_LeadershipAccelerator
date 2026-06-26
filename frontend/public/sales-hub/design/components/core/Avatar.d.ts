import * as React from 'react';

/** Circular avatar — photo with graceful initials fallback. */
export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Photo URL. Initials show underneath while it loads and if it fails. */
  src?: string;
  /** Full name — drives initials, the accessible label, and the fallback tone. */
  name?: string;
  /** @default "md" */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Cherry-red ring around the avatar. @default false */
  ring?: boolean;
}

export function Avatar(props: AvatarProps): JSX.Element;
