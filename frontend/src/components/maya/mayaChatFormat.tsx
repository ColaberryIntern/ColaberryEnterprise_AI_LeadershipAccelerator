import React from 'react';

/**
 * Maya chat helpers moved verbatim out of MayaChatWidget.tsx (Colaberry Campus C6: the widget is over the 500-line ceiling,
 * so it is split before the campus adds its embedded mode). Message types, the page-aware quick replies, and the small
 * markdown-like renderer for her replies. No behavior change.
 */
export interface ChatMessageData {
  id?: string;
  role: 'visitor' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  visitor_type?: string;
  suggestions?: Array<{ label: string; value: string }>;
}

export interface QuickReply {
  label: string;
  value: string;
}

export function getQuickReplies(pathname: string): QuickReply[] {
  const path = pathname.toLowerCase();
  if (path.includes('pricing') || path.includes('investment')) {
    return [
      { label: "What's the investment?", value: "What's the program investment and what's included?" },
      { label: 'ROI & value', value: 'How does this compare to external alternatives?' },
      { label: 'Group rates', value: 'Do you offer group or corporate rates?' },
    ];
  }
  if (path.includes('program') || path.includes('curriculum') || path.includes('course')) {
    return [
      { label: 'What do I build?', value: 'What will I actually build during the program?' },
      { label: 'Session breakdown', value: 'Walk me through the 5 sessions.' },
      { label: 'Is this for me?', value: "I'm a technical director — is this the right fit?" },
    ];
  }
  if (path.includes('enroll') || path.includes('register') || path.includes('apply')) {
    return [
      { label: 'Secure my spot', value: 'I want to enroll in the next cohort.' },
      { label: 'When does it start?', value: 'When does the next cohort start?' },
      { label: 'Talk to advisor', value: 'Can I speak with someone before enrolling?' },
    ];
  }
  return [
    { label: 'What is this program?', value: 'What is the Enterprise AI Leadership Accelerator?' },
    { label: 'What do I leave with?', value: 'What deliverables do I leave with after the program?' },
    { label: 'Book a strategy call', value: 'I would like to book a strategy call.' },
  ];
}

/* Simple markdown-like renderer for assistant messages */
export function renderFormattedContent(text: string): React.ReactNode {
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);

  return paragraphs.map((para, pi) => {
    // Numbered list: lines starting with (1), 1., 1)
    const numberedLines = para.split('\n').filter(l => l.trim());
    const isNumberedList = numberedLines.length > 1 && numberedLines.every(l => /^\s*(\(\d+\)|\d+[\.\)])\s/.test(l));
    if (isNumberedList) {
      return (
        <ol key={pi} style={{ paddingLeft: '20px', margin: '8px 0' }}>
          {numberedLines.map((line, li) => (
            <li key={li} style={{ marginBottom: '4px' }}>
              {renderInline(line.replace(/^\s*(\(\d+\)|\d+[\.\)])\s*/, ''))}
            </li>
          ))}
        </ol>
      );
    }

    // Bullet list: lines starting with - or •
    const bulletLines = para.split('\n').filter(l => l.trim());
    const isBulletList = bulletLines.length > 1 && bulletLines.every(l => /^\s*[-•]\s/.test(l));
    if (isBulletList) {
      return (
        <ul key={pi} style={{ paddingLeft: '20px', margin: '8px 0' }}>
          {bulletLines.map((line, li) => (
            <li key={li} style={{ marginBottom: '4px' }}>
              {renderInline(line.replace(/^\s*[-•]\s*/, ''))}
            </li>
          ))}
        </ul>
      );
    }

    // Regular paragraph
    const lines = para.split('\n');
    return (
      <p key={pi} style={{ margin: '0 0 8px 0', lineHeight: '1.6' }}>
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {renderInline(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

export function renderInline(text: string): React.ReactNode {
  // Bold: **text** or __text__
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
  return parts.map((part, i) => {
    if (/^\*\*(.+)\*\*$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (/^__(.+)__$/.test(part)) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
