import { useEffect, useState, type FormEvent } from 'react';
import { MAX_NICKNAME, ROOM_CODE_LENGTH, normalizeRoomCode, validateNickname } from '../../../shared/protocol';
import { Logo } from '../components/Logo';
import type { GameApi } from '../hooks/useGame';
import { loadNickname } from '../services/session';

type Busy = null | 'play' | 'join' | 'create';
type Peek = { state: 'loading' } | { state: 'ok'; text: string } | { state: 'error'; text: string } | null;

const PHASE_TEXT: Record<string, string> = {
  lobby: 'aguardando no lobby',
  round: 'partida em andamento',
  round_end: 'partida em andamento',
  game_end: 'partida terminando',
};

export function HomePage({ game }: { game: GameApi }) {
  const [nickname, setNickname] = useState(loadNickname());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [peek, setPeek] = useState<Peek>(null);
  const online = game.status === 'connected';

  // Mostra quantos jogadores há na sala assim que o código estiver completo.
  useEffect(() => {
    const normalized = normalizeRoomCode(code);
    if (!normalized || !online) {
      setPeek(null);
      return;
    }
    let cancelled = false;
    setPeek({ state: 'loading' });
    const id = setTimeout(async () => {
      const res = await game.peekRoom(normalized);
      if (cancelled) return;
      if (res.ok) {
        setPeek({ state: 'ok', text: `Sala ${res.code}: ${res.players}/${res.maxPlayers} jogadores · ${PHASE_TEXT[res.phase] ?? res.phase}` });
      } else {
        setPeek({ state: 'error', text: res.error });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, online]);

  async function run(kind: Exclude<Busy, null>, action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    const nick = validateNickname(nickname);
    if (!nick.ok) {
      setError(nick.error);
      return;
    }
    if (kind === 'join' && !normalizeRoomCode(code)) {
      setError(`Digite o código da sala (${ROOM_CODE_LENGTH} letras ou números).`);
      return;
    }
    setBusy(kind);
    const res = await action();
    setBusy(null);
    if (!res.ok) setError(res.error ?? 'Não foi possível entrar.');
  }

  const nick = nickname.trim();
  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    void run('join', () => game.joinRoom(code, nick));
  };

  return (
    <main className="home">
      <div className="hero">
        <Logo />
        <p className="tagline">Um desenha, todo mundo chuta. Sem cadastro, só um apelido.</p>
      </div>

      <div className="card home-card">
        <label className="field">
          <span>Seu apelido</span>
          <input
            value={nickname}
            maxLength={MAX_NICKNAME}
            onChange={(e) => {
              setNickname(e.target.value);
              setError(null);
            }}
            placeholder="Ex.: Picasso"
            autoComplete="nickname"
          />
        </label>

        <button className="btn btn-big btn-sun" disabled={!online || busy !== null} onClick={() => void run('play', () => game.quickPlay(nick))}>
          {busy === 'play' ? 'Procurando sala…' : 'Jogar'}
        </button>
        <p className="hint">Entra numa sala aberta ou cria uma nova para você.</p>

        <div className="divider"><span>ou jogue com amigos</span></div>

        <form onSubmit={onJoin} className="join-row">
          <label className="field grow">
            <span>Código da sala</span>
            <input
              className="code-input"
              value={code}
              maxLength={ROOM_CODE_LENGTH}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''));
                setError(null);
              }}
              placeholder="ABCDE"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          <button className="btn btn-sky" type="submit" disabled={!online || busy !== null}>
            {busy === 'join' ? 'Entrando…' : 'Entrar em uma sala'}
          </button>
        </form>
        {peek && (
          <p className={`peek peek-${peek.state}`} role="status">
            {peek.state === 'loading' ? 'Procurando sala…' : peek.text}
          </p>
        )}

        <button className="btn btn-mint" disabled={!online || busy !== null} onClick={() => void run('create', () => game.createRoom(nick))}>
          {busy === 'create' ? 'Criando…' : 'Criar sala'}
        </button>

        <p className="field-error" role="alert">{error}</p>
      </div>
    </main>
  );
}
