import type { Address, Hash } from 'viem';
import { abi } from './abi';
import { decodeCanvas } from './color';
import { address, client, deploymentBlock } from './config';
export interface Placement {
  pixelId: number;
  color: number;
  author: Address;
  blockNumber: bigint;
  blockHash: Hash;
  transactionHash: Hash;
  logIndex: number;
}
export interface Cursor {
  number: bigint;
  hash: Hash;
}
export const confirmationDepth = 2n;
const event = abi.find((item) => item.type === 'event' && item.name === 'PixelPlaced')!;
export function orderPlacements(items: Placement[]): Placement[] {
  return [
    ...new Map(items.map((item) => [`${item.blockHash}:${item.logIndex}`, item])).values(),
  ].sort((a, b) =>
    a.blockNumber < b.blockNumber
      ? -1
      : a.blockNumber > b.blockNumber
        ? 1
        : a.logIndex - b.logIndex,
  );
}
// Split failed log requests instead of skipping blocks. A failed single block is surfaced.
export async function readLogs(from: bigint, to: bigint, pixelId?: number): Promise<Placement[]> {
  if (from > to) return [];
  try {
    const logs = await client.getLogs({
      address: address!,
      event,
      args: pixelId === undefined ? undefined : { pixelId },
      fromBlock: from,
      toBlock: to,
      strict: true,
    });
    return logs
      .filter((log) => !log.removed)
      .map((log) => ({
        ...log.args,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
      })) as Placement[];
  } catch (error) {
    const message = String(
      (error as { shortMessage?: string; message?: string }).shortMessage ||
        (error as Error).message,
    );
    if (
      from === to ||
      !/range|too many|limit exceeded|response size|query returned|block limit|maximum|more than/i.test(
        message,
      )
    )
      throw error;
    const mid = (from + to) / 2n;
    // Sequential to respect public RPC rate limits.
    return [...(await readLogs(from, mid, pixelId)), ...(await readLogs(mid + 1n, to, pixelId))];
  }
}
export async function logRange(from: bigint, to: bigint, pixelId?: number): Promise<Placement[]> {
  const logs: Placement[] = [];
  for (let start = from; start <= to; start += 2000n)
    logs.push(...(await readLogs(start, start + 1999n < to ? start + 1999n : to, pixelId)));
  return orderPlacements(logs);
}
export async function confirmedBlock() {
  const latest = await client.getBlockNumber({ cacheTime: 0 });
  const number = latest >= confirmationDepth ? latest - confirmationDepth : 0n;
  return client.getBlock({ blockNumber: number });
}
export async function snapshot() {
  if (!address || deploymentBlock === undefined) throw new Error('Contract is not configured.');
  if ((await client.getChainId()) !== client.chain.id)
    throw new Error('The configured RPC serves the wrong network.');
  const block = await confirmedBlock();
  if (block.number < deploymentBlock)
    throw new Error('Waiting for the deployment to reach two confirmations.');
  const [words, code] = await Promise.all([
    client.readContract({
      address,
      abi,
      functionName: 'getPackedCanvas',
      blockNumber: block.number,
    }),
    client.getCode({ address, blockNumber: block.number }),
  ]);
  if (!code || code === '0x') throw new Error('No contract found at the configured address.');
  const from = block.number > 2000n ? block.number - 2000n : 0n;
  const recent = await logRange(from > deploymentBlock ? from : deploymentBlock, block.number);
  const check = await client.getBlock({ blockNumber: block.number });
  if (check.hash !== block.hash) throw new Error('Chain reorganized during loading. Retrying.');
  return {
    pixels: decodeCanvas(words as readonly bigint[]),
    cursor: { number: block.number, hash: block.hash },
    recent: recent.slice(-40).reverse(),
  };
}
export async function advance(cursor: Cursor) {
  let anchor;
  try {
    anchor = await client.getBlock({ blockNumber: cursor.number });
  } catch (error) {
    if (/block.+not.+found|could not be found/i.test(String((error as Error).message)))
      return { reorg: true as const };
    throw error;
  }
  if (anchor.hash !== cursor.hash) return { reorg: true as const };
  const block = await confirmedBlock();
  if (block.number < cursor.number) throw new Error('RPC is behind the last synchronized block.');
  const logs = await logRange(cursor.number + 1n, block.number);
  const [check, oldCheck] = await Promise.all([
    client.getBlock({ blockNumber: block.number }),
    client.getBlock({ blockNumber: cursor.number }),
  ]);
  if (check.hash !== block.hash || oldCheck.hash !== cursor.hash) return { reorg: true as const };
  return { reorg: false as const, cursor: { number: block.number, hash: block.hash }, logs };
}
export async function historyPage(pixelId: number, before: bigint) {
  const floor = deploymentBlock!;
  const from = before > 10000n ? before - 10000n + 1n : 0n;
  const start = from > floor ? from : floor;
  return {
    entries: (await logRange(start, before, pixelId)).reverse(),
    next: start > floor ? start - 1n : undefined,
  };
}
