import { useState } from 'react';
import { Logo } from '../components/Logo';
import type { GameApi } from '../hooks/useGame';

const MEDALS = ['🥇', '🥈', '🥉'];

export function EndPage({ game }: { game: GameApi }) {
  const room = game.room!;
  const myId = game.session!.playerId;
  const isHost = room.hostId === myId;
  const final = room.final;
  const [busy, setBusy] = useState<'again' | 'lobby' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!final) return null;
  const winners = final.ranking.filter((r) => final.winnerIds.includes(r.playerId));

  async function act(kind: 'again' | 'lobby') {
    setBusy(kind);
    setError(null);
    const res = await (kind === 'again' ? game.startGame() : game.backToLobby());
    setBusy(null);
    if (!res.ok) setError(res.error);
  }

  return (
    <main className="end">
      <Logo size="sm" />
      <section className="card end-card">
        <p className="trophy" aria-hidden="true">🏆</p>
        <h2 className="winner">
          {winners.length > 1 ? `Empate entre ${winners.map((w) => w.nickname).join(' e ')}!` : `${winners[0]?.nickname} venceu!`}
        </h2>

        <ol className="ranking" aria-label="Classificação final">
          {final.ranking.map((r) => (
            <li key={r.playerId} className={r.playerId === myId ? 'me' : ''}>
              <span className="pos">{MEDALS[r.rank - 1] ?? `${r.rank}º`}</span>
              <span className="rname">{r.nickname}{r.playerId === myId ? ' (você)' : ''}</span>
              <strong>{r.score} pts</strong>
            </li>
          ))}
        </ol>

        {isHost ? (
          <div className="end-actions">
            <button className="btn btn-big btn-mint" disabled={busy !== null} onClick={() => void act('again')}>
              {busy === 'again' ? 'Iniciando…' : 'Jogar novamente'}
            </button>
            <button className="btn btn-sky" disabled={busy !== null} onClick={() => void act('lobby')}>
              {busy === 'lobby' ? 'Voltando…' : 'Voltar ao lobby'}
            </button>
          </div>
        ) : (
          <p className="waiting">Aguardando o anfitrião escolher: jogar novamente ou voltar ao lobby.</p>
        )}
        <button className="btn btn-small" onClick={() => void game.leave()}>Sair da sala</button>
        <p className="field-error" role="alert">{error}</p>
      </section>
    </main>
  );
}
