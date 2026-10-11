import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room, type Player } from '../src/game/Room';
import { fakeEmitter, testConfig } from './helpers';

function setup(players: string[], config = testConfig()) {
  const { sent, emitter } = fakeEmitter();
  const room = new Room('ABCDE', false, emitter, config);
  const joined: Player[] = players.map((name, i) => {
    const r = room.addPlayer(name, `sock-${name}`);
    if (!r.ok) throw new Error(r.error);
    return r.player;
  });
  return { room, sent, joined };
}

const drawerOf = (room: Room) => room.players.find((p) => room.publicState().round?.drawerId === p.id)!;
const score = (room: Room, name: string) => room.players.find((p) => p.nickname === name)!.score;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('salas e anfitrião', () => {
  it('primeiro jogador é anfitrião; anfitrião que sai transfere a função', () => {
    const { room, joined } = setup(['Ana', 'Beto', 'Caio']);
    expect(room.hostId).toBe(joined[0].id);
    room.removePlayer(joined[0].id);
    expect(room.hostId).toBe(joined[1].id);
    expect(room.publicState().players.find((p) => p.isHost)?.nickname).toBe('Beto');
  });

  it('anfitrião que desconecta também transfere a função', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.disconnect(joined[0].id, 'sock-Ana');
    expect(room.hostId).toBe(joined[1].id);
  });

  it('rejeita apelido repetido, inválido e sala cheia', () => {
    const { room } = setup(['Ana']);
    expect(room.addPlayer('ana', 's').ok).toBe(false);
    expect(room.addPlayer('', 's').ok).toBe(false);
    const full = setup(['A1', 'A2'], testConfig({ maxPlayers: 2 }));
    expect(full.room.addPlayer('A3', 's').ok).toBe(false);
  });

  it('sala é descartada quando o último jogador sai', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    const onEmpty = vi.fn();
    room.onEmpty = onEmpty;
    room.removePlayer(joined[0].id);
    expect(onEmpty).not.toHaveBeenCalled();
    room.removePlayer(joined[1].id);
    expect(onEmpty).toHaveBeenCalledOnce();
  });

  it('jogador desconectado é removido após o período de tolerância, e pode voltar antes disso', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.disconnect(joined[1].id, 'sock-Beto');
    vi.advanceTimersByTime(5_000);
    expect(room.players).toHaveLength(2);
    const back = room.reconnect(joined[1].token, 'sock-novo');
    expect(back.ok).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(room.players).toHaveLength(2);

    room.disconnect(joined[1].id, 'sock-novo');
    vi.advanceTimersByTime(10_001);
    expect(room.players).toHaveLength(1);
  });

  it('desconexão de socket antigo não derruba quem já reconectou', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.reconnect(joined[1].token, 'sock-novo');
    room.disconnect(joined[1].id, 'sock-Beto'); // socket antigo
    expect(room.getPlayer(joined[1].id)?.connected).toBe(true);
  });

  it('token errado não reconecta', () => {
    const { room } = setup(['Ana']);
    expect(room.reconnect('token-falso', 's').ok).toBe(false);
  });
});

describe('início da partida', () => {
  it('só o anfitrião inicia e só com 2+ jogadores', () => {
    const { room, joined } = setup(['Ana']);
    expect(room.startGame(joined[0].id)).toMatchObject({ ok: false });
    const two = setup(['Ana', 'Beto']);
    expect(two.room.startGame(two.joined[1].id)).toMatchObject({ ok: false });
    expect(two.room.startGame(two.joined[0].id)).toMatchObject({ ok: true });
    expect(two.room.phase).toBe('round');
    expect(two.room.startGame(two.joined[0].id)).toMatchObject({ ok: false }); // já em andamento
  });

  it('palavra vai só ao desenhista e nunca aparece no estado público', () => {
    const { room, sent, joined } = setup(['Ana', 'Beto', 'Caio']);
    room.startGame(joined[0].id);
    const drawer = drawerOf(room);

    const wordEvents = sent.filter((s) => s.event === 'round:word');
    expect(wordEvents).toHaveLength(1);
    expect(wordEvents[0]).toMatchObject({ target: 'player', playerId: drawer.id, payload: { word: 'Banana' } });

    const serialized = JSON.stringify(sent.filter((s) => s.target !== 'player' || s.event !== 'round:word'));
    expect(serialized).not.toContain('Banana');
    expect(room.publicState().round?.mask).toBe('_ _ _ _ _ _');
  });

  it('total de rodadas = 2 por jogador presente no início', () => {
    const { room, joined } = setup(['Ana', 'Beto', 'Caio']);
    room.startGame(joined[0].id);
    expect(room.publicState().round?.total).toBe(6);
  });
});

