import type { Point, StrokeData, Tool } from '../../../shared/protocol';

export type DrawEvent =
  | { type: 'begin'; color: string; size: number; tool: Tool; point: Point }
  | { type: 'points'; points: Point[] }
  | { type: 'end' }
  | { type: 'clear' }
  | { type: 'sync'; strokes: StrokeData[] };

type Listener = (event: DrawEvent) => void;

/**
 * Guarda o desenho atual fora do React. Assim, quem entra no meio da rodada (ou a tela que
 * monta depois do evento `draw:sync`) consegue redesenhar tudo a partir dos traços.
 */
class DrawStore {
  strokes: StrokeData[] = [];
  current: StrokeData | null = null;
  private listeners = new Set<Listener>();

  apply(event: DrawEvent): void {
    switch (event.type) {
      case 'begin': {
        const stroke: StrokeData = { color: event.color, size: event.size, tool: event.tool, points: [event.point] };
        this.strokes.push(stroke);
        this.current = stroke;
        break;
      }
      case 'points':
        if (!this.current) return;
        this.current.points.push(...event.points);
        break;
      case 'end':
        this.current = null;
        break;
      case 'clear':
        this.strokes = [];
        this.current = null;
        break;
      case 'sync':
        this.strokes = event.strokes.map((s) => ({ ...s, points: [...s.points] }));
        this.current = null;
        break;
    }
    this.listeners.forEach((fn) => fn(event));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const drawStore = new DrawStore();
