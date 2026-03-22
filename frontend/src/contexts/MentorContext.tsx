import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import portalApi from '../utils/portalApi';

export interface LLMOption {
  id: string;
  name: string;
  url: string;
  icon: string;
}

export const LLM_OPTIONS: LLMOption[] = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'bi-chat-dots' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai', icon: 'bi-lightning' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com', icon: 'bi-stars' },
  { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com', icon: 'bi-microsoft' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://perplexity.ai', icon: 'bi-search' },
  { id: 'grok', name: 'Grok', url: 'https://grok.x.ai', icon: 'bi-lightning-charge' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com', icon: 'bi-braces' },
  { id: 'mistral', name: 'Mistral', url: 'https://chat.mistral.ai', icon: 'bi-wind' },
];

export interface ImplementationTaskData {
  title: string;
  description: string;
  deliverable: string;
  requirements: string[];
  artifacts: Array<{ name: string; description: string; file_types: string[]; validation_criteria: string }>;
}

export interface LessonContext {
  lessonId: string | null;
  lessonTitle: string;
  currentSection: string;
  conceptText: string;
  promptTemplate: string;
  implementationTaskData?: ImplementationTaskData;
  workstationPrompt?: string;
  workstationTestMode?: boolean;
  resolvedVariables?: Record<string, string>;
}

export interface LearnerProfile {
  company_name?: string;
  industry?: string;
  role?: string;
  goal?: string;
  ai_maturity_level?: number;
  company_size?: string;
  full_name?: string;
  email?: string;
  title?: string;
  identified_use_case?: string;
  personalization_context_json?: Record<string, string>;
}

interface PendingMessage {
  message: string;
  contextType: string;
  displayText?: string;
}

interface MentorContextValue {
  selectedLLM: LLMOption;
  setSelectedLLMById: (id: string) => void;
  llmOptions: LLMOption[];
  lessonContext: LessonContext;
  updateLessonContext: (ctx: Partial<LessonContext>) => void;
  isMentorOpen: boolean;
  openMentorPanel: () => void;
  closeMentorPanel: () => void;
  toggleMentorPanel: () => void;
  pendingMentorMessage: PendingMessage | null;
  sendToMentor: (message: string, contextType: string, displayText?: string) => void;
  clearPendingMessage: () => void;
  pendingPromptLabMessage: string | null;
  sendToPromptLab: (prompt: string) => void;
  clearPendingPromptLabMessage: () => void;
  onMentorResponded: React.MutableRefObject<((response: string) => void) | null>;
  fireMentorResponded: (response: string) => void;
  openLLMWithPrompt: (prompt: string) => Promise<void>;
  learnerProfile: LearnerProfile | null;
  updateLearnerProfile: (data: Record<string, any>) => Promise<void>;
  buildPersonalizedPrompt: (prompt: string) => string;
}

const defaultLessonContext: LessonContext = {
  lessonId: null,
  lessonTitle: '',
  currentSection: '',
  conceptText: '',
  promptTemplate: '',
};

const MentorContext = createContext<MentorContextValue | null>(null);

