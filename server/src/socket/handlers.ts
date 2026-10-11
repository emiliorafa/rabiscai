import type { Server, Socket } from 'socket.io';
import type { ZodType } from 'zod';
import type { Ack } from '../../../shared/protocol';
import type { Emitter, Player, Room } from '../game/Room';
import { RateLimiter } from '../game/RateLimiter';
import type { RoomManager } from '../rooms/RoomManager';
import {
  chatSchema,
  createSchema,
  drawBeginSchema,
  drawPointsSchema,
  joinSchema,
  peekSchema,
  quickPlaySchema,
  rejoinSchema,
} from './schemas';

interface Session {
  code: string;
  playerId: string;
}

/** Emissor da Room sobre o Socket.IO. */
export function makeSocketEmitter(io: Server) {
  return (code: string): Emitter => ({
    room: (event, payload) => void io.to(code).emit(event, payload),
    player: (player, event, payload) => {
      if (player.socketId) io.to(player.socketId).emit(event, payload);
    },
    except: (player, event, payload) => {
      const target = io.to(code);
      (player.socketId ? target.except(player.socketId) : target).emit(event, payload);
    },
  });
}

export function registerSocketHandlers(io: Server, manager: RoomManager): void {
  io.on('connection', (socket: Socket) => {
    let session: Session | null = null;
    const chatLimiter = new RateLimiter(5, 4000); // 5 mensagens / 4s
    const drawLimiter = new RateLimiter(400, 1000); // 400 eventos de desenho / s

    /** Jogador e sala do socket, sempre derivados do servidor (nunca do payload). */
    const current = (): { room: Room; player: Player } | null => {
      if (!session) return null;
      const room = manager.get(session.code);
      const player = room?.getPlayer(session.playerId);
      if (!room || !player || player.socketId !== socket.id) return null;
      return { room, player };
    };

    const on = <T>(
      event: string,
      schema: ZodType<T> | null,
      handler: (data: T, reply: (r: Ack<any>) => void) => void,
    ) => {
      socket.on(event, (...args: unknown[]) => {
        const ack = args.find((a) => typeof a === 'function') as ((r: Ack<any>) => void) | undefined;
        const raw = typeof args[0] === 'function' ? undefined : args[0];
        const reply = (r: Ack<any>) => ack?.(r);
        try {
          let data = undefined as T;
          if (schema) {
            const parsed = schema.safeParse(raw);
            if (!parsed.success) return reply({ ok: false, error: 'Dados inválidos.' });
            data = parsed.data;
          }
          handler(data, reply);
        } catch (err) {
          console.error(`[socket] erro em ${event}:`, err);
          reply({ ok: false, error: 'Erro interno do servidor.' });
        }
      });
    };

    const leaveCurrent = () => {
      const ctx = current();
      if (session) socket.leave(session.code);
      session = null;
      ctx?.room.removePlayer(ctx.player.id);
    };

    const enterRoom = (room: Room, nickname: string, reply: (r: Ack<any>) => void) => {
      leaveCurrent();
      socket.join(room.code); // antes, para receber o broadcast de entrada
      const result = room.addPlayer(nickname, socket.id);
      if (!result.ok) {
        socket.leave(room.code);
        return reply(result);
      }
      session = { code: room.code, playerId: result.player.id };
      reply({ ok: true, code: room.code, token: result.player.token, playerId: result.player.id });
      room.sendSnapshot(result.player);
    };

    on('room:peek', peekSchema, ({ code }, reply) => {
      const room = manager.get(code);
      if (!room) return reply({ ok: false, error: 'Sala não encontrada.' });
      reply({ ok: true, code: room.code, ...room.peek() });
    });

    /** Descarta uma sala recém-criada se a entrada do primeiro jogador falhou. */
    const discardIfEmpty = (room: Room) => {
      if (room.players.length > 0) return;
      room.dispose();
      room.onEmpty?.();
    };

    on('room:create', createSchema, ({ nickname }, reply) => {
      const room = manager.createRoom(false);
      enterRoom(room, nickname, reply);
      discardIfEmpty(room);
    });

    on('room:join', joinSchema, ({ code, nickname }, reply) => {
      const room = manager.get(code);
      if (!room) return reply({ ok: false, error: 'Sala não encontrada. Confira o código.' });
      enterRoom(room, nickname, reply);
    });

    on('room:quickplay', quickPlaySchema, ({ nickname }, reply) => {
      const room = manager.findPublicRoom(nickname) ?? manager.createRoom(true);
      enterRoom(room, nickname, reply);
      discardIfEmpty(room);
    });

    on('room:rejoin', rejoinSchema, ({ code, token }, reply) => {
      const room = manager.get(code);
      if (!room) return reply({ ok: false, error: 'Essa sala não existe mais.' });
      if (session && session.code !== room.code) leaveCurrent();
      socket.join(room.code);
      const result = room.reconnect(token, socket.id);
      if (!result.ok) {
        socket.leave(room.code);
        return reply(result);
      }
      if (result.oldSocketId) io.sockets.sockets.get(result.oldSocketId)?.leave(room.code);
      session = { code: room.code, playerId: result.player.id };
      reply({ ok: true, code: room.code, token: result.player.token, playerId: result.player.id });
      room.sendSnapshot(result.player);
    });

    on('room:leave', null, (_data, reply) => {
      leaveCurrent();
      reply({ ok: true });
    });

    on('game:start', null, (_data, reply) => {
      const ctx = current();
      if (!ctx) return reply({ ok: false, error: 'Você não está em uma sala.' });
      reply(ctx.room.startGame(ctx.player.id));
    });

    on('game:backToLobby', null, (_data, reply) => {
      const ctx = current();
      if (!ctx) return reply({ ok: false, error: 'Você não está em uma sala.' });
      reply(ctx.room.backToLobby(ctx.player.id));
    });

    on('chat:send', chatSchema, ({ text }, reply) => {
      const ctx = current();
      if (!ctx) return reply({ ok: false, error: 'Você não está em uma sala.' });
      if (!chatLimiter.allow()) return reply({ ok: false, error: 'Calma! Você está enviando mensagens rápido demais.' });
      reply(ctx.room.submitMessage(ctx.player.id, text));
    });

    // Eventos de desenho: sem ack; qualquer coisa inválida é simplesmente ignorada.
    on('draw:begin', drawBeginSchema, (data) => {
      const ctx = current();
      if (ctx && drawLimiter.allow()) ctx.room.beginStroke(ctx.player.id, data);
    });
    on('draw:points', drawPointsSchema, ({ points }) => {
      const ctx = current();
      if (ctx && drawLimiter.allow()) ctx.room.addPoints(ctx.player.id, points);
    });
    on('draw:end', null, () => {
      const ctx = current();
      if (ctx) ctx.room.endStroke(ctx.player.id);
    });
    on('draw:clear', null, () => {
      const ctx = current();
      if (ctx && drawLimiter.allow()) ctx.room.clearCanvas(ctx.player.id);
    });

    socket.on('disconnect', () => {
      const ctx = current();
      if (ctx) ctx.room.disconnect(ctx.player.id, socket.id);
    });
  });
}
