import { useState } from 'react';
import type { Tool } from '../../../shared/protocol';
import { Chat } from '../components/Chat';
import { DrawingCanvas } from '../components/DrawingCanvas';
import { PlayerList } from '../components/PlayerList';
import { Timer } from '../components/Timer';
import { Toolbar } from '../components/Toolbar';
import { useCountdown } from '../hooks/useNow';
import type { GameApi } from '../hooks/useGame';
import { drawStore } from '../services/drawStore';
import { socket } from '../services/socket';

const REASON_TEXT = {
  time: 'O tempo acabou!',
  all_guessed: 'Todo mundo acertou!',
  drawer_left: 'O desenhista saiu da rodada.',
  no_guessers: 'Não sobrou ninguém para adivinhar.',
} as const;

export function GamePage({ game }: { game: GameApi }) {
  const room = game.room!;
  const myId = game.session!.playerId;
  const round = room.round!;
  const me = room.players.find((p) => p.id === myId);
  const drawer = room.players.find((p) => p.id === round.drawerId);
  const nextDrawer = room.players.find((p) => p.id === round.nextDrawerId);
  const isDrawer = round.drawerId === myId;
  const inRound = room.phase === 'round';
  const result = room.roundResult;
  const nextIn = useCountdown(room.phase === 'round_end' ? game.deadline : null);

  const [color, setColor] = useState('#22223b');
  const [size, setSize] = useState(10);
  const [tool, setTool] = useState<Tool>('pen');

  const clear = () => {
    drawStore.apply({ type: 'clear' });
    socket.emit('draw:clear', {});
  };

  return (
    <main className="game">
      <header className="card game-head">
        <div className="head-info">
          <span className="pill">Sala {room.code}</span>
          <span className="pill">Rodada {round.number}/{round.total}</span>
        </div>

        <div className="head-word" aria-live="polite">
          {isDrawer && inRound && game.word ? (
            <>
              <small>Desenhe:</small>
              <strong className="secret-word">{game.word.toUpperCase()}</strong>
            </>
          ) : (
            <>
              <small>
                {inRound ? `${drawer?.nickname ?? 'Alguém'} está desenhando · ${round.wordLength} letras` : 'Fim da rodada'}
              </small>
              <strong className="mask">{inRound ? round.mask : result?.word.toUpperCase()}</strong>
            </>
          )}
        </div>

        <Timer deadline={inRound ? game.deadline : null} totalSeconds={Math.round(round.durationMs / 1000)} />
      </header>

      <div className="game-grid">
        <div className="board">
          <div className="canvas-wrap">
            <DrawingCanvas canDraw={isDrawer && inRound} color={color} size={size} tool={tool} />

            {inRound && me?.hasGuessed && <div className="flag flag-ok">Você acertou! ✅ Aguarde os outros.</div>}
            {inRound && isDrawer && <div className="flag">Sua vez de desenhar!</div>}

            {room.phase === 'round_end' && result && (
              <div className="overlay" role="dialog" aria-label="Resultado da rodada">
                <div className="overlay-card">
                  <p className="overlay-reason">{REASON_TEXT[result.reason]}</p>
                  <p>A palavra era</p>
                  <p className="reveal">{result.word.toUpperCase()}</p>
                  {result.entries.length === 0 ? (
                    <p className="empty">Ninguém acertou dessa vez.</p>
                  ) : (
                    <ul className="results">
                      {result.entries.map((e) => (
                        <li key={e.playerId}>
                          <span>{e.nickname}{e.role === 'drawer' ? ' ✏️' : ''}</span>
                          <b>+{e.points}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="next">
                    {round.number >= round.total ? 'Calculando o resultado final…' : `Próxima rodada em ${nextIn}s`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {isDrawer && inRound ? (
            <Toolbar color={color} size={size} tool={tool} onColor={setColor} onSize={setSize} onTool={setTool} onClear={clear} />
          ) : (
            <p className="card guess-hint">
              {room.phase === 'round_end'
                ? nextDrawer || round.number < round.total
                  ? 'Preparando a próxima rodada…'
                  : 'Última rodada concluída!'
                : me?.hasGuessed
                  ? 'Você já acertou. Pode conversar com quem também acertou.'
                  : 'Olhe o desenho e digite seu palpite no chat!'}
              {inRound && nextDrawer ? ` Próximo a desenhar: ${nextDrawer.nickname}.` : ''}
            </p>
          )}
        </div>

        <Chat
          messages={game.chat}
          onSend={game.sendChat}
          placeholder={isDrawer ? 'Converse com quem já acertou' : me?.hasGuessed ? 'Converse com quem já acertou' : 'Digite seu palpite'}
        />
        <PlayerList players={room.players} myId={myId} showScores />
      </div>

      <footer className="game-foot">
        <button className="btn btn-small" onClick={() => void game.leave()}>Sair da partida</button>
      </footer>
    </main>
  );
}
