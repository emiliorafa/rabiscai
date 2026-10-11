import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { pickRandomWord } from './data/words';
import type { RoomConfig } from './game/Room';
import { RoomManager } from './rooms/RoomManager';
import { makeSocketEmitter, registerSocketHandlers } from './socket/handlers';

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function defaultConfig(): RoomConfig {
  return {
    roundMs: envInt('ROUND_SECONDS', 90) * 1000,
    intermissionMs: envInt('INTERMISSION_SECONDS', 7) * 1000,
    graceMs: envInt('GRACE_SECONDS', 20) * 1000,
    maxPlayers: 10,
    roundsPerPlayer: 2,
    pickWord: (used) => pickRandomWord(used),
  };
}

export function createGameServer(config: RoomConfig = defaultConfig()) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: true } });
  const manager = new RoomManager(makeSocketEmitter(io), config);
  registerSocketHandlers(io, manager);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: manager.size });
  });

  // Em produção (npm run build), o servidor também entrega o cliente.
  const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  return { app, httpServer, io, manager };
}
