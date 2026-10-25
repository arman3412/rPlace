import { describe, it, expect } from 'vitest';
import { decodeCanvas, fromRgb, parseHex, rgb, toHex } from '../src/lib/color';
describe('exact RGB representation', () => {
  it('roundtrips black, white, boundary channels and arbitrary full RGB', () => {
    for (const color of [0, 0xffffff, 0xff5733, 1, 0x010000, 0x00ff00, 0xabcdef]) {
      expect(parseHex(toHex(color))).toBe(color);
      expect(fromRgb(rgb(color))).toBe(color);
    }
  });
  it('rejects malformed hex, fractional, missing and out-of-range channels', () => {
    for (const hex of ['#FFF', '#12345G', '1234567', 'rgb(1,2,3)', ''])
      expect(parseHex(hex)).toBeNull();
    for (const channels of [
      [256, 0, 0],
      [-1, 0, 0],
      [1.5, 0, 0],
      [NaN, 2, 3],
      [1, 2],
    ])
      expect(fromRgb(channels)).toBeNull();
  });
  it('decodes all 10,000 pixels, white default and adjacent packed lanes', () => {
    const words = Array<bigint>(1000).fill(0n);
    words[0] = BigInt(0xff5733 ^ 0xffffff) | (BigInt(0xffffff) << 216n);
    words[999] = BigInt(0x123456 ^ 0xffffff) << 216n;
    const pixels = decodeCanvas(words);
    expect(pixels.length).toBe(10000);
    expect(pixels[0]).toBe(0xff5733);
    expect(pixels[1]).toBe(0xffffff);
    expect(pixels[9]).toBe(0);
    expect(pixels[9999]).toBe(0x123456);
    expect(() => decodeCanvas([])).toThrow();
  });
});
