import { useState, useEffect, useCallback } from 'react';
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

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<AvailabilityResponse>('/api/calendar/availability?days=21');
      setDates(res.data.dates);
    } catch {
      setError('Unable to load available times. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { dates, loading, error, refetch: fetch };
}
