import { useCallback, useState } from 'react';
import type { ChatItem } from './CoraChat';
import type { OptionCard } from './OptionCards';

/**
 * Career Prep v27: the room's chat log. Cora lines, the student's lines, card sets (marked answered once
 * one is picked, so only the newest set stays live) and insight blocks.
 */
let seq = 0;
const nid = (p: string) => `${p}-${++seq}`;
export const cora = (text: string): ChatItem => ({ id: nid('c'), kind: 'cora', text });
export const me = (text: string): ChatItem => ({ id: nid('m'), kind: 'me', text });
export const cards = (label: string, list: OptionCard[]): ChatItem => ({ id: nid('s'), kind: 'cards', label, cards: list });
export const block = (title: string, lines: string[]): ChatItem => ({ id: nid('b'), kind: 'block', title, lines });

export function useRoomLog(): { log: ChatItem[]; push: (...items: ChatItem[]) => void; answer: (setId: string) => void } {
  const [log, setLog] = useState<ChatItem[]>([]);
  const push = useCallback((...items: ChatItem[]) => setLog((l) => [...l, ...items]), []);
  const answer = useCallback((setId: string) => setLog((l) => l.map((i) => (i.id === setId && i.kind === 'cards' ? { ...i, answered: true } : i))), []);
  return { log, push, answer };
}
