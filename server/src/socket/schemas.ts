import { z } from 'zod';

const coord = z.number().min(0).max(1);

export const createSchema = z.object({ nickname: z.string().max(64) });
export const joinSchema = z.object({ code: z.string().max(16), nickname: z.string().max(64) });
export const quickPlaySchema = z.object({ nickname: z.string().max(64) });
export const peekSchema = z.object({ code: z.string().max(16) });
export const rejoinSchema = z.object({ code: z.string().max(16), token: z.string().max(64) });
// O limite "oficial" (100) é aplicado na Room para devolver uma mensagem amigável.
export const chatSchema = z.object({ text: z.string().max(500) });

export const drawBeginSchema = z.object({
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  size: z.number().min(0.0005).max(0.15),
  tool: z.enum(['pen', 'eraser']),
  x: coord,
  y: coord,
});

export const drawPointsSchema = z.object({
  points: z.array(z.tuple([coord, coord])).min(1).max(200),
});
