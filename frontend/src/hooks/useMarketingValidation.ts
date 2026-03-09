import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { runAllAgents, type OrchestratedReport } from '../agents/agentOrchestrator';
import { storeReport, getHealthScore } from '../services/validationStore';
import { PUBLIC_ROUTES } from '../config/marketingBlueprint';

const SCAN_DELAY_MS = 1500;

export function useMarketingValidation() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [lastReport, setLastReport] = useState<OrchestratedReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [healthScore, setHealthScore] = useState(() => getHealthScore());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerScan = useCallback(() => {
    if (!isAuthenticated) return;

    const route = location.pathname;
    // Only scan public routes
    if (!PUBLIC_ROUTES.includes(route) && route !== location.pathname) return;

    setIsScanning(true);

    const run = () => {
      try {
        const report = runAllAgents(route);
        storeReport(report);
        setLastReport(report);
        setHealthScore(getHealthScore());
      } finally {
        setIsScanning(false);
      }
    };

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 5000 });
    } else {
      setTimeout(run, 100);
    }
  }, [isAuthenticated, location.pathname]);

  // Auto-scan on route change for authenticated admins
  useEffect(() => {
    if (!isAuthenticated) return;

    const route = location.pathname;
    // Only scan known public routes
    if (!PUBLIC_ROUTES.includes(route)) return;

    // Debounce: wait for page to render
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(triggerScan, SCAN_DELAY_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isAuthenticated, location.pathname, triggerScan]);

  return { lastReport, isScanning, healthScore, triggerScan };
}
