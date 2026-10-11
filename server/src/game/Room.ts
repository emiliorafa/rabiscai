import { randomBytes } from 'node:crypto';
import {
  MAX_MESSAGE_LENGTH,
  validateNickname,
  type ChatMessage,
  type DrawBeginPayload,
  type FinalEntry,
  type Phase,
  type Point,
  type PublicPlayer,
  type RoomState,
  type RoundEndReason,
  type RoundInfo,
  type RoundResult,
  type StrokeData,
} from '../../../shared/protocol';
import { pickNextDrawer } from './drawers';
import { containsWord, isCorrectGuess, letterCount, maskWord, normalizeText, sanitizeMessage } from './guess';
import { DRAWER_POINTS, pointsForGuess, rankPlayers } from './scoring';

export interface Player {
  /** Identificador público (aparece na lista de jogadores). */
  id: string;
  /** Segredo usado só para reconectar. Nunca é enviado a outros jogadores. */
  token: string;
  nickname: string;
  score: number;
  connected: boolean;
  socketId: string | null;
  hasGuessed: boolean;
  joinIndex: number;
  graceTimer?: ReturnType<typeof setTimeout>;
}

/** Abstração de saída: permite testar a Room sem Socket.IO. */
export interface Emitter {
  room(event: string, payload?: unknown): void;
  player(player: Player, event: string, payload?: unknown): void;
  except(player: Player, event: string, payload?: unknown): void;
}

export interface RoomConfig {
  roundMs: number;
  intermissionMs: number;
  graceMs: number;
  maxPlayers: number;
  roundsPerPlayer: number;
  pickWord: (used: Set<string>) => string;
}

export type Result<T extends object = {}> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

interface StoredMessage extends ChatMessage {
  /** null = todos veem. Caso contrário, só estes jogadores. */
  visibleTo: string[] | null;
}

interface Award {
  nickname: string;
  points: number;
  role: 'drawer' | 'guesser';
}

interface GameState {
  totalRounds: number;
  roundsDone: number;
  turns: Map<string, number>;
  lastDrawerId: string | null;
  usedWords: Set<string>;
}

interface RoundState {
  number: number;
  drawerId: string;
  drawerNickname: string;
  /** Segredo: só existe no servidor e é enviado apenas ao desenhista. */
  word: string;
  guessOrder: string[];
  awards: Map<string, Award>;
  drawerPaid: boolean;
  endsAt: number;
}

const CHAT_HISTORY_LIMIT = 100;
const MAX_STROKES = 2000;
const MAX_POINTS_PER_STROKE = 6000;
const MAX_TOTAL_POINTS = 150_000;

const END_REASON_TEXT: Record<RoundEndReason, string> = {
  time: 'Tempo esgotado!',
  all_guessed: 'Todo mundo acertou!',
  drawer_left: 'O desenhista saiu da rodada.',
  no_guessers: 'Não há mais ninguém para adivinhar.',
};

export class Room {
  phase: Phase = 'lobby';
  hostId = '';
  readonly players: Player[] = [];
  onEmpty?: () => void;

  private chat: StoredMessage[] = [];
  private strokes: StrokeData[] = [];
  private currentStroke: StrokeData | null = null;
  private totalPoints = 0;
  private game: GameState | null = null;
  private round: RoundState | null = null;
  private roundResult: RoundResult | null = null;
  private final: { ranking: FinalEntry[]; winnerIds: string[] } | null = null;
  private nextAt: number | null = null;
  private joinCounter = 0;
  private msgCounter = 0;
  private seq = 0;
  private disposed = false;
  private timers: {
    round?: ReturnType<typeof setTimeout>;
    tick?: ReturnType<typeof setInterval>;
    intermission?: ReturnType<typeof setTimeout>;
  } = {};

  constructor(
    readonly code: string,
    readonly isPublic: boolean,
    private readonly emit: Emitter,
    private readonly config: RoomConfig,
  ) {}

  // ---------------------------------------------------------------- jogadores

  getPlayer(id: string): Player | undefined {
    return this.players.find((p) => p.id === id);
  }

  isFull(): boolean {
    return this.players.length >= this.config.maxPlayers;
  }

