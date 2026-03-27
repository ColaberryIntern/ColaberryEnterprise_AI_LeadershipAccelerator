import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import {
  getOpenclawDashboard,
  getOpenclawResponses,
  getOpenclawConfig,
  getTrackedLinkedInPosts,
  getLinkedInSessionStatus,
  getFacebookSessionStatus,
  getConfiguredFacebookGroups,
  getRedditSessionStatus,
  getOpenclawActions,
  type OpenclawDashboard,
  type OpenclawResponseItem,
  type ActionItem,
  type TrackedLinkedInPost,
  type FacebookGroupConfig,
} from '../../../../../services/openclawApi';

// ── Context Shape ────────────────────────────────────────────────────────────

interface OpenclawContextValue {
  // Core dashboard data
  dashboard: OpenclawDashboard | null;
  loading: boolean;
  fetchData: () => Promise<void>;

  // Action queue
  actionItems: ActionItem[];
  actionsLoading: boolean;

  // Session statuses
  linkedinSessionOk: boolean | null;
  fbSessionOk: boolean | null;
  redditSessionOk: boolean | null;

  // Tracked LinkedIn posts
  trackedPosts: TrackedLinkedInPost[];

  // Facebook group config (shared across tabs)
  fbConfiguredGroups: FacebookGroupConfig;
  fbSelectedGroupIds: Set<string>;
  setFbConfiguredGroups: React.Dispatch<React.SetStateAction<FacebookGroupConfig>>;
  setFbSelectedGroupIds: React.Dispatch<React.SetStateAction<Set<string>>>;

  // Responses
  responses: OpenclawResponseItem[];
  responsesTotal: number;
  automatedTotal: number;
  manualTotal: number;
  responsePage: number;
  responseFilter: string;
  responseView: 'automated' | 'manual';
  setResponsePage: React.Dispatch<React.SetStateAction<number>>;
  setResponseFilter: React.Dispatch<React.SetStateAction<string>>;
  setResponseView: React.Dispatch<React.SetStateAction<'automated' | 'manual'>>;

  // Governance config (loaded on mount)
  requireApproval: boolean;
  autoPostDevto: boolean;
  activePlatforms: string[];
  setRequireApproval: React.Dispatch<React.SetStateAction<boolean>>;
  setAutoPostDevto: React.Dispatch<React.SetStateAction<boolean>>;
  setActivePlatforms: React.Dispatch<React.SetStateAction<string[]>>;
}

