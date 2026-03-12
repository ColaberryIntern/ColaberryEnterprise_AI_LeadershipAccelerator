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
 * Professional female avatar for Maya — brown hair in updo/bun, glasses,
 * navy blazer with bow tie. Matches the 3D portrait style the user selected.
 * Each expression changes eyes/mouth/brows to match conversation mood.
 */
const MayaAvatar: React.FC<MayaAvatarProps> = ({ expression = 'greeting', size = 32 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ borderRadius: '50%', flexShrink: 0 }}
    >
      {/* Soft gradient background */}
      <defs>
        <radialGradient id="maya-bg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#EDF2F7" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </radialGradient>
        <radialGradient id="maya-skin-shading" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#FDDCB5" />
          <stop offset="100%" stopColor="#F0C9A0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill="url(#maya-bg)" />

      {/* Hair — brown updo/bun style */}
      {/* Back hair volume */}
      <ellipse cx="50" cy="28" rx="27" ry="20" fill="#5C3317" />
      {/* Top hair with volume */}
      <ellipse cx="50" cy="26" rx="25" ry="16" fill="#6B3A1F" />
      {/* Hair highlight/shine */}
      <path d="M34 22C38 16 46 14 52 14C58 14 64 17 66 22" fill="#7B4A2F" opacity="0.5" />
      {/* Side-swept bangs */}
      <path d="M30 36C32 28 38 22 48 20C42 24 36 30 34 38Z" fill="#6B3A1F" />
      <path d="M70 36C68 28 62 22 52 20C58 24 64 30 66 38Z" fill="#5C3317" opacity="0.7" />
      {/* Bun on top */}
      <ellipse cx="54" cy="16" rx="10" ry="8" fill="#5C3317" />
      <ellipse cx="54" cy="15" rx="8" ry="6" fill="#6B3A1F" />
      {/* Bun highlight */}
      <ellipse cx="52" cy="13" rx="4" ry="3" fill="#7B4A2F" opacity="0.4" />

      {/* Side hair framing face */}
      <path d="M28 38C27 42 27 48 28 52C30 48 30 42 29 38Z" fill="#5C3317" />
      <path d="M72 38C73 42 73 48 72 52C70 48 70 42 71 38Z" fill="#5C3317" />

      {/* Neck */}
      <rect x="44" y="64" width="12" height="7" rx="3" fill="url(#maya-skin-shading)" />

      {/* Navy blazer / shoulders */}
      <path
        d="M28 78C28 72 36 67 50 67C64 67 72 72 72 78L74 100L26 100Z"
        fill="#1A365D"
      />
      {/* Blazer lapels */}
      <path d="M42 68L48 76L50 68" fill="#2D4A7A" />
      <path d="M58 68L52 76L50 68" fill="#2D4A7A" />
      {/* Lapel shadow */}
      <path d="M43 69L48 75L49 69" fill="#152C4D" opacity="0.3" />
      <path d="M57 69L52 75L51 69" fill="#152C4D" opacity="0.3" />

      {/* White shirt collar V */}
      <path d="M44 68L50 75L56 68" fill="#FFFFFF" />
      <path d="M45 68.5L50 74L55 68.5" fill="#F7FAFC" />

      {/* Bow tie */}
      <path d="M47 70L50 72L53 70L50 68Z" fill="#1A365D" />
      <circle cx="50" cy="70" r="1.2" fill="#2D4A7A" />

      {/* Face — softer, feminine shape */}
      <ellipse cx="50" cy="48" rx="21" ry="23" fill="url(#maya-skin-shading)" />
      {/* Jaw softening */}
      <ellipse cx="50" cy="56" rx="17" ry="14" fill="#FDDCB5" opacity="0.5" />

      {/* Ears (partially hidden by hair) */}
      <ellipse cx="29" cy="48" rx="3" ry="4.5" fill="#F0C9A0" />
      <ellipse cx="71" cy="48" rx="3" ry="4.5" fill="#F0C9A0" />

      {/* Nose — small, subtle */}
      <path d="M49 52C49.5 54 50.5 54 51 52" stroke="#DEB896" strokeWidth="1" strokeLinecap="round" fill="none" />

      {/* Glasses — semi-rimless, professional style */}
      <ellipse cx="40" cy="46" rx="8" ry="6.5" stroke="#4A3728" strokeWidth="1.8" fill="none" opacity="0.9" />
      <ellipse cx="60" cy="46" rx="8" ry="6.5" stroke="#4A3728" strokeWidth="1.8" fill="none" opacity="0.9" />
      {/* Glasses bridge */}
      <path d="M48 46C49 44.5 51 44.5 52 46" stroke="#4A3728" strokeWidth="1.3" fill="none" />
      {/* Glasses arms */}
      <line x1="32" y1="45" x2="29" y2="46" stroke="#4A3728" strokeWidth="1.2" />
      <line x1="68" y1="45" x2="71" y2="46" stroke="#4A3728" strokeWidth="1.2" />
      {/* Lens shine */}
      <ellipse cx="37" cy="44" rx="2" ry="1.5" fill="#fff" opacity="0.15" />
      <ellipse cx="57" cy="44" rx="2" ry="1.5" fill="#fff" opacity="0.15" />

      {/* Expression-dependent features */}
      {expression === 'greeting' && (
        <>
          {/* Warm, friendly eyes */}
          <ellipse cx="40" cy="46" rx="3" ry="3.2" fill="#3D2B1F" />
          <ellipse cx="60" cy="46" rx="3" ry="3.2" fill="#3D2B1F" />
          {/* Iris color */}
          <ellipse cx="40" cy="46" rx="3" ry="3.2" fill="#4A2F1A" />
          <ellipse cx="60" cy="46" rx="3" ry="3.2" fill="#4A2F1A" />
          {/* Pupils */}
          <circle cx="40" cy="46" r="1.8" fill="#1A1A1A" />
          <circle cx="60" cy="46" r="1.8" fill="#1A1A1A" />
          {/* Eye shine */}
          <circle cx="41.5" cy="44.8" r="1" fill="#fff" />
          <circle cx="61.5" cy="44.8" r="1" fill="#fff" />
          <circle cx="39" cy="47" r="0.5" fill="#fff" opacity="0.6" />
          <circle cx="59" cy="47" r="0.5" fill="#fff" opacity="0.6" />
          {/* Upper eyelids / lash line */}
          <path d="M35 44C37 42 43 42 45 44" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M55 44C57 42 63 42 65 44" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          {/* Eyelashes */}
          <path d="M34.5 44.5L33 43" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M45.5 44.5L47 43" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M54.5 44.5L53 43" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M65.5 44.5L67 43" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          {/* Friendly smile */}
          <path d="M42 58C44 62 56 62 58 58" stroke="#C4705A" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          {/* Lower lip hint */}
          <path d="M44 60C47 62 53 62 56 60" fill="#D4856E" opacity="0.4" />
          {/* Warm blush */}
          <circle cx="33" cy="54" r="4.5" fill="#FFB5B5" opacity="0.2" />
          <circle cx="67" cy="54" r="4.5" fill="#FFB5B5" opacity="0.2" />
          {/* Eyebrows — arched, feminine */}
          <path d="M34 40C37 37.5 43 37.5 46 39.5" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d="M54 39.5C57 37.5 63 37.5 66 40" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'thinking' && (
        <>
          {/* Eyes looking slightly up and to the side */}
          <ellipse cx="41" cy="45.5" rx="3" ry="3.2" fill="#4A2F1A" />
          <ellipse cx="61" cy="45.5" rx="3" ry="3.2" fill="#4A2F1A" />
          <circle cx="41" cy="45.5" r="1.8" fill="#1A1A1A" />
          <circle cx="61" cy="45.5" r="1.8" fill="#1A1A1A" />
          {/* Eye shine — positioned higher (looking up) */}
          <circle cx="42.5" cy="44" r="1" fill="#fff" />
          <circle cx="62.5" cy="44" r="1" fill="#fff" />
          {/* Upper eyelids */}
          <path d="M35 43.5C37 41.5 43 41.5 45 43.5" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M55 43.5C57 41.5 63 41.5 65 43.5" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          {/* Eyelashes */}
          <path d="M34.5 44L33 42.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M45.5 44L47 42.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M54.5 44L53 42.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M65.5 44L67 42.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          {/* Small pursed/thoughtful mouth */}
          <ellipse cx="50" cy="59" rx="3.5" ry="2" fill="#D4856E" opacity="0.7" />
          <path d="M47 58.5C48 57.5 52 57.5 53 58.5" stroke="#C4705A" strokeWidth="1" strokeLinecap="round" fill="none" />
          {/* One brow raised — curious/thinking */}
          <path d="M34 39C37 36 43 36.5 46 39" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d="M54 39.5C57 37 63 37 66 39.5" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'explaining' && (
        <>
          {/* Attentive, engaged eyes — slightly wider */}
          <ellipse cx="40" cy="46" rx="3.2" ry="3.5" fill="#4A2F1A" />
          <ellipse cx="60" cy="46" rx="3.2" ry="3.5" fill="#4A2F1A" />
          <circle cx="40" cy="46" r="1.8" fill="#1A1A1A" />
          <circle cx="60" cy="46" r="1.8" fill="#1A1A1A" />
          <circle cx="41.5" cy="44.8" r="1" fill="#fff" />
          <circle cx="61.5" cy="44.8" r="1" fill="#fff" />
          <circle cx="39" cy="47" r="0.5" fill="#fff" opacity="0.5" />
          <circle cx="59" cy="47" r="0.5" fill="#fff" opacity="0.5" />
          {/* Upper eyelids */}
          <path d="M35 43.5C37 41.5 43 41.5 45 43.5" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M55 43.5C57 41.5 63 41.5 65 43.5" stroke="#3D2B1F" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          {/* Eyelashes */}
          <path d="M34.5 44L33 42.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M45.5 44L47 42.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M54.5 44L53 42.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M65.5 44L67 42.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          {/* Friendly open smile — showing teeth */}
          <path d="M42 57C45 62 55 62 58 57" stroke="#C4705A" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M44 58C46 61 54 61 56 58" fill="#FFFFFF" />
          <path d="M44 58.5C47 60 53 60 56 58.5" fill="#F7FAFC" opacity="0.8" />
          {/* Slight blush */}
          <circle cx="33" cy="54" r="4" fill="#FFB5B5" opacity="0.15" />
          <circle cx="67" cy="54" r="4" fill="#FFB5B5" opacity="0.15" />
          {/* Confident brows — slightly raised */}
          <path d="M34 39.5C37 37 43 37 46 39" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d="M54 39C57 37 63 37 66 39.5" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'excited' && (
        <>
          {/* Happy squished eyes — smiling so hard eyes crinkle */}
          <path d="M36 47C38 43 42 43 44 47" stroke="#3D2B1F" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M56 47C58 43 62 43 64 47" stroke="#3D2B1F" strokeWidth="2" strokeLinecap="round" fill="none" />
          {/* Eyelash accents */}
          <path d="M35 47L33.5 45.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M44.5 47L46 45.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M55.5 47L54 45.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M64.5 47L66 45.5" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          {/* Big delighted grin */}
          <path d="M40 57C44 64 56 64 60 57" stroke="#C4705A" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M42 58C45 63 55 63 58 58" fill="#FFFFFF" />
          {/* Rosy cheeks */}
          <circle cx="32" cy="54" r="5.5" fill="#FFAAAA" opacity="0.3" />
          <circle cx="68" cy="54" r="5.5" fill="#FFAAAA" opacity="0.3" />
          {/* Raised happy brows */}
          <path d="M34 38C37 35.5 43 35.5 46 37.5" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d="M54 37.5C57 35.5 63 35.5 66 38" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </>
      )}

      {expression === 'empathetic' && (
        <>
          {/* Soft, gentle eyes */}
          <ellipse cx="40" cy="46.5" rx="3" ry="3" fill="#4A2F1A" />
          <ellipse cx="60" cy="46.5" rx="3" ry="3" fill="#4A2F1A" />
          <circle cx="40" cy="46.5" r="1.8" fill="#1A1A1A" />
          <circle cx="60" cy="46.5" r="1.8" fill="#1A1A1A" />
          <circle cx="41.2" cy="45.3" r="1" fill="#fff" />
          <circle cx="61.2" cy="45.3" r="1" fill="#fff" />
          {/* Softer eyelids — slightly more closed, caring look */}
          <path d="M35 44C37 42.5 43 42.5 45 44" stroke="#3D2B1F" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          <path d="M55 44C57 42.5 63 42.5 65 44" stroke="#3D2B1F" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          {/* Eyelashes */}
          <path d="M34.5 44.5L33 43" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M45.5 44.5L47 43" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M54.5 44.5L53 43" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          <path d="M65.5 44.5L67 43" stroke="#3D2B1F" strokeWidth="0.8" strokeLinecap="round" />
          {/* Gentle warm smile */}
          <path d="M43 58C46 61 54 61 57 58" stroke="#C4705A" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          {/* Slight lower lip */}
          <path d="M45 59C47 61 53 61 55 59" fill="#D4856E" opacity="0.3" />
          {/* Warm soft blush */}
          <circle cx="33" cy="54" r="4.5" fill="#FFB5B5" opacity="0.2" />
          <circle cx="67" cy="54" r="4.5" fill="#FFB5B5" opacity="0.2" />
          {/* Caring brows — inner edges slightly raised (empathy shape) */}
          <path d="M34 40.5C37 38 42 37 46 39" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          <path d="M54 39C58 37 63 38 66 40.5" stroke="#4A2F1A" strokeWidth="1.3" strokeLinecap="round" fill="none" />
        </>
      )}
    </svg>
  );
};

export default MayaAvatar;
