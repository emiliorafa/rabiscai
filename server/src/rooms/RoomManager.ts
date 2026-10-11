import { randomInt } from 'node:crypto';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from '../../../shared/protocol';
import { Room, type Emitter, type RoomConfig } from '../game/Room';

// Sem 0/O, 1/I/L para evitar confusão ao ditar o código.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(
    private readonly makeEmitter: (code: string) => Emitter,
    private readonly config: RoomConfig,
  ) {}

  get size(): number {
    return this.rooms.size;
  }

  createRoom(isPublic: boolean): Room {
    let code: string;
    do {
      code = Array.from({ length: ROOM_CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));

    const room = new Room(code, isPublic, this.makeEmitter(code), this.config);
    // Sala vazia é removida da memória.
    room.onEmpty = () => {
      if (this.rooms.get(code) === room) this.rooms.delete(code);
    };
    this.rooms.set(code, room);
    return room;
  }

  get(rawCode: unknown): Room | undefined {
    const code = normalizeRoomCode(rawCode);
    return code ? this.rooms.get(code) : undefined;
  }

  /** Procura uma sala pública com vaga. Prefere salas que ainda estão no lobby. */
  findPublicRoom(nickname: string): Room | undefined {
    const candidates = [...this.rooms.values()].filter(
      (r) => r.isPublic && !r.isFull() && !r.hasNickname(nickname),
    );
    return candidates.find((r) => r.phase === 'lobby') ?? candidates[0];
  }
}