describe('palpites e pontuação', () => {
  function started() {
    const ctx = setup(['Ana', 'Beto', 'Caio', 'Duda']);
    ctx.room.startGame(ctx.joined[0].id);
    const drawer = drawerOf(ctx.room);
    const guessers = ctx.joined.filter((p) => p.id !== drawer.id);
    return { ...ctx, drawer, guessers };
  }

  it('1º ganha 100, 2º ganha 70, 3º ganha 50 e o desenhista 50 (uma vez)', () => {
    const { room, drawer, guessers } = started();
    room.submitMessage(guessers[0].id, 'banana');
    room.submitMessage(guessers[1].id, ' BANANA ');
    expect(guessers[0].score).toBe(100);
    expect(guessers[1].score).toBe(70);
    expect(drawer.score).toBe(50);
    room.submitMessage(guessers[2].id, 'Banana');
    expect(guessers[2].score).toBe(50);
    expect(drawer.score).toBe(50);
  });

  it('não pontua duas vezes o mesmo jogador na rodada', () => {
    const { room, guessers } = started();
    room.submitMessage(guessers[0].id, 'banana');
    room.submitMessage(guessers[0].id, 'banana');
    room.submitMessage(guessers[0].id, 'banana');
    expect(guessers[0].score).toBe(100);
  });

  it('desenhista não pontua enviando palpite e não pode revelar a palavra', () => {
    const { room, drawer } = started();
    const r = room.submitMessage(drawer.id, 'banana');
    expect(r.ok).toBe(false);
    expect(drawer.score).toBe(0);
    expect(room.publicState().players.some((p) => p.hasGuessed)).toBe(false);
  });

  it('palpite correto não aparece como texto para os demais', () => {
    const { room, sent, guessers } = started();
    room.submitMessage(guessers[0].id, 'banana');
    const msgs = sent.filter((s) => s.event === 'room:chat').map((s) => s.payload);
    const correct = msgs.find((m) => m.kind === 'correct');
    expect(correct.text).toContain('acertou');
    expect(correct.text.toLowerCase()).not.toContain('banana');
    expect(msgs.some((m) => m.kind === 'chat' && m.text === 'banana')).toBe(false);
  });

  it('quem já acertou só conversa com quem acertou e com o desenhista', () => {
    const { room, sent, drawer, guessers } = started();
    room.submitMessage(guessers[0].id, 'banana');
    sent.length = 0;
    expect(room.submitMessage(guessers[0].id, 'é amarela').ok).toBe(true);
    const chats = sent.filter((s) => s.event === 'room:chat');
    expect(chats.every((c) => c.target === 'player')).toBe(true);
    expect(chats.map((c) => c.playerId).sort()).toEqual([drawer.id, guessers[0].id].sort());
    // quem acertou não pode soletrar a resposta
    expect(room.submitMessage(guessers[0].id, 'banana!!').ok).toBe(false);
  });

  it('palpite errado vira mensagem normal para todos; vazio e longo são rejeitados', () => {
    const { room, sent, guessers } = started();
    expect(room.submitMessage(guessers[0].id, 'maçã').ok).toBe(true);
    expect(sent.some((s) => s.event === 'room:chat' && s.target === 'room' && s.payload.text === 'maçã')).toBe(true);
    expect(room.submitMessage(guessers[0].id, '    ').ok).toBe(false);
    expect(room.submitMessage(guessers[0].id, 'x'.repeat(101)).ok).toBe(false);
    expect(room.submitMessage('inexistente', 'oi').ok).toBe(false);
  });

  it('palpites depois do fim da rodada não pontuam', () => {
    const { room, guessers } = started();
    vi.advanceTimersByTime(90_000);
    expect(room.phase).toBe('round_end');
    room.submitMessage(guessers[0].id, 'banana');
    expect(guessers[0].score).toBe(0);
  });
});