const OpenclawContext = createContext<OpenclawContextValue | null>(null);

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useOpenclawContext(): OpenclawContextValue {
  const ctx = useContext(OpenclawContext);
  if (!ctx) {
    throw new Error('useOpenclawContext must be used within an <OpenclawProvider>');
  }
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

const RESPONSES_PER_PAGE = 25;

export function OpenclawProvider({ children }: { children: ReactNode }) {
  // Core state
  const [dashboard, setDashboard] = useState<OpenclawDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  // Responses
  const [responses, setResponses] = useState<OpenclawResponseItem[]>([]);
  const [responsesTotal, setResponsesTotal] = useState(0);
  const [automatedTotal, setAutomatedTotal] = useState(0);
  const [manualTotal, setManualTotal] = useState(0);
  const [responsePage, setResponsePage] = useState(1);
  const [responseFilter, setResponseFilter] = useState('');
  const [responseView, setResponseView] = useState<'automated' | 'manual'>('automated');

  // Action queue
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [actionsLoading, setActionsLoading] = useState(true);

  // Session statuses
  const [linkedinSessionOk, setLinkedinSessionOk] = useState<boolean | null>(null);
  const [fbSessionOk, setFbSessionOk] = useState<boolean | null>(null);
  const [redditSessionOk, setRedditSessionOk] = useState<boolean | null>(null);

  // Tracked LinkedIn posts
  const [trackedPosts, setTrackedPosts] = useState<TrackedLinkedInPost[]>([]);

  // Facebook group config
  const [fbConfiguredGroups, setFbConfiguredGroups] = useState<FacebookGroupConfig>({ target_groups: [], enabled: false });
  const [fbSelectedGroupIds, setFbSelectedGroupIds] = useState<Set<string>>(new Set());

  // Governance config
  const [requireApproval, setRequireApproval] = useState(true);
  const [autoPostDevto, setAutoPostDevto] = useState(false);
  const [activePlatforms, setActivePlatforms] = useState<string[]>([
    'reddit', 'hackernews', 'devto', 'hashnode', 'discourse',
    'twitter', 'bluesky', 'youtube', 'producthunt', 'facebook_groups', 'linkedin_comments',
  ]);

  // ── Fetch callback ───────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const params: Record<string, string> = {
        page: String(responsePage),
        limit: String(RESPONSES_PER_PAGE),
      };
      if (responseFilter) params.post_status = responseFilter;
      params.execution_type = responseView === 'manual' ? 'human_execution' : 'api_posting';

      // Fetch total counts for both tabs (no status filter — show all items)
      const otherCountParams: Record<string, string> = { page: '1', limit: '1' };
      otherCountParams.execution_type = responseView === 'manual' ? 'api_posting' : 'human_execution';
      const currentCountParams: Record<string, string> = { page: '1', limit: '1' };
      currentCountParams.execution_type = responseView === 'manual' ? 'human_execution' : 'api_posting';

      const [dashRes, respRes, otherCountRes, currentCountRes] = await Promise.all([
        getOpenclawDashboard(),
        getOpenclawResponses(params),
        getOpenclawResponses(otherCountParams),
        getOpenclawResponses(currentCountParams),
      ]);

      setDashboard(dashRes.data);
      setResponses(respRes.data.responses || []);
      setResponsesTotal(respRes.data.total || 0);

      // Badge counts show total items per tab
      if (responseView === 'automated') {
        setAutomatedTotal(currentCountRes.data.total || 0);
        setManualTotal(otherCountRes.data.total || 0);
      } else {
        setManualTotal(currentCountRes.data.total || 0);
        setAutomatedTotal(otherCountRes.data.total || 0);
      }

      // Fetch tracked LinkedIn posts + session statuses + Facebook config + Reddit session
      try {
        const [trackedRes, sessionRes, fbSessionRes, fbConfigRes, redditRes] = await Promise.all([
          getTrackedLinkedInPosts(),
          getLinkedInSessionStatus(),
          getFacebookSessionStatus().catch(() => ({ data: { authenticated: false } })),
          getConfiguredFacebookGroups().catch(() => ({ data: { target_groups: [], enabled: false } })),
          getRedditSessionStatus().catch(() => ({ data: { authenticated: false, username: '', message: '' } })),
        ]);
        setTrackedPosts(trackedRes.data.tracked_posts || []);
        setLinkedinSessionOk(sessionRes.data.authenticated);
        setFbSessionOk(fbSessionRes.data.authenticated);
        setFbConfiguredGroups(fbConfigRes.data);
        setFbSelectedGroupIds(new Set(fbConfigRes.data.target_groups?.map((g: any) => g.id) || []));
        setRedditSessionOk(redditRes.data.authenticated);
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [responseFilter, responsePage, responseView]);

  // ── Data fetch + 30-second refresh interval ──────────────────────────────

  useEffect(() => {
    setLoading(true);
    fetchData();
    getOpenclawActions()
      .then(res => setActionItems(res.data.actions || []))
      .catch(() => {})
      .finally(() => setActionsLoading(false));

    const interval = setInterval(() => {
      fetchData();
      getOpenclawActions()
        .then(res => setActionItems(res.data.actions || []))
        .catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Governance config fetch on mount ─────────────────────────────────────

  useEffect(() => {
    getOpenclawConfig()
      .then(res => {
        const agents = res.data.agents || [];
        const content = agents.find((a: any) => a.agent_name === 'OpenclawContentResponseAgent');
        const worker = agents.find((a: any) => a.agent_name === 'OpenclawBrowserWorkerAgent');
        const scanner = agents.find((a: any) => a.agent_name === 'OpenclawMarketSignalAgent');
        if (content?.config?.require_approval !== undefined) setRequireApproval(content.config.require_approval);
        if (worker) setAutoPostDevto(worker.enabled);
        if (scanner?.config?.platforms) setActivePlatforms(scanner.config.platforms);
      })
      .catch(() => {});
  }, []);

  // ── Provide value ────────────────────────────────────────────────────────

  const value: OpenclawContextValue = {
    dashboard,
    loading,
    fetchData,
    actionItems,
    actionsLoading,
    linkedinSessionOk,
    fbSessionOk,
    redditSessionOk,
    trackedPosts,
    fbConfiguredGroups,
    fbSelectedGroupIds,
    setFbConfiguredGroups,
    setFbSelectedGroupIds,
    responses,
    responsesTotal,
    automatedTotal,
    manualTotal,
    responsePage,
    responseFilter,
    responseView,
    setResponsePage,
    setResponseFilter,
    setResponseView,
    requireApproval,
    autoPostDevto,
    activePlatforms,
    setRequireApproval,
    setAutoPostDevto,
    setActivePlatforms,
  };

  return (
    <OpenclawContext.Provider value={value}>
      {children}
    </OpenclawContext.Provider>
  );
}

export { OpenclawContext };
export default OpenclawProvider;
