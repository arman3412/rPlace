import { useEffect, useRef, useState } from 'react';
import { Maximize, Minus, Plus, Move, Crosshair } from 'lucide-react';
export function PixelCanvas({
  pixels,
  selected,
  color,
  onSelect,
}: {
  pixels: Uint32Array;
  selected?: number;
  color: number;
  onSelect: (id: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 700, h: 600 });
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<number>();
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startX: 0, startY: 0, moved: false, distance: 0, multi: false });
  const cell = (Math.min(size.w - 64, size.h - 64) / 100) * view.zoom;
  const ox = (size.w - cell * 100) / 2 + view.x;
  const oy = (size.h - cell * 100) / 2 + view.y;
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(host.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.w * ratio;
    canvas.height = size.h * ratio;
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, size.w, size.h);
    const image = new ImageData(100, 100);
    for (let id = 0; id < 10000; id++) {
      image.data[id * 4] = pixels[id] >> 16;
      image.data[id * 4 + 1] = (pixels[id] >> 8) & 255;
      image.data[id * 4 + 2] = pixels[id] & 255;
      image.data[id * 4 + 3] = 255;
    }
    const offscreen = document.createElement('canvas');
    offscreen.width = 100;
    offscreen.height = 100;
    offscreen.getContext('2d')!.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, ox, oy, cell * 100, cell * 100);
    if (cell >= 9) {
      ctx.strokeStyle = 'rgba(0,0,0,.12)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        ctx.moveTo(ox + i * cell, oy);
        ctx.lineTo(ox + i * cell, oy + 100 * cell);
        ctx.moveTo(ox, oy + i * cell);
        ctx.lineTo(ox + 100 * cell, oy + i * cell);
      }
      ctx.stroke();
    }
    if (selected !== undefined) {
      const x = ox + (selected % 100) * cell,
        y = oy + Math.floor(selected / 100) * cell;
      ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(x, y, cell, cell);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 2, y - 2, cell + 4, cell + 4);
      ctx.strokeStyle = '#b9f66b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 3, y - 3, cell + 6, cell + 6);
    }
    if (hover !== undefined && hover !== selected) {
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + (hover % 100) * cell, oy + Math.floor(hover / 100) * cell, cell, cell);
    }
  }, [pixels, selected, color, size, view, hover, cell, ox, oy]);
  function hit(x: number, y: number) {
    const col = Math.floor((x - ox) / cell),
      row = Math.floor((y - oy) / cell);
    return col >= 0 && col < 100 && row >= 0 && row < 100 ? row * 100 + col : undefined;
  }
  function zoom(factor: number, x = size.w / 2, y = size.h / 2) {
    setView((v) => {
      const next = Math.min(16, Math.max(0.6, v.zoom * factor));
      const scale = next / v.zoom;
      return {
        zoom: next,
        x: (v.x - x + size.w / 2) * scale + x - size.w / 2,
        y: (v.y - y + size.h / 2) * scale + y - size.h / 2,
      };
    });
  }
  useEffect(() => {
    const element = ref.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * 0.002), event.clientX - rect.left, event.clientY - rect.top);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [size]);
  return (
    <div className="canvas-shell">
      <div className="canvas-topline">
        <span>
          <span className="tiny-square" /> THE SHARED CANVAS
        </span>
        <span>
          100 × 100 <i /> 10,000 possibilities
        </span>
      </div>
      <div className="canvas-viewport" ref={host}>
        <canvas
          ref={ref}
          aria-label="Shared pixel canvas. Click to select a pixel; drag to pan and scroll or pinch to zoom. Use coordinate inputs below for keyboard selection."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 1)
              gesture.current = {
                startX: e.clientX,
                startY: e.clientY,
                moved: false,
                distance: 0,
                multi: false,
              };
            else {
              const [a, b] = [...pointers.current.values()];
              gesture.current.multi = true;
              gesture.current.distance = Math.hypot(a.x - b.x, a.y - b.y);
            }
          }}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setHover(hit(e.clientX - rect.left, e.clientY - rect.top));
            const previous = pointers.current.get(e.pointerId);
            if (!previous) return;
            pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.current.size === 2) {
              const [a, b] = [...pointers.current.values()];
              const distance = Math.hypot(a.x - b.x, a.y - b.y);
              if (gesture.current.distance)
                zoom(
                  distance / gesture.current.distance,
                  (a.x + b.x) / 2 - rect.left,
                  (a.y + b.y) / 2 - rect.top,
                );
              gesture.current.distance = distance;
              gesture.current.moved = true;
            } else {
              if (
                Math.hypot(e.clientX - gesture.current.startX, e.clientY - gesture.current.startY) >
                4
              )
                gesture.current.moved = true;
              if (gesture.current.moved)
                setView((v) => ({
                  ...v,
                  x: v.x + e.clientX - previous.x,
                  y: v.y + e.clientY - previous.y,
                }));
            }
          }}
          onPointerUp={(e) => {
            if (!gesture.current.moved && !gesture.current.multi) {
              const rect = e.currentTarget.getBoundingClientRect();
              const id = hit(e.clientX - rect.left, e.clientY - rect.top);
              if (id !== undefined) onSelect(id);
            }
            pointers.current.delete(e.pointerId);
          }}
          onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
          onPointerLeave={() => setHover(undefined)}
        />
        <div className="canvas-coordinate">
          <Crosshair size={13} />
          {hover === undefined
            ? 'Explore the canvas'
            : `x ${hover % 100}  ·  y ${Math.floor(hover / 100)}`}
        </div>
        <div className="zoom-controls">
          <button aria-label="Zoom out" onClick={() => zoom(1 / 1.3)}>
            <Minus size={16} />
          </button>
          <span>{Math.round(view.zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoom(1.3)}>
            <Plus size={16} />
          </button>
          <div />
          <button aria-label="Reset canvas view" onClick={() => setView({ zoom: 1, x: 0, y: 0 })}>
            <Maximize size={16} />
          </button>
        </div>
      </div>
      <div className="canvas-bottomline">
        <span>
          <Move size={13} /> Drag to pan <i /> Scroll to zoom
        </span>
        <span>
          <span className="preview-dot" /> Selection is a preview
        </span>
      </div>
    </div>
  );
}
