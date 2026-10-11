import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ack, ChatMessage, RoomState, StrokeData } from '../../../shared/protocol';
import { drawStore } from '../services/drawStore';
import { clearSession, loadSession, saveNickname, saveSession, type Session } from '../services/session';
import { request, socket } from '../services/socket';

export type ConnStatus = 'connecting' | 'connected' | 'disconnected';
type Joined = { code: string; token: string; playerId: string };

export function useGame() {
  const [status, setStatus] = useState<ConnStatus>(socket.connected ? 'connected' : 'connecting');
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [restoring, setRestoring] = useState<boolean>(() => loadSession() !== null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [word, setWord] = useState<string | null>(null);
  /** Prazo da fase atual em hora LOCAL (calculado a partir do relógio do servidor). */
  const [deadline, setDeadline] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(session);
  sessionRef.current = session;

  const resetToHome = useCallback((message?: string) => {
    clearSession();
    setSession(null);
    setRoom(null);
    setChat([]);
    setWord(null);
    setDeadline(null);
    drawStore.apply({ type: 'clear' });
    if (message) setToast(message);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setStatus('connected');
      const saved = loadSession();
      if (!saved) {
        setRestoring(false);
        return;
      }
      setRestoring(true);
      void request('room:rejoin', { code: saved.code, token: saved.token }).then((res) => {
        if (res.ok) setSession(saved);
        else resetToHome(res.error);
        setRestoring(false);
      });
    };
    const onDisconnect = () => setStatus('disconnected');

    const onState = (state: RoomState) => {
      const me = sessionRef.current;
      if (me && !state.players.some((p) => p.id === me.playerId)) {
        resetToHome('Você não está mais nessa sala.');
        return;
      }
      setRoom(state);
      setDeadline(state.phaseEndsAt === null ? null : Date.now() + (state.phaseEndsAt - state.serverNow));
      if (me && !(state.phase === 'round' && state.round?.drawerId === me.playerId)) setWord(null);
    };
    const onTick = (p: { remainingMs: number }) => setDeadline(Date.now() + p.remainingMs);

    const onChat = (m: ChatMessage) => setChat((prev) => [...prev.slice(-199), m]);
    const onHistory = (p: { messages: ChatMessage[] }) => setChat(p.messages);
    const onWord = (p: { word: string }) => setWord(p.word);

    const onBegin = (p: { color: string; size: number; tool: 'pen' | 'eraser'; x: number; y: number }) =>
      drawStore.apply({ type: 'begin', color: p.color, size: p.size, tool: p.tool, point: [p.x, p.y] });
    const onPoints = (p: { points: [number, number][] }) => drawStore.apply({ type: 'points', points: p.points });
    const onEnd = () => drawStore.apply({ type: 'end' });
    const onClear = () => drawStore.apply({ type: 'clear' });
    const onSync = (p: { strokes: StrokeData[] }) => drawStore.apply({ type: 'sync', strokes: p.strokes });

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('round:tick', onTick);
    socket.on('room:chat', onChat);
    socket.on('chat:history', onHistory);
    socket.on('round:word', onWord);
    socket.on('draw:begin', onBegin);
    socket.on('draw:points', onPoints);
    socket.on('draw:end', onEnd);
    socket.on('draw:clear', onClear);
    socket.on('draw:sync', onSync);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('round:tick', onTick);
      socket.off('room:chat', onChat);
      socket.off('chat:history', onHistory);
      socket.off('round:word', onWord);
      socket.off('draw:begin', onBegin);
      socket.off('draw:points', onPoints);
      socket.off('draw:end', onEnd);
      socket.off('draw:clear', onClear);
      socket.off('draw:sync', onSync);
    };
  }, [resetToHome]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(id);
  }, [toast]);

  const enter = useCallback(async (event: string, payload: { nickname: string; code?: string }): Promise<Ack<Joined>> => {
    const res = await request<Joined>(event, payload);
    if (res.ok) {
      const next: Session = { code: res.code, token: res.token, playerId: res.playerId, nickname: payload.nickname.trim() };
      saveSession(next);
      saveNickname(next.nickname);
      sessionRef.current = next;
      setSession(next);
    }
    return res;
  }, []);

  return {
    status,
    session,
    restoring,
    room,
    chat,
    word,
    deadline,
    toast,
    dismissToast: () => setToast(null),
    createRoom: (nickname: string) => enter('room:create', { nickname }),
    joinRoom: (code: string, nickname: string) => enter('room:join', { code, nickname }),
    quickPlay: (nickname: string) => enter('room:quickplay', { nickname }),
    peekRoom: (code: string) => request<{ code: string; players: number; maxPlayers: number; phase: string }>('room:peek', { code }),
    leave: async () => {
      await request('room:leave');
      resetToHome();
    },
    startGame: () => request('game:start'),
    backToLobby: () => request('game:backToLobby'),
    sendChat: (text: string) => request('chat:send', { text }),
  };
}

export type GameApi = ReturnType<typeof useGame>;
