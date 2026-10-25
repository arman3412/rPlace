export const WHITE = 0xffffff;
export function toHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0').toUpperCase()}`;
}
export function parseHex(value: string): number | null {
  return /^#?[\da-f]{6}$/i.test(value) ? Number.parseInt(value.replace('#', ''), 16) : null;
}
export function rgb(color: number): [number, number, number] {
  return [(color >> 16) & 255, (color >> 8) & 255, color & 255];
}
export function fromRgb(channels: number[]): number | null {
  return channels.length === 3 && channels.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? (channels[0] << 16) | (channels[1] << 8) | channels[2]
    : null;
}
export function decodeCanvas(words: readonly bigint[]): Uint32Array {
  if (words.length !== 1000) throw new Error('Invalid packed canvas length');
  return Uint32Array.from(
    { length: 10000 },
    (_, id) => Number((words[Math.floor(id / 10)] >> BigInt((id % 10) * 24)) & 0xffffffn) ^ WHITE,
  );
}
export function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}
