import type { Emitter, Player, RoomConfig } from '../src/game/Room';

export interface Sent {
  target: 'room' | 'player' | 'except';
  playerId?: string;
  event: string;
  payload: any;
}

export function fakeEmitter() {
  const sent: Sent[] = [];
  const emitter: Emitter = {
    room: (event, payload) => void sent.push({ target: 'room', event, payload }),
    player: (p: Player, event, payload) => void sent.push({ target: 'player', playerId: p.id, event, payload }),
    except: (p: Player, event, payload) => void sent.push({ target: 'except', playerId: p.id, event, payload }),
  };
  return { sent, emitter };
}

/** Palavras determinísticas: usa a lista na ordem. */
export function sequentialWords(words: string[]) {
  let i = 0;
  return () => words[i++ % words.length];
}

export const testConfig = (over: Partial<RoomConfig> = {}): RoomConfig => ({
  roundMs: 90_000,
  intermissionMs: 5_000,
  graceMs: 10_000,
  maxPlayers: 10,
  roundsPerPlayer: 2,
  pickWord: sequentialWords(['Banana', 'Cachorro', 'Pizza', 'Árvore']),
  ...over,
});
