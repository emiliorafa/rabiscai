import type { Tool } from '../../../shared/protocol';

export const COLORS = [
  '#22223b', '#6b7280', '#ffffff', '#ff5d73', '#ff8c42', '#ffc93c',
  '#2ec4a6', '#3a86ff', '#8b5cf6', '#f472b6', '#8d5524', '#14532d',
];

interface Props {
  color: string;
  size: number;
  tool: Tool;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
  onTool: (t: Tool) => void;
  onClear: () => void;
}

export function Toolbar({ color, size, tool, onColor, onSize, onTool, onClear }: Props) {
  return (
    <div className="card toolbar" role="toolbar" aria-label="Ferramentas de desenho">
      <div className="swatches">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${tool === 'pen' && color === c ? ' active' : ''}`}
            style={{ background: c }}
            aria-label={`Cor ${c}`}
            aria-pressed={tool === 'pen' && color === c}
            onClick={() => {
              onColor(c);
              onTool('pen');
            }}
          />
        ))}
      </div>
      <label className="size-control">
        <span className="brush-preview" aria-hidden="true">
          <i style={{ width: Math.max(4, size / 1.6), height: Math.max(4, size / 1.6), background: tool === 'eraser' ? '#fff' : color }} />
        </span>
        <input type="range" min={2} max={60} value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label="Espessura do pincel" />
      </label>
      <div className="tool-buttons">
        <button type="button" className={`btn btn-small${tool === 'pen' ? ' btn-active' : ''}`} onClick={() => onTool('pen')} aria-pressed={tool === 'pen'}>
          ✏️ Pincel
        </button>
        <button type="button" className={`btn btn-small${tool === 'eraser' ? ' btn-active' : ''}`} onClick={() => onTool('eraser')} aria-pressed={tool === 'eraser'}>
          🧽 Borracha
        </button>
        <button type="button" className="btn btn-small btn-tomato" onClick={onClear}>
          🗑️ Limpar
        </button>
      </div>
    </div>
  );
}
