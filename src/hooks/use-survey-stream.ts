"use client";

import { useEffect, useState } from "react";

export type StreamActivity = {
  id: string;
  name: string;
  maxCapacity: number;
  currentCount: number;
  remaining: number;
  isFull: boolean;
};

export function useSurveyStream(surveyId: string, enabled = true) {
  const [activities, setActivities] = useState<StreamActivity[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !surveyId) return;

    const es = new EventSource(`/api/surveys/${surveyId}/stream`);

    es.onopen = () => setConnected(true);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.activities) setActivities(data.activities);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      setConnected(false);
    };
  }, [surveyId, enabled]);

  return { activities, connected };
}