describe('rodadas e temporizador', () => {
  it('encerra por tempo, revela a palavra e prepara a próxima rodada', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.startGame(joined[0].id);
    const first = drawerOf(room);
    const state = room.publicState();
    expect(state.phaseEndsAt! - state.serverNow).toBe(90_000);
    expect(state.roundResult).toBeNull();

    vi.advanceTimersByTime(89_999);
    expect(room.phase).toBe('round');
    vi.advanceTimersByTime(1);
    expect(room.phase).toBe('round_end');
    const ended = room.publicState();
    expect(ended.roundResult).toMatchObject({ word: 'Banana', reason: 'time' });

    vi.advanceTimersByTime(5_000);
    expect(room.phase).toBe('round');
    expect(drawerOf(room).id).not.toBe(first.id);
    expect(room.publicState().round?.number).toBe(2);
  });

  it('encerra antecipadamente quando todos os que podem adivinhar acertam', () => {
    const { room, joined } = setup(['Ana', 'Beto', 'Caio']);
    room.startGame(joined[0].id);
    const drawer = drawerOf(room);
    const guessers = joined.filter((p) => p.id !== drawer.id);
    room.submitMessage(guessers[0].id, 'banana');
    expect(room.phase).toBe('round');
    room.submitMessage(guessers[1].id, 'banana');
    expect(room.phase).toBe('round_end');
    const result = room.publicState().roundResult!;
    expect(result.reason).toBe('all_guessed');
    expect(result.entries.map((e) => [e.nickname, e.points, e.role])).toEqual(
      expect.arrayContaining([
        [guessers[0].nickname, 100, 'guesser'],
        [guessers[1].nickname, 70, 'guesser'],
        [drawer.nickname, 50, 'drawer'],
      ]),
    );
  });

  it('sem acertos ninguém pontua', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.startGame(joined[0].id);
    vi.advanceTimersByTime(90_000);
    expect(room.players.map((p) => p.score)).toEqual([0, 0]);
    expect(room.publicState().roundResult?.entries).toEqual([]);
  });

  it('o timer antigo não encerra a rodada seguinte (sem rodadas duplicadas)', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.startGame(joined[0].id);
    const drawer = drawerOf(room);
    const guesser = joined.find((p) => p.id !== drawer.id)!;
    room.submitMessage(guesser.id, 'banana'); // encerra antecipado
    vi.advanceTimersByTime(5_000); // próxima rodada começa
    expect(room.publicState().round?.number).toBe(2);
    vi.advanceTimersByTime(85_000); // quando o timer antigo dispararia
    expect(room.phase).toBe('round');
    expect(room.publicState().round?.number).toBe(2);
  });

  it('se o desenhista desconecta a rodada termina e a sala continua', () => {
    const { room, joined } = setup(['Ana', 'Beto', 'Caio']);
    room.startGame(joined[0].id);
    const drawer = drawerOf(room);
    room.disconnect(drawer.id, drawer.socketId!);
    expect(room.phase).toBe('round_end');
    expect(room.publicState().roundResult?.reason).toBe('drawer_left');
    vi.advanceTimersByTime(5_000);
    expect(room.phase).toBe('round');
    expect(drawerOf(room).id).not.toBe(drawer.id);
  });

  it('se sobra só um jogador conectado a partida termina', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.startGame(joined[0].id);
    const drawer = drawerOf(room);
    const other = joined.find((p) => p.id !== drawer.id)!;
    room.disconnect(other.id, other.socketId!);
    expect(room.phase).toBe('round_end');
    vi.advanceTimersByTime(5_000);
    expect(room.phase).toBe('game_end');
  });
});

