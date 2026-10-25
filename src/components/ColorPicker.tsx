import { useEffect, useState } from 'react';
import { Check, Pipette } from 'lucide-react';
import { fromRgb, parseHex, rgb, toHex } from '../lib/color';
export function ColorPicker({ color, onChange }: { color: number; onChange: (n: number) => void }) {
  const [hex, setHex] = useState(toHex(color));
  const [channels, setChannels] = useState(rgb(color).map(String));
  const [recent, setRecent] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('pixelchain-colors') || '[]');
      return Array.isArray(saved)
        ? saved.filter((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffff).slice(0, 8)
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    setHex(toHex(color));
    setChannels(rgb(color).map(String));
  }, [color]);
  function remember(n: number) {
    const next = [n, ...recent.filter((c) => c !== n)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem('pixelchain-colors', JSON.stringify(next));
    } catch {
      /* storage optional */
    }
  }
  const validHex = parseHex(hex) !== null;
  return (
    <section className="panel color-panel">
      <div className="section-label">
        <span>01 / PICK YOUR COLOR</span>
        <Pipette size={15} />
      </div>
      <div className="color-visual" style={{ backgroundColor: toHex(color) }}>
        <input
          type="color"
          aria-label="Visual color picker"
          value={toHex(color)}
          onChange={(e) => onChange(parseHex(e.target.value)!)}
          onBlur={() => remember(color)}
        />
        <span>Every shade is yours.</span>
        <Pipette size={21} />
      </div>
      <div className="hex-row">
        <label htmlFor="hex-color">HEX</label>
        <input
          id="hex-color"
          value={hex}
          aria-invalid={!validHex}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            setHex(e.target.value);
            const parsed = parseHex(e.target.value);
            if (parsed !== null) onChange(parsed);
          }}
          onBlur={() => {
            setHex(toHex(color));
            remember(color);
          }}
        />
        <span className="color-chip" style={{ background: toHex(color) }} />
      </div>
      <div className="rgb-inputs">
        {['R', 'G', 'B'].map((label, i) => (
          <label key={label}>
            <span>{label}</span>
            <input
              type="number"
              aria-label={{ R: 'Red', G: 'Green', B: 'Blue' }[label]}
              min="0"
              max="255"
              step="1"
              value={channels[i]}
              aria-invalid={
                channels[i] === '' ||
                !Number.isInteger(Number(channels[i])) ||
                Number(channels[i]) < 0 ||
                Number(channels[i]) > 255
              }
              onChange={(e) => {
                const next = [...channels];
                next[i] = e.target.value;
                setChannels(next);
                if (next.every((v) => v !== '')) {
                  const n = fromRgb(next.map(Number));
                  if (n !== null) onChange(n);
                }
              }}
              onBlur={() => {
                setChannels(rgb(color).map(String));
                remember(color);
              }}
            />
          </label>
        ))}
      </div>
      <div className="recent-label">
        RECENT COLORS <span>16.7M colors supported</span>
      </div>
      <div className="swatches">
        {recent.length ? (
          recent.map((n) => (
            <button
              key={n}
              aria-label={`Use ${toHex(n)}`}
              title={toHex(n)}
              style={{ background: toHex(n) }}
              onClick={() => onChange(n)}
            >
              {n === color && <Check size={13} color={n > 0x888888 ? '#111' : '#fff'} />}
            </button>
          ))
        ) : (
          <span className="empty-colors">Your colors will appear here.</span>
        )}
      </div>
    </section>
  );
}
