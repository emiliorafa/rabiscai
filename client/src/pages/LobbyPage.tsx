import { useState } from 'react';
import { Chat } from '../components/Chat';
import { Logo } from '../components/Logo';
import { PlayerList } from '../components/PlayerList';
import type { GameApi } from '../hooks/useGame';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  }
}

export function LobbyPage({ game }: { game: GameApi }) {
  const room = game.room!;
  const myId = game.session!.playerId;
  const isHost = room.hostId === myId;
  const connected = room.players.filter((p) => p.connected).length;
  const canStart = connected >= 2;
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    const ok = await copyText(room.code);
    setCopied(ok);
    if (!ok) setError('Não deu para copiar. Selecione o código e copie manualmente.');
    setTimeout(() => setCopied(false), 2000);
  }

  async function start() {
    setStarting(true);
    setError(null);
    const res = await game.startGame();
    setStarting(false);
    if (!res.ok) setError(res.error);
  }

  return (
    <main className="lobby">
      <header className="lobby-head">
        <Logo size="sm" />
        <button className="btn btn-small" onClick={() => void game.leave()}>Sair da sala</button>
      </header>

      <div className="lobby-grid">
        <section className="card code-card">
          <h2 className="card-title">Código da sala</h2>
          <p className="room-code" aria-label={`Código ${room.code.split('').join(' ')}`}>{room.code}</p>
          <button className="btn btn-sun" onClick={() => void copy()}>{copied ? 'Copiado! ✓' : 'Copiar código'}</button>
          <p className="hint">Passe o código para seus amigos e peça para usarem “Entrar em uma sala”.</p>

          {isHost ? (
            <>
              <button className="btn btn-big btn-mint" disabled={!canStart || starting} onClick={() => void start()}>
                {starting ? 'Iniciando…' : 'Iniciar partida'}
              </button>
              {!canStart && <p className="hint">Falta gente! São necessários pelo menos 2 jogadores conectados.</p>}
            </>
          ) : (
            <p className="waiting">Aguardando o anfitrião iniciar a partida…</p>
          )}
          <p className="field-error" role="alert">{error}</p>
        </section>

        <PlayerList players={room.players} myId={myId} showScores={false} maxPlayers={room.maxPlayers} />
        <Chat messages={game.chat} onSend={game.sendChat} placeholder="Diga oi para a turma" title="Chat" />
      </div>
    </main>
  );
}
