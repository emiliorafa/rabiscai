const COLORS = ['var(--tomato)', 'var(--sun)', 'var(--mint)', 'var(--sky)', 'var(--grape)'];
const TILTS = [-4, 3, -2, 4, -3, 2, -4, 3];

/** Nome do jogo, escrito como se cada letra fosse feita com uma canetinha diferente. */
export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <h1 className={`logo logo-${size}`} aria-label="Rabiscaí">
      {[...'Rabiscaí'].map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ color: COLORS[i % COLORS.length], transform: `rotate(${TILTS[i % TILTS.length]}deg)` }}>
          {ch}
        </span>
      ))}
    </h1>
  );
}
