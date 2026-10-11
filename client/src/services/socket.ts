import { io, type Socket } from 'socket.io-client';
import type { Ack } from '../../../shared/protocol';

// Em desenvolvimento o Vite faz proxy de /socket.io; em produção o servidor entrega o cliente.
const serverUrl = import.meta.env.VITE_SERVER_URL as string | undefined;

export const socket: Socket = serverUrl
  ? io(serverUrl, { reconnectionDelay: 500, reconnectionDelayMax: 3000 })
  : io({ reconnectionDelay: 500, reconnectionDelayMax: 3000 });

/** Emite um evento e aguarda o ack do servidor, com tempo limite. */
export function request<T extends object = {}>(event: string, payload: object = {}): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: 'Sem conexão com o servidor. Tentando reconectar…' });
      return;
    }
    socket.timeout(8000).emit(event, payload, (err: Error | null, res: Ack<T>) => {
      resolve(err ? { ok: false, error: 'O servidor demorou a responder. Tente de novo.' } : res);
    });
  });
}
