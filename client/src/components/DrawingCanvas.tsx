import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point, StrokeData, Tool } from '../../../shared/protocol';
import { drawStore } from '../services/drawStore';
import { socket } from '../services/socket';

/** Resolução interna fixa; o CSS escala. Como os traços são normalizados (0..1), tudo fica proporcional. */
export const CANVAS_W = 1200;
export const CANVAS_H = 900;
const MIN_STEP = 0.0015;

function paintStroke(ctx: CanvasRenderingContext2D, stroke: StrokeData, from: number) {
  const pts = stroke.points;
  const color = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = stroke.size * CANVAS_W;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0] * CANVAS_W, pts[0][1] * CANVAS_H, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[from][0] * CANVAS_W, pts[from][1] * CANVAS_H);
  for (let i = from + 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * CANVAS_W, pts[i][1] * CANVAS_H);
  ctx.stroke();
}

function clearCanvas(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

interface Props {
  canDraw: boolean;
  color: string;
  /** Espessura em pixels da resolução interna. */
  size: number;
  tool: Tool;
}

export function DrawingCanvas({ canDraw, color, size, tool }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<Point | null>(null);
  const buffer = useRef<Point[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Renderiza tudo o que está no drawStore (local + remoto) de forma incremental.
  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')!;
    const replay = () => {
      clearCanvas(ctx);
      for (const s of drawStore.strokes) paintStroke(ctx, s, 0);
    };
    replay();
    return drawStore.subscribe((ev) => {
      if (ev.type === 'begin' && drawStore.current) paintStroke(ctx, drawStore.current, 0);
      else if (ev.type === 'points' && drawStore.current) {
        const stroke = drawStore.current;
        paintStroke(ctx, stroke, Math.max(0, stroke.points.length - ev.points.length - 1));
      } else if (ev.type === 'clear' || ev.type === 'sync') replay();
    });
  }, []);

  const toPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return [x, y];
  };

  const flush = () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    while (buffer.current.length > 0) socket.emit('draw:points', { points: buffer.current.splice(0, 200) });
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canDraw || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = toPoint(e);
    last.current = p;
    const strokeColor = tool === 'eraser' ? '#ffffff' : color;
    const strokeSize = size / CANVAS_W;
    drawStore.apply({ type: 'begin', color: strokeColor, size: strokeSize, tool, point: p });
    socket.emit('draw:begin', { color: strokeColor, size: strokeSize, tool, x: p[0], y: p[1] });
  };

  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const native = e.nativeEvent;
    const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    const sources = events.length > 0 ? events : [native];
    const batch: Point[] = [];
    for (const src of sources) {
      const p = toPoint(src);
      const ref = batch.length > 0 ? batch[batch.length - 1] : last.current;
      if (Math.hypot(p[0] - ref[0], p[1] - ref[1]) >= MIN_STEP) batch.push(p);
    }
    if (batch.length === 0) return;
    last.current = batch[batch.length - 1];
    drawStore.apply({ type: 'points', points: batch });
    buffer.current.push(...batch);
    if (!flushTimer.current) flushTimer.current = setTimeout(flush, 30);
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    flush();
    drawStore.apply({ type: 'end' });
    socket.emit('draw:end', {});
  };

  return (
    <canvas
      ref={canvasRef}
      className={`canvas${canDraw ? ' can-draw' : ''}`}
      width={CANVAS_W}
      height={CANVAS_H}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      aria-label={canDraw ? 'Área de desenho' : 'Desenho da rodada'}
    />
  );
}
