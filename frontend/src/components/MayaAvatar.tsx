import React from 'react';

export type MayaExpression =
  | 'greeting'    // friendly smile — default/opening
  | 'thinking'    // looking up, processing
  | 'explaining'  // attentive, professional
  | 'excited'     // big smile, enthusiastic (enrollment, booking)
  | 'empathetic'; // warm, understanding

interface MayaAvatarProps {
  expression?: MayaExpression;
  size?: number;
}

/**
 * Professional photo avatar for Maya — circular crop of real headshot.
 * Expression prop kept for API compatibility but avatar is static photo.
 */
const MayaAvatar: React.FC<MayaAvatarProps> = ({ expression = 'greeting', size = 32 }) => {
  return (
    <img
      src="/maya-avatar.png"
      alt="Maya"
      width={size}
      height={size}
      style={{
        borderRadius: '50%',
        flexShrink: 0,
        objectFit: 'cover',
      }}
    />
  );
};

export default MayaAvatar;