export function MentorContextProvider({ children }: { children: React.ReactNode }) {
  const [selectedLLMId, setSelectedLLMId] = useState('chatgpt');
  const [lessonCtx, setLessonCtx] = useState<LessonContext>(defaultLessonContext);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingMsg, setPendingMsg] = useState<PendingMessage | null>(null);
  const [pendingLabMsg, setPendingLabMsg] = useState<string | null>(null);
  const onMentorResponded = useRef<((response: string) => void) | null>(null);
  const [learnerProfile, setLearnerProfile] = useState<LearnerProfile | null>(null);

  const selectedLLM = LLM_OPTIONS.find(l => l.id === selectedLLMId) || LLM_OPTIONS[0];

  // Fetch learner profile for personalization
  useEffect(() => {
    portalApi.get('/api/portal/curriculum/profile')
      .then(res => setLearnerProfile(res.data.profile))
      .catch(() => {});
  }, []);

  const updateLearnerProfile = useCallback(async (data: Record<string, any>) => {
    try {
      const res = await portalApi.put('/api/portal/curriculum/profile', data);
      setLearnerProfile(res.data.profile);
    } catch {}
  }, []);

  const buildPersonalizedPrompt = useCallback((prompt: string) => {
    if (!learnerProfile) return prompt;
    if (prompt.includes('[Context about me:')) return prompt;
    const ctx: string[] = [];
    if (learnerProfile.company_name) ctx.push(`Company: ${learnerProfile.company_name}`);
    if (learnerProfile.industry) ctx.push(`Industry: ${learnerProfile.industry}`);
    if (learnerProfile.role) ctx.push(`Role: ${learnerProfile.role}`);
    if (learnerProfile.goal) ctx.push(`Goal: ${learnerProfile.goal}`);
    if (learnerProfile.ai_maturity_level) ctx.push(`AI Maturity: ${learnerProfile.ai_maturity_level}/5`);
    if (learnerProfile.identified_use_case) ctx.push(`Use Case: ${learnerProfile.identified_use_case}`);
    if (learnerProfile.personalization_context_json) {
      for (const [key, val] of Object.entries(learnerProfile.personalization_context_json)) {
        if (val) ctx.push(`${key.replace(/_/g, ' ')}: ${val}`);
      }
    }
    return ctx.length > 0
      ? `[Context about me: ${ctx.join(', ')}]\n\n${prompt}`
      : prompt;
  }, [learnerProfile]);

  const updateLessonContext = useCallback((ctx: Partial<LessonContext>) => {
    setLessonCtx(prev => ({ ...prev, ...ctx }));
  }, []);

  const openMentorPanel = useCallback(() => setIsOpen(true), []);
  const closeMentorPanel = useCallback(() => setIsOpen(false), []);
  const toggleMentorPanel = useCallback(() => setIsOpen(prev => !prev), []);

  const sendToMentor = useCallback((message: string, contextType: string, displayText?: string) => {
    setPendingMsg({ message, contextType, displayText });
    setIsOpen(true);
  }, []);

  const clearPendingMessage = useCallback(() => setPendingMsg(null), []);

  const sendToPromptLab = useCallback((prompt: string) => {
    setPendingLabMsg(prompt);
  }, []);

  const clearPendingPromptLabMessage = useCallback(() => setPendingLabMsg(null), []);

  const fireMentorResponded = useCallback((response: string) => {
    onMentorResponded.current?.(response);
  }, []);

  const openLLMWithPrompt = useCallback(async (prompt: string) => {
    const personalized = buildPersonalizedPrompt(prompt);
    // Always copy to clipboard — URL query strings have length limits
    try { await navigator.clipboard.writeText(personalized); } catch {}
    const encoded = encodeURIComponent(personalized);
    const MAX_URL = 6000;
    const useClipboard = encoded.length + 50 > MAX_URL;
    if (useClipboard) {
      // Show toast telling user to paste
      const toast = document.createElement('div');
      toast.innerHTML = `
        <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;
          background:#1a365d;color:#fff;padding:14px 24px;border-radius:10px;
          box-shadow:0 4px 20px rgba(0,0,0,0.25);font-size:14px;font-weight:500;
          display:flex;align-items:center;gap:10px;max-width:440px;
          animation:toastSlideIn 0.3s ease">
          <span style="font-size:20px">📋</span>
          <div>
            <div style="font-weight:600">Prompt copied to clipboard</div>
            <div style="font-size:12px;opacity:0.85;margin-top:2px">
              ${selectedLLM.name} is opening — press <strong>Ctrl+V</strong> (or ⌘V) to paste your prompt
            </div>
          </div>
        </div>
        <style>@keyframes toastSlideIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 6000);
    }
    if (selectedLLM.id === 'chatgpt') {
      window.open(useClipboard ? 'https://chat.openai.com' : `https://chat.openai.com/?q=${encoded}`, '_blank');
    } else if (selectedLLM.id === 'claude') {
      window.open(useClipboard ? 'https://claude.ai/new' : `https://claude.ai/new?q=${encoded}`, '_blank');
    } else {
      window.open(selectedLLM.url, '_blank');
    }
  }, [selectedLLM, buildPersonalizedPrompt]);

  return (
    <MentorContext.Provider value={{
      selectedLLM,
      setSelectedLLMById: setSelectedLLMId,
      llmOptions: LLM_OPTIONS,
      lessonContext: lessonCtx,
      updateLessonContext,
      isMentorOpen: isOpen,
      openMentorPanel,
      closeMentorPanel,
      toggleMentorPanel,
      pendingMentorMessage: pendingMsg,
      sendToMentor,
      clearPendingMessage,
      pendingPromptLabMessage: pendingLabMsg,
      sendToPromptLab,
      clearPendingPromptLabMessage,
      onMentorResponded,
      fireMentorResponded,
      openLLMWithPrompt,
      learnerProfile,
      updateLearnerProfile,
      buildPersonalizedPrompt,
    }}>
      {children}
    </MentorContext.Provider>
  );
}