  hasNickname(nickname: string): boolean {
    const wanted = normalizeText(nickname);
    return this.players.some((p) => normalizeText(p.nickname) === wanted);
  }

  addPlayer(rawNickname: string, socketId: string): Result<{ player: Player }> {
    const v = validateNickname(rawNickname);
    if (!v.ok) return fail(v.error);
    if (this.isFull()) return fail('Essa sala está cheia.');
    if (this.hasNickname(v.nickname)) return fail('Já existe alguém com esse apelido na sala. Escolha outro.');

    const player: Player = {
      id: randomBytes(4).toString('hex'),
      token: randomBytes(16).toString('hex'),
      nickname: v.nickname,
      score: 0,
      connected: true,
      socketId,
      hasGuessed: false,
      joinIndex: this.joinCounter++,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    this.pushSystem(`${player.nickname} entrou na sala.`);
    this.broadcastState();
    return { ok: true, player };
  }

  /** Reconexão com o token secreto. Devolve o socket antigo (para ser desconectado da sala). */
  reconnect(token: string, socketId: string): Result<{ player: Player; oldSocketId: string | null }> {
    const player = this.players.find((p) => p.token === token);
    if (!player) return fail('Sua sessão expirou. Entre na sala novamente.');
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = undefined;
    const oldSocketId = player.socketId && player.socketId !== socketId ? player.socketId : null;
    const wasConnected = player.connected;
    player.connected = true;
    player.socketId = socketId;
    if (!wasConnected) this.pushSystem(`${player.nickname} voltou.`);
    this.ensureHost();
    this.broadcastState();
    return { ok: true, player, oldSocketId };
  }

  /** Queda de conexão: o jogador fica "reconectando" por um tempo antes de ser removido. */
  disconnect(playerId: string, socketId: string): void {
    const player = this.getPlayer(playerId);
    if (!player || player.socketId !== socketId) return; // evento de um socket antigo
    player.connected = false;
    player.socketId = null;
    this.pushSystem(`${player.nickname} desconectou.`);
    this.ensureHost();
    if (player.graceTimer) clearTimeout(player.graceTimer);
    player.graceTimer = setTimeout(() => this.removePlayer(player.id), this.config.graceMs);
    this.afterRosterChange();
    this.broadcastState();
  }

  removePlayer(playerId: string): void {
    const index = this.players.findIndex((p) => p.id === playerId);
    if (index === -1) return;
    const [player] = this.players.splice(index, 1);
    if (player.graceTimer) clearTimeout(player.graceTimer);
    this.game?.turns.delete(player.id);

    if (this.players.length === 0) {
      this.dispose();
      this.onEmpty?.();
      return;
    }
    this.pushSystem(`${player.nickname} saiu da sala.`);
    this.ensureHost();
    this.afterRosterChange();
    this.broadcastState();
  }

  private ensureHost(): void {
    const host = this.getPlayer(this.hostId);
    if (host && host.connected) return;
    const next = this.players.find((p) => p.connected) ?? this.players[0];
    if (next && next.id !== this.hostId) {
      this.hostId = next.id;
      if (next.connected) this.pushSystem(`${next.nickname} agora é o anfitrião.`);
    }
  }

  private afterRosterChange(): void {
    if (this.phase !== 'round' || !this.round) return;
    const drawer = this.getPlayer(this.round.drawerId);
    if (!drawer || !drawer.connected) {
      this.endRound('drawer_left');
      return;
    }
    this.checkAllGuessed();
  }

  // ------------------------------------------------------------ fluxo da partida

  startGame(playerId: string): Result {
    if (playerId !== this.hostId) return fail('Só o anfitrião pode iniciar a partida.');
    if (this.phase !== 'lobby' && this.phase !== 'game_end') return fail('A partida já está em andamento.');
    const connected = this.players.filter((p) => p.connected);
    if (connected.length < 2) return fail('São necessários pelo menos 2 jogadores conectados.');

    for (const p of this.players) {
      p.score = 0;
      p.hasGuessed = false;
    }
    this.game = {
      totalRounds: connected.length * this.config.roundsPerPlayer,
      roundsDone: 0,
      turns: new Map(),
      lastDrawerId: null,
      usedWords: new Set(),
    };
    this.final = null;
    this.roundResult = null;
    this.pushSystem(`Partida iniciada! Serão ${this.game.totalRounds} rodadas.`);
    this.startNextRound();
    return { ok: true };
  }

  backToLobby(playerId: string): Result {
    if (playerId !== this.hostId) return fail('Só o anfitrião pode voltar ao lobby.');
    if (this.phase !== 'game_end') return fail('A partida ainda não terminou.');
    this.phase = 'lobby';
    this.game = null;
    this.round = null;
    this.final = null;
    this.roundResult = null;
    this.nextAt = null;
    for (const p of this.players) {
      p.score = 0;
      p.hasGuessed = false;
    }
    this.resetCanvas();
    this.emit.room('draw:clear');
    this.broadcastState();
    return { ok: true };
  }

  private startNextRound(): void {
    const game = this.game;
    if (!game) return;
    const connected = this.players.filter((p) => p.connected);
    if (game.roundsDone >= game.totalRounds || connected.length < 2) {
      this.finishGame();
      return;
    }

    const drawerId = pickNextDrawer(
      connected.map((p) => ({ id: p.id, joinIndex: p.joinIndex })),
      game.turns,
      game.lastDrawerId,
    );
    const drawer = this.getPlayer(drawerId)!;
    const word = this.config.pickWord(game.usedWords);
    game.usedWords.add(word);
    game.turns.set(drawerId, (game.turns.get(drawerId) ?? 0) + 1);
    game.lastDrawerId = drawerId;

    for (const p of this.players) p.hasGuessed = false;
    this.resetCanvas();

    this.clearTimers();
    const token = ++this.seq;
    this.round = {
      number: game.roundsDone + 1,
      drawerId,
      drawerNickname: drawer.nickname,
      word,
      guessOrder: [],
      awards: new Map(),
      drawerPaid: false,
      endsAt: Date.now() + this.config.roundMs,
    };
    this.roundResult = null;
    this.nextAt = null;
    this.phase = 'round';

    this.timers.round = setTimeout(() => {
      if (this.seq === token) this.endRound('time');
    }, this.config.roundMs);
    this.timers.tick = setInterval(() => {
      if (this.seq !== token || !this.round) return;
      this.emit.room('round:tick', {
        remainingMs: Math.max(0, this.round.endsAt - Date.now()),
        serverNow: Date.now(),
      });
    }, 1000);

    this.emit.room('draw:clear');
    this.pushSystem(`Rodada ${this.round.number}: ${drawer.nickname} está desenhando!`);
    this.broadcastState();
    this.emit.player(drawer, 'round:word', { word });
  }

  private endRound(reason: RoundEndReason): void {
    if (this.phase !== 'round' || !this.round || !this.game) return; // transição já ocorreu
    const round = this.round;
    this.clearTimers();
    this.game.roundsDone += 1;
    this.currentStroke = null;

    const entries = [...round.awards.entries()]
      .map(([playerId, a]) => ({ playerId, nickname: a.nickname, points: a.points, role: a.role }))
      .sort((a, b) => b.points - a.points);
    this.roundResult = { word: round.word, reason, entries };
    this.phase = 'round_end';
    this.nextAt = Date.now() + this.config.intermissionMs;

    this.pushSystem(`${END_REASON_TEXT[reason]} A palavra era "${round.word}".`);
    const token = ++this.seq;
    this.timers.intermission = setTimeout(() => {
      if (this.seq === token && this.phase === 'round_end') this.startNextRound();
    }, this.config.intermissionMs);
    this.broadcastState();
  }

  private finishGame(): void {
    this.clearTimers();
    this.seq++;
    this.phase = 'game_end';
    this.round = null;
    this.roundResult = null;
    this.nextAt = null;
    this.currentStroke = null;
    const ranking = rankPlayers(this.players);
    const winnerIds = ranking.filter((r) => r.rank === 1).map((r) => r.playerId);
    this.final = { ranking, winnerIds };
    const names = ranking.filter((r) => r.rank === 1).map((r) => r.nickname).join(' e ');
    this.pushSystem(`Fim de jogo! ${winnerIds.length > 1 ? 'Empate entre' : 'Vencedor:'} ${names}.`);
    this.broadcastState();
  }

  private checkAllGuessed(): void {
    if (this.phase !== 'round' || !this.round) return;
    const guessers = this.players.filter((p) => p.connected && p.id !== this.round!.drawerId);
    if (guessers.length === 0) this.endRound('no_guessers');
    else if (guessers.every((p) => p.hasGuessed)) this.endRound('all_guessed');
  }

  // ----------------------------------------------------------------- chat/palpites

  submitMessage(playerId: string, raw: string): Result {
    const player = this.getPlayer(playerId);
    if (!player) return fail('Você não faz parte dessa sala.');
    const text = sanitizeMessage(raw);
    if (!text) return fail('Digite uma mensagem.');
    if (text.length > MAX_MESSAGE_LENGTH) return fail(`Mensagem muito longa (máximo ${MAX_MESSAGE_LENGTH} caracteres).`);

    if (this.phase === 'round' && this.round) {
      const round = this.round;
      const isDrawer = player.id === round.drawerId;

      if (isDrawer || player.hasGuessed) {
        // Quem já sabe a palavra não pode entregá-la; conversa só entre quem sabe.
        if (containsWord(text, round.word)) return fail('Não vale revelar a palavra!');
        const audience = this.players.filter((p) => p.id === round.drawerId || p.hasGuessed);
        this.pushChat(
          { kind: 'chat', playerId: player.id, nickname: player.nickname, text, private: true },
          audience,
        );
        return { ok: true };
      }

      if (isCorrectGuess(text, round.word)) {
        this.registerCorrectGuess(player, round);
        return { ok: true };
      }
    }

    this.pushChat({ kind: 'chat', playerId: player.id, nickname: player.nickname, text });
    return { ok: true };
  }

  private registerCorrectGuess(player: Player, round: RoundState): void {
    const points = pointsForGuess(round.guessOrder.length);
    player.hasGuessed = true;
    player.score += points;
    round.guessOrder.push(player.id);
    round.awards.set(player.id, { nickname: player.nickname, points, role: 'guesser' });

    if (!round.drawerPaid) {
      round.drawerPaid = true;
      const drawer = this.getPlayer(round.drawerId);
      if (drawer) {
        drawer.score += DRAWER_POINTS;
        round.awards.set(drawer.id, { nickname: drawer.nickname, points: DRAWER_POINTS, role: 'drawer' });
      }
    }

    this.pushChat({
      kind: 'correct',
      playerId: player.id,
      nickname: player.nickname,
      text: `🎉 ${player.nickname} acertou a palavra! (+${points})`,
    });
    this.broadcastState();
    this.checkAllGuessed();
  }

  // ----------------------------------------------------------------------- desenho

  private canDraw(playerId: string): boolean {
    return this.phase === 'round' && this.round?.drawerId === playerId;
  }

  beginStroke(playerId: string, data: DrawBeginPayload): void {
    if (!this.canDraw(playerId)) return;
    const player = this.getPlayer(playerId)!;
    if (this.strokes.length >= MAX_STROKES || this.totalPoints >= MAX_TOTAL_POINTS) return;
    const stroke: StrokeData = { color: data.color, size: data.size, tool: data.tool, points: [[data.x, data.y]] };
    this.strokes.push(stroke);
    this.currentStroke = stroke;
    this.totalPoints += 1;
    this.emit.except(player, 'draw:begin', data);
  }

  addPoints(playerId: string, points: Point[]): void {
    if (!this.canDraw(playerId) || !this.currentStroke) return; // fora de ordem: ignora
    const player = this.getPlayer(playerId)!;
    const room = Math.min(
      points.length,
      MAX_POINTS_PER_STROKE - this.currentStroke.points.length,
      MAX_TOTAL_POINTS - this.totalPoints,
    );
    if (room <= 0) return;
    const accepted = points.slice(0, room);
    this.currentStroke.points.push(...accepted);
    this.totalPoints += accepted.length;
    this.emit.except(player, 'draw:points', { points: accepted });
  }

  endStroke(playerId: string): void {
    if (!this.canDraw(playerId) || !this.currentStroke) return;
    const player = this.getPlayer(playerId)!;
    this.currentStroke = null;
    this.emit.except(player, 'draw:end');
  }

  clearCanvas(playerId: string): void {
    if (!this.canDraw(playerId)) return;
    const player = this.getPlayer(playerId)!;
    this.resetCanvas();
    this.emit.except(player, 'draw:clear');
  }

  private resetCanvas(): void {
    this.strokes = [];
    this.currentStroke = null;
    this.totalPoints = 0;
  }

  // ------------------------------------------------------------------------ estado

  publicState(): RoomState {
    const drawerId = this.phase === 'round' || this.phase === 'round_end' ? this.round?.drawerId ?? null : null;
    const players: PublicPlayer[] = this.players.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      connected: p.connected,
      isHost: p.id === this.hostId,
      isDrawer: p.id === drawerId,
      hasGuessed: p.hasGuessed,
    }));
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      maxPlayers: this.config.maxPlayers,
      players,
      round: this.round ? this.roundInfo(this.round) : null,
      roundResult: this.phase === 'round_end' ? this.roundResult : null,
      final: this.phase === 'game_end' ? this.final : null,
      phaseEndsAt: this.phase === 'round' ? this.round?.endsAt ?? null : this.phase === 'round_end' ? this.nextAt : null,
      serverNow: Date.now(),
    };
  }

  private roundInfo(round: RoundState): RoundInfo {
    const game = this.game!;
    const isLast = game.roundsDone + 1 >= game.totalRounds;
    const nextDrawerId =
      isLast || this.phase !== 'round'
        ? null
        : pickNextDrawer(
            this.players.filter((p) => p.connected).map((p) => ({ id: p.id, joinIndex: p.joinIndex })),
            game.turns,
            round.drawerId,
          );
    return {
      number: round.number,
      total: game.totalRounds,
      drawerId: round.drawerId,
      nextDrawerId,
      mask: maskWord(round.word), // só a máscara; nunca a palavra
      wordLength: letterCount(round.word),
      durationMs: this.config.roundMs,
    };
  }

  /** Dados enviados a um jogador que acabou de entrar ou reconectar. */
  sendSnapshot(player: Player): void {
    this.emit.player(player, 'room:state', this.publicState());
    this.emit.player(player, 'chat:history', {
      messages: this.chat.filter((m) => !m.visibleTo || m.visibleTo.includes(player.id)).map(toPublicMessage),
    });
    this.emit.player(player, 'draw:sync', { strokes: this.strokes });
    if (this.phase === 'round' && this.round?.drawerId === player.id) {
      this.emit.player(player, 'round:word', { word: this.round.word });
    }
  }

  peek(): { players: number; maxPlayers: number; phase: Phase } {
    return { players: this.players.length, maxPlayers: this.config.maxPlayers, phase: this.phase };
  }

  broadcastState(): void {
    if (!this.disposed) this.emit.room('room:state', this.publicState());
  }

  // ------------------------------------------------------------------------ interno

  private pushSystem(text: string): void {
    this.pushChat({ kind: 'system', text });
  }

  private pushChat(message: Omit<ChatMessage, 'id' | 'at'>, audience?: Player[]): void {
    if (this.disposed) return;
    const stored: StoredMessage = {
      ...message,
      id: `m${++this.msgCounter}`,
      at: Date.now(),
      visibleTo: audience ? audience.map((p) => p.id) : null,
    };
    this.chat.push(stored);
    if (this.chat.length > CHAT_HISTORY_LIMIT) this.chat.shift();
    const publicMessage = toPublicMessage(stored);
    if (audience) for (const p of audience) this.emit.player(p, 'room:chat', publicMessage);
    else this.emit.room('room:chat', publicMessage);
  }

  private clearTimers(): void {
    if (this.timers.round) clearTimeout(this.timers.round);
    if (this.timers.tick) clearInterval(this.timers.tick);
    if (this.timers.intermission) clearTimeout(this.timers.intermission);
    this.timers = {};
  }

  dispose(): void {
    this.disposed = true;
    this.seq++;
    this.clearTimers();
    for (const p of this.players) if (p.graceTimer) clearTimeout(p.graceTimer);
  }
}

function toPublicMessage({ visibleTo: _visibleTo, ...message }: StoredMessage): ChatMessage {
  return message;
}
