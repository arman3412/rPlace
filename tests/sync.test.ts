import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  getLogs: vi.fn(),
  getBlock: vi.fn(),
  getBlockNumber: vi.fn(),
  getChainId: vi.fn(),
  readContract: vi.fn(),
  getCode: vi.fn(),
}));
vi.mock('../src/lib/config', () => ({
  address: '0x1111111111111111111111111111111111111111',
  deploymentBlock: 10n,
  client: { ...fake, chain: { id: 84532 } },
}));
import {
  advance,
  historyPage,
  orderPlacements,
  readLogs,
  snapshot,
  type Placement,
} from '../src/lib/sync';
const placement = (n: bigint, index: number, color = 1) =>
  ({
    pixelId: 9,
    color,
    author: '0x11',
    blockNumber: n,
    blockHash: `0x${n}`,
    transactionHash: `0x${n}${index}`,
    logIndex: index,
  }) as Placement;
beforeEach(() => {
  vi.resetAllMocks();
});
describe('confirmed synchronization', () => {
  it('sorts same-block competing placements and deduplicates replayed logs', () => {
    const a = placement(4n, 1),
      b = placement(4n, 2),
      c = placement(3n, 1);
    expect(orderPlacements([b, a, c, a])).toEqual([c, a, b]);
  });
  it('splits provider-limited ranges without dropping blocks', async () => {
    fake.getLogs.mockImplementation(async ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock > 1n) throw new Error('block range limit exceeded');
      return [];
    });
    await readLogs(1n, 8n);
    expect(fake.getLogs).toHaveBeenCalledTimes(7);
  });
  it('does not multiply failed network requests or swallow single block failures', async () => {
    fake.getLogs.mockRejectedValue(new Error('Network unavailable'));
    await expect(readLogs(1n, 2000n)).rejects.toThrow('Network');
    expect(fake.getLogs).toHaveBeenCalledTimes(1);
    fake.getLogs.mockRejectedValue(new Error('response size limit exceeded'));
    await expect(readLogs(1n, 1n)).rejects.toThrow();
  });
  it('detects replaced cursor blocks before fetching deltas', async () => {
    fake.getBlock.mockResolvedValue({ hash: '0xnew' });
    expect(await advance({ number: 20n, hash: '0xold' })).toEqual({ reorg: true });
    expect(fake.getLogs).not.toHaveBeenCalled();
  });
  it('does not advance past missed updates after RPC failure', async () => {
    fake.getBlock.mockImplementation(async ({ blockNumber }) => ({
      number: blockNumber,
      hash: blockNumber === 20n ? '0xold' : '0xhead',
    }));
    fake.getBlockNumber.mockResolvedValue(25n);
    fake.getLogs.mockRejectedValue(new Error('Network down'));
    const cursor = { number: 20n, hash: '0xold' } as const;
    await expect(advance(cursor)).rejects.toThrow('Network');
    expect(cursor.number).toBe(20n);
  });
  it('rejects a snapshot whose endpoint block changed while loading', async () => {
    fake.getChainId.mockResolvedValue(84532);
    fake.getBlockNumber.mockResolvedValue(22n);
    fake.getBlock
      .mockResolvedValueOnce({ number: 20n, hash: '0xa' })
      .mockResolvedValueOnce({ number: 20n, hash: '0xb' });
    fake.readContract.mockResolvedValue(Array(1000).fill(0n));
    fake.getCode.mockResolvedValue('0x01');
    fake.getLogs.mockResolvedValue([]);
    await expect(snapshot()).rejects.toThrow('reorganized');
    expect(fake.readContract.mock.calls[0][0].blockNumber).toBe(20n);
  });
  it('pins history pagination and indexes the requested pixel', async () => {
    fake.getLogs.mockResolvedValue([]);
    const page = await historyPage(99, 20000n);
    expect(page.next).toBe(10000n);
    expect(fake.getLogs.mock.calls[0][0].args).toEqual({ pixelId: 99 });
    const final = await historyPage(99, 20n);
    expect(final.next).toBeUndefined();
  });
});
