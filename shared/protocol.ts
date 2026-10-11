// Tipos e regras de validação compartilhados entre cliente e servidor.

export const MIN_NICKNAME = 2;
export const MAX_NICKNAME = 16;
export const MAX_MESSAGE_LENGTH = 100;
export const MAX_PLAYERS = 10;
export const ROOM_CODE_LENGTH = 5;
export const NICKNAME_PATTERN = /^[\p{L}\p{N}_\- ]+$/u;

export type Phase = 'lobby' | 'round' | 'round_end' | 'game_end';
export type RoundEndReason = 'time' | 'all_guessed' | 'drawer_left' | 'no_guessers';

export type Ack<T extends object = {}> = ({ ok: true } & T) | { ok: false; error: string };

export interface PublicPlayer {
  id: string;
  nickname: string;
  score: number;
  connected: boolean;
  isHost: boolean;
  isDrawer: boolean;
  hasGuessed: boolean;
}

export interface RoundInfo {
  number: number;
  total: number;
  drawerId: string;
  nextDrawerId: string | null;
  /** Ex.: "_ _ _ _ _ _". A palavra real NUNCA vai aqui. */
  mask: string;
  wordLength: number;
  durationMs: number;
}

export interface RoundResultEntry {
  playerId: string;
  nickname: string;
  points: number;
  role: 'drawer' | 'guesser';
}

export interface RoundResult {
  word: string;
  reason: RoundEndReason;
  entries: RoundResultEntry[];
}

export interface FinalEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  hostId: string;
  maxPlayers: number;
  players: PublicPlayer[];
  round: RoundInfo | null;
  /** Só presente em `round_end`. */
  roundResult: RoundResult | null;
  /** Só presente em `game_end`. */
  final: { ranking: FinalEntry[]; winnerIds: string[] } | null;
  /** Fim da rodada (phase=round) ou início da próxima (phase=round_end), em hora do servidor. */
  phaseEndsAt: number | null;
  serverNow: number;
}

export interface ChatMessage {
  id: string;
  kind: 'chat' | 'system' | 'correct';
  playerId?: string;
  nickname?: string;
  text: string;
  at: number;
  /** Mensagem visível só para quem já acertou e para o desenhista. */
  private?: boolean;
}

export type Point = [number, number];
export type Tool = 'pen' | 'eraser';

export interface StrokeData {
  color: string;
  /** Fração da largura do canvas (ex.: 0.01 = 1%). */
  size: number;
  tool: Tool;
  /** Coordenadas normalizadas 0..1. */
  points: Point[];
}

export interface DrawBeginPayload {
  color: string;
  size: number;
  tool: Tool;
  x: number;
  y: number;
}

export type NicknameResult = { ok: true; nickname: string } | { ok: false; error: string };

export function validateNickname(raw: unknown): NicknameResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Digite um apelido.' };
  const nickname = raw.replace(/\s+/g, ' ').trim();
  if (nickname.length === 0) return { ok: false, error: 'Digite um apelido para jogar.' };
  if (nickname.length < MIN_NICKNAME) return { ok: false, error: `O apelido precisa ter pelo menos ${MIN_NICKNAME} caracteres.` };
  if (nickname.length > MAX_NICKNAME) return { ok: false, error: `O apelido pode ter no máximo ${MAX_NICKNAME} caracteres.` };
  if (!NICKNAME_PATTERN.test(nickname)) return { ok: false, error: 'Use só letras, números, espaço, "_" ou "-" no apelido.' };
  return { ok: true, nickname };
}

export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return new RegExp(`^[A-Z0-9]{${ROOM_CODE_LENGTH}}$`).test(code) ? code : null;
}
