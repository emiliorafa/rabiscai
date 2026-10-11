import type { PublicPlayer } from '../../../shared/protocol';

const AVATARS = ['var(--tomato)', 'var(--sun)', 'var(--mint)', 'var(--sky)', 'var(--grape)', '#ff8fab', '#ff9f1c', '#06d6a0'];

function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

interface Props {
  players: PublicPlayer[];
  myId: string;
  showScores: boolean;
  maxPlayers?: number;
}

export function PlayerList({ players, myId, showScores, maxPlayers }: Props) {
  const list = showScores ? [...players].sort((a, b) => b.score - a.score) : players;
  return (
    <section className="card players" aria-label="Jogadores">
      <h2 className="card-title">
        {showScores ? 'Placar' : 'Jogadores'}
        {maxPlayers ? <small>{players.length}/{maxPlayers}</small> : null}
      </h2>
      <ul>
        {list.map((p) => (
          <li key={p.id} className={`player${p.id === myId ? ' me' : ''}${p.connected ? '' : ' offline'}${p.hasGuessed ? ' guessed' : ''}`}>
            <span className="avatar" style={{ background: colorFor(p.id) }} aria-hidden="true">
              {[...p.nickname][0]?.toUpperCase()}
            </span>
            <span className="player-name">
              {p.nickname}
              {p.id === myId ? ' (você)' : ''}
              {!p.connected && <em> reconectando…</em>}
            </span>
            <span className="badges">
              {p.isHost && <span title="Anfitrião">👑</span>}
              {p.isDrawer && <span title="Desenhando">✏️</span>}
              {p.hasGuessed && <span title="Já acertou">✅</span>}
            </span>
            {showScores && <strong className="score">{p.score}</strong>}
          </li>
        ))}
      </ul>
    </section>
  );
}
