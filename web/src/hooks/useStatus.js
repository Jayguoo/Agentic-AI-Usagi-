import { useState, useEffect, useCallback, useRef } from "react";
import { getStatus } from "../api";

export default function useStatus() {
  const [status, setStatus] = useState({
    memoryFacts: 0,
    openTasks: 0,
    pendingActions: 0,
    skills: 0,
    actions: [],
    recentRuns: [],
    ready: false,
  });
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    try {
      const data = await getStatus();
      if (mountedRef.current) {
        setStatus(data);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current) setError(e.message);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetch();
    const id = setInterval(fetch, 15000);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetch]);

  return { status, error, refresh: fetch };
}
