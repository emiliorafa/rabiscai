import { useCountdown } from '../hooks/useNow';

export function Timer({ deadline, totalSeconds }: { deadline: number | null; totalSeconds: number }) {
  const seconds = useCountdown(deadline);
  const pct = Math.min(100, Math.max(0, (seconds / totalSeconds) * 100));
  return (
    <div
      className={`timer${seconds <= 10 && seconds > 0 ? ' timer-urgent' : ''}`}
      style={{ ['--pct' as string]: `${pct}%` }}
      role="timer"
      aria-label={`${seconds} segundos restantes`}
    >
      <span>{seconds}</span>
    </div>
  );
}
