import { useEffect, useState } from 'react';

/** Força re-render a cada `intervalMs` e devolve Date.now(). */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Segundos restantes até um prazo (hora local). */
export function useCountdown(deadline: number | null): number {
  const now = useNow(250);
  return deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
}