// Fallback context for admin preview — no-op methods, mock learner profile
const PREVIEW_FALLBACK: MentorContextValue = {
  selectedLLM: LLM_OPTIONS[0],
  setSelectedLLMById: () => {},
  llmOptions: LLM_OPTIONS,
  lessonContext: defaultLessonContext,
  updateLessonContext: () => {},
  isMentorOpen: false,
  openMentorPanel: () => {},
  closeMentorPanel: () => {},
  toggleMentorPanel: () => {},
  pendingMentorMessage: null,
  sendToMentor: () => {},
  clearPendingMessage: () => {},
  pendingPromptLabMessage: null,
  sendToPromptLab: () => {},
  clearPendingPromptLabMessage: () => {},
  onMentorResponded: { current: null },
  fireMentorResponded: () => {},
  openLLMWithPrompt: async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); } catch {}
    const encoded = encodeURIComponent(prompt);
    window.open(encoded.length + 40 < 6000 ? `https://chat.openai.com/?q=${encoded}` : 'https://chat.openai.com', '_blank');
  },
  learnerProfile: {
    company_name: 'Preview Corp',
    industry: 'Technology',
    role: 'Director of Strategy',
    goal: 'Implement AI Strategy',
    ai_maturity_level: 3,
    identified_use_case: 'Process Automation',
  },
  updateLearnerProfile: async () => {},
  buildPersonalizedPrompt: (p: string) => p,
};

/** Lightweight provider for admin preview — real LLM state, mock learner profile, no portalApi */
export function AdminPreviewMentorProvider({ children }: { children: React.ReactNode }) {
  const [selectedLLMId, setSelectedLLMId] = useState('chatgpt');
  const selectedLLM = LLM_OPTIONS.find(l => l.id === selectedLLMId) || LLM_OPTIONS[0];
  const onMentorResponded = useRef<((response: string) => void) | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [pendingMsg, setPendingMsg] = useState<PendingMessage | null>(null);

  const sendToMentor = useCallback((message: string, contextType: string, displayText?: string) => {
    setPendingMsg({ message, contextType, displayText });
    setIsOpen(true);
  }, []);

  const clearPendingMessage = useCallback(() => setPendingMsg(null), []);

  const openLLMWithPrompt = useCallback(async (prompt: string) => {
    try { await navigator.clipboard.writeText(prompt); } catch {}
    const encoded = encodeURIComponent(prompt);
    const MAX_URL = 6000;
    const useClipboard = encoded.length + 50 > MAX_URL;
    if (useClipboard) {
      const toast = document.createElement('div');
      toast.innerHTML = `
        <div style="position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;
          background:#1a365d;color:#fff;padding:14px 24px;border-radius:10px;
          box-shadow:0 4px 20px rgba(0,0,0,0.25);font-size:14px;font-weight:500;
          display:flex;align-items:center;gap:10px;max-width:440px;
          animation:toastSlideIn 0.3s ease">
          <span style="font-size:20px">📋</span>
          <div>
            <div style="font-weight:600">Prompt copied to clipboard</div>
            <div style="font-size:12px;opacity:0.85;margin-top:2px">
              ${selectedLLM.name} is opening — press <strong>Ctrl+V</strong> (or ⌘V) to paste your prompt
            </div>
          </div>
        </div>
        <style>@keyframes toastSlideIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style>
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 6000);
    }
    if (selectedLLM.id === 'chatgpt') {
      window.open(useClipboard ? 'https://chat.openai.com' : `https://chat.openai.com/?q=${encoded}`, '_blank');
    } else if (selectedLLM.id === 'claude') {
      window.open(useClipboard ? 'https://claude.ai/new' : `https://claude.ai/new?q=${encoded}`, '_blank');
    } else {
      window.open(selectedLLM.url, '_blank');
    }
  }, [selectedLLM]);

  return (
    <MentorContext.Provider value={{
      selectedLLM,
      setSelectedLLMById: setSelectedLLMId,
      llmOptions: LLM_OPTIONS,
      lessonContext: defaultLessonContext,
      updateLessonContext: () => {},
      isMentorOpen: isOpen,
      openMentorPanel: useCallback(() => setIsOpen(true), []),
      closeMentorPanel: useCallback(() => setIsOpen(false), []),
      toggleMentorPanel: useCallback(() => setIsOpen(prev => !prev), []),
      pendingMentorMessage: pendingMsg,
      sendToMentor,
      clearPendingMessage,
      pendingPromptLabMessage: null,
      sendToPromptLab: () => {},
      clearPendingPromptLabMessage: () => {},
      onMentorResponded,
      fireMentorResponded: useCallback((response: string) => {
        onMentorResponded.current?.(response);
      }, []),
      openLLMWithPrompt,
      learnerProfile: {
        company_name: 'Preview Corp',
        industry: 'Technology',
        role: 'Director of Strategy',
        goal: 'Implement AI Strategy',
        ai_maturity_level: 3,
        company_size: '250-999',
        identified_use_case: 'Process Automation',
      },
      updateLearnerProfile: async () => {},
      buildPersonalizedPrompt: (p: string) => p,
    }}>
      {children}
    </MentorContext.Provider>
  );
}

export function useMentorContext() {
  const ctx = useContext(MentorContext);
  if (!ctx) {
    return PREVIEW_FALLBACK;
  }
  return ctx;
}
