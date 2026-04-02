import { useState, useCallback } from 'react';
import api from '../utils/api';

interface TimeSlot {
  start: string;
  end: string;
}

interface DateSlots {
  date: string;
  slots: TimeSlot[];
}

interface AvailabilityResponse {
  dates: DateSlots[];
}

export function useCalendarAvailability() {
  const [dates, setDates] = useState<DateSlots[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fetched, setFetched] = useState(false);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<AvailabilityResponse>('/api/calendar/availability?days=21');
      setDates(res.data.dates);
      setFetched(true);
    } catch {
      setError('Unable to load available times. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Called when modal opens — fetches only if not already loaded
  const ensureLoaded = useCallback(() => {
    if (!fetched) {
      fetchAvailability();
    }
  }, [fetched, fetchAvailability]);

  return { dates, loading, error, refetch: fetchAvailability, ensureLoaded };
}
