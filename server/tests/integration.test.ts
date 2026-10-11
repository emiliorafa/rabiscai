import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RoomState } from '../../shared/protocol';
import { createGameServer } from '../src/app';
import { testConfig } from './helpers';

let server: ReturnType<typeof createGameServer>;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = createGameServer(
    testConfig({ roundMs: 4_000, intermissionMs: 150, graceMs: 400, pickWord: ((i) => () => ['Banana', 'Gato', 'Pizza', 'Sol'][i++ % 4])(0) }),
  );
  await new Promise<void>((r) => server.httpServer.listen(0, r));
  url = `http://localhost:${(server.httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.close());
  server.io.close();
});

interface Client {
  socket: Socket;
  state: () => RoomState | null;
  word: () => string | null;
  events: { name: string; payload: any }[];
  req: <T = any>(event: string, payload?: object) => Promise<T>;
}

async function client(): Promise<Client> {
  const socket = connect(url, { transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  let state: RoomState | null = null;
  let word: string | null = null;
  const events: { name: string; payload: any }[] = [];
  socket.onAny((name, payload) => events.push({ name, payload }));
  socket.on('room:state', (s: RoomState) => (state = s));
  socket.on('round:word', (p: { word: string }) => (word = p.word));
  await new Promise<void>((r) => socket.on('connect', () => r()));
  return {
    socket,
    state: () => state,
    word: () => word,
    events,
    req: (event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve)),
  };
}

const until = async (cond: () => boolean, ms = 5000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout aguardando condição');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('fluxo multiplayer de ponta a ponta (Socket.IO real)', () => {
  it('valida entrada: apelido vazio, sala inexistente e dados inválidos', async () => {
    const a = await client();
    expect(await a.req('room:create', { nickname: '  ' })).toMatchObject({ ok: false });
    expect(server.manager.size).toBe(0); // sala vazia descartada
    expect(await a.req('room:join', { code: 'ZZZZZ', nickname: 'Ana' })).toMatchObject({ ok: false });
    expect(await a.req('room:join', { code: 123, nickname: 'Ana' })).toMatchObject({ ok: false });
    expect(await a.req('room:peek', { code: 'ZZZZZ' })).toMatchObject({ ok: false });
  });

  it('cria sala, entra pelo código, joga uma partida inteira e permite jogar de novo', async () => {
    const ana = await client();
    const beto = await client();

    const created = await ana.req('room:create', { nickname: 'Ana' });
    expect(created.ok).toBe(true);
    const code: string = created.code;

    expect(await beto.req('room:peek', { code: code.toLowerCase() })).toMatchObject({ ok: true, players: 1 });
    expect(await beto.req('room:join', { code, nickname: 'ana' })).toMatchObject({ ok: false }); // apelido em uso
    const joined = await beto.req('room:join', { code: code.toLowerCase(), nickname: 'Beto' });
    expect(joined.ok).toBe(true);

    await until(() => ana.state()?.players.length === 2 && beto.state()?.players.length === 2);

    // só o anfitrião inicia
    expect(await beto.req('game:start')).toMatchObject({ ok: false });
    expect(await ana.req('game:start')).toMatchObject({ ok: true });
    await until(() => beto.state()?.phase === 'round');

    const byId = { [created.playerId]: ana, [joined.playerId]: beto } as Record<string, Client>;

    for (let round = 1; round <= 4; round++) {
      await until(() => ana.state()?.round?.number === round && beto.state()?.phase === 'round');
      const drawerId = ana.state()!.round!.drawerId;
      const drawer = byId[drawerId];
      const guesser = drawerId === created.playerId ? beto : ana;
      await until(() => drawer.word() !== null);
      const word = drawer.word()!;

      // palavra secreta não vaza para quem adivinha
      expect(guesser.events.filter((e) => e.name === 'round:word').every((e) => e.payload.word !== word)).toBe(true);
      expect(JSON.stringify(guesser.events)).not.toContain(word);

      // o desenhista desenha e o outro recebe os traços
      const before = guesser.events.filter((e) => e.name === 'draw:points').length;
      drawer.socket.emit('draw:begin', { color: '#112233', size: 0.01, tool: 'pen', x: 0.1, y: 0.1 });
      drawer.socket.emit('draw:points', { points: [[0.2, 0.2], [0.3, 0.3]] });
      drawer.socket.emit('draw:end', {});
      await until(() => guesser.events.filter((e) => e.name === 'draw:points').length > before);

      // quem adivinha tenta desenhar (inválido) e tenta enviar pontuação forjada
      guesser.socket.emit('draw:begin', { color: '#000000', size: 0.01, tool: 'pen', x: 0.5, y: 0.5 });
      guesser.socket.emit('player:setScore', { score: 99999 });

      // palpite errado e depois o certo
      expect(await guesser.req('chat:send', { text: 'palavra errada' })).toMatchObject({ ok: true });
      expect(await guesser.req('chat:send', { text: word.toUpperCase() })).toMatchObject({ ok: true });
      await until(() => ana.state()?.phase === 'round_end');
      expect(ana.state()!.roundResult!.word).toBe(word);
      expect(ana.state()!.roundResult!.reason).toBe('all_guessed');
      // depois do fim da rodada o palpite não pontua
      const scoreAfter = ana.state()!.players.map((p) => p.score);
      await guesser.req('chat:send', { text: word });
      await new Promise((r) => setTimeout(r, 30));
      if (ana.state()!.phase === 'round_end') expect(ana.state()!.players.map((p) => p.score)).toEqual(scoreAfter);
    }

    await until(() => ana.state()?.phase === 'game_end' && beto.state()?.phase === 'game_end');
    const final = ana.state()!.final!;
    expect(final.ranking.map((r) => r.score)).toEqual([300, 300]); // ninguém pontuou a mais por trapaça
    expect(beto.events.some((e) => e.name === 'draw:begin' && e.payload.x === 0.5)).toBe(false);

    // só o anfitrião reinicia
    expect(await beto.req('game:start')).toMatchObject({ ok: false });
    expect(await ana.req('game:start')).toMatchObject({ ok: true });
    await until(() => beto.state()?.phase === 'round');
    expect(beto.state()!.players.every((p) => p.score === 0)).toBe(true);
  }, 30_000);

  it('reconexão com token e remoção/limpeza após desconexão definitiva', async () => {
    const ana = await client();
    const created = await ana.req('room:create', { nickname: 'Ana' });
    const beto = await client();
    const joined = await beto.req('room:join', { code: created.code, nickname: 'Beto' });
    await until(() => ana.state()?.players.length === 2);

    // Beto cai e volta com o token (outro socket)
    beto.socket.close();
    await until(() => ana.state()?.players.find((p) => p.nickname === 'Beto')?.connected === false);
    const beto2 = await client();
    expect(await beto2.req('room:rejoin', { code: created.code, token: 'token-falso' })).toMatchObject({ ok: false });
    expect(await beto2.req('room:rejoin', { code: created.code, token: joined.token })).toMatchObject({ ok: true });
    await until(() => ana.state()?.players.find((p) => p.nickname === 'Beto')?.connected === true);

    // todos saem: a sala some da memória
    ana.socket.close();
    beto2.socket.close();
    await until(() => server.manager.get(created.code) === undefined, 3000);
  });

  it('eventos de quem não está em sala são rejeitados', async () => {
    const x = await client();
    expect(await x.req('game:start')).toMatchObject({ ok: false });
    expect(await x.req('chat:send', { text: 'oi' })).toMatchObject({ ok: false });
  });

  it('proteção contra spam no chat', async () => {
    const a = await client();
    await a.req('room:create', { nickname: 'Spam' });
    const results = [];
    for (let i = 0; i < 10; i++) results.push(await a.req('chat:send', { text: `oi ${i}` }));
    expect(results.filter((r) => r.ok).length).toBe(5);
    expect(results.some((r) => !r.ok && /rápido/.test(r.error))).toBe(true);
  });

  it('"Jogar" (partida rápida) junta jogadores na mesma sala pública', async () => {
    const a = await client();
    const b = await client();
    const ra = await a.req('room:quickplay', { nickname: 'Quick1' });
    const rb = await b.req('room:quickplay', { nickname: 'Quick2' });
    expect(ra.code).toBe(rb.code);
  });
});