describe('partida completa', () => {
  it('2 rodadas por jogador, classificação final e jogar de novo', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.startGame(joined[0].id);
    const drawers: string[] = [];
    const words = ['banana', 'cachorro', 'pizza', 'arvore'];
    for (let i = 0; i < 4; i++) {
      const drawer = drawerOf(room);
      drawers.push(drawer.nickname);
      const guesser = joined.find((p) => p.id !== drawer.id)!;
      room.submitMessage(guesser.id, words[i]);
      expect(room.phase).toBe('round_end');
      vi.advanceTimersByTime(5_000);
    }
    expect(drawers).toEqual(['Ana', 'Beto', 'Ana', 'Beto']);
    expect(room.phase).toBe('game_end');

    const final = room.publicState().final!;
    expect(final.ranking).toHaveLength(2);
    expect(final.ranking.every((r) => r.score === 300)).toBe(true); // 2×100 + 2×50
    expect(final.winnerIds).toHaveLength(2); // empate
    expect(room.publicState().round).toBeNull();

    // somente o anfitrião controla as transições
    expect(room.startGame(joined[1].id).ok).toBe(false);
    expect(room.backToLobby(joined[1].id).ok).toBe(false);
    expect(room.startGame(joined[0].id).ok).toBe(true);
    expect(room.players.every((p) => p.score === 0 || p.score === 0)).toBe(true);
    expect(room.publicState().round?.number).toBe(1);
  });

  it('voltar ao lobby zera a pontuação', () => {
    const { room, joined } = setup(['Ana', 'Beto']);
    room.startGame(joined[0].id);
    vi.advanceTimersByTime(90_000 + 5_000);
    vi.advanceTimersByTime(90_000 + 5_000);
    vi.advanceTimersByTime(90_000 + 5_000);
    vi.advanceTimersByTime(90_000 + 5_000);
    expect(room.phase).toBe('game_end');
    expect(room.backToLobby(joined[0].id).ok).toBe(true);
    expect(room.phase).toBe('lobby');
    expect(room.publicState().final).toBeNull();
  });

  it('quem entra no meio da partida recebe estado, histórico e palavra se for o desenhista', () => {
    const { room, sent, joined } = setup(['Ana', 'Beto']);
    room.startGame(joined[0].id);
    const late = room.addPlayer('Caio', 'sock-Caio');
    if (!late.ok) throw new Error('falhou');
    sent.length = 0;
    room.sendSnapshot(late.player);
    expect(sent.map((s) => s.event)).toEqual(['room:state', 'chat:history', 'draw:sync']);
    expect(JSON.stringify(sent)).not.toContain('Banana');
  });
});

describe('desenho', () => {
  function drawing() {
    const ctx = setup(['Ana', 'Beto']);
    ctx.room.startGame(ctx.joined[0].id);
    const drawer = drawerOf(ctx.room);
    const other = ctx.joined.find((p) => p.id !== drawer.id)!;
    ctx.sent.length = 0;
    return { ...ctx, drawer, other };
  }
  const begin = { color: '#ff0000', size: 0.01, tool: 'pen' as const, x: 0.1, y: 0.2 };

  it('só o desenhista desenha, e os traços são repassados aos demais', () => {
    const { room, sent, drawer, other } = drawing();
    room.beginStroke(other.id, begin);
    room.addPoints(other.id, [[0.3, 0.3]]);
    expect(sent).toHaveLength(0);

    room.beginStroke(drawer.id, begin);
    room.addPoints(drawer.id, [[0.3, 0.3], [0.4, 0.4]]);
    room.endStroke(drawer.id);
    expect(sent.map((s) => [s.target, s.event, s.playerId])).toEqual([
      ['except', 'draw:begin', drawer.id],
      ['except', 'draw:points', drawer.id],
      ['except', 'draw:end', drawer.id],
    ]);
  });

  it('pontos fora de ordem (sem begin) são ignorados', () => {
    const { room, sent, drawer } = drawing();
    room.addPoints(drawer.id, [[0.3, 0.3]]);
    expect(sent).toHaveLength(0);
  });

  it('o desenho fica guardado para quem entrar depois', () => {
    const { room, sent, drawer, other } = drawing();
    room.beginStroke(drawer.id, begin);
    room.addPoints(drawer.id, [[0.3, 0.3]]);
    room.endStroke(drawer.id);
    sent.length = 0;
    room.sendSnapshot(other);
    const sync = sent.find((s) => s.event === 'draw:sync')!;
    expect(sync.payload.strokes).toHaveLength(1);
    expect(sync.payload.strokes[0].points).toHaveLength(2);
    room.clearCanvas(drawer.id);
    sent.length = 0;
    room.sendSnapshot(other);
    expect(sent.find((s) => s.event === 'draw:sync')!.payload.strokes).toHaveLength(0);
  });

  it('ninguém desenha fora da rodada', () => {
    const { room, sent, drawer } = drawing();
    vi.advanceTimersByTime(90_000);
    sent.length = 0;
    room.beginStroke(drawer.id, begin);
    expect(sent).toHaveLength(0);
  });
});
