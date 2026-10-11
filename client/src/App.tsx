import { ConnectionBanner } from './components/ConnectionBanner';
import { Toast } from './components/Toast';
import { useGame } from './hooks/useGame';
import { EndPage } from './pages/EndPage';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { LobbyPage } from './pages/LobbyPage';

export default function App() {
  const game = useGame();
  const { room, session } = game;

  let page;
  if (game.restoring && !room) {
    page = (
      <main className="loading">
        <span className="spinner big" aria-hidden="true" />
        <p>Voltando para a sua sala…</p>
      </main>
    );
  } else if (!room || !session) {
    page = <HomePage game={game} />;
  } else if (room.phase === 'lobby') {
    page = <LobbyPage game={game} />;
  } else if (room.phase === 'game_end') {
    page = <EndPage game={game} />;
  } else {
    page = <GamePage game={game} />;
  }

  return (
    <>
      <ConnectionBanner status={game.status} />
      {page}
      <Toast message={game.toast} onClose={game.dismissToast} />
    </>
  );
}
