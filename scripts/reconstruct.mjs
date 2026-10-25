import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { artifact } from './chain.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
const address = process.env.CONTRACT_ADDRESS;
const start = process.env.DEPLOYMENT_BLOCK;
if (!address || !/^0x[\da-f]{40}$/i.test(address) || !/^\d+$/.test(start || ''))
  throw new Error('Set CONTRACT_ADDRESS and DEPLOYMENT_BLOCK.');
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_URL || 'https://sepolia.base.org'),
});
if ((await client.getChainId()) !== 84532) throw new Error('Expected Base Sepolia.');
const { abi } = await artifact();
const head = await client.getBlockNumber();
const end = head > 2n ? head - 2n : 0n;
const anchor = await client.getBlock({ blockNumber: end });
const pixels = new Uint32Array(10000).fill(0xffffff),
  authors = Array(10000).fill(null),
  history = [];
async function scan(from, to) {
  try {
    return await client.getContractEvents({
      address,
      abi,
      eventName: 'PixelPlaced',
      fromBlock: from,
      toBlock: to,
      strict: true,
    });
  } catch (e) {
    if (
      from === to ||
      !/range|too many|limit exceeded|response size|query returned|block limit|maximum|more than/i.test(
        String(e.shortMessage || e.message),
      )
    )
      throw e;
    const mid = (from + to) / 2n;
    return [...(await scan(from, mid)), ...(await scan(mid + 1n, to))];
  }
}
for (let from = BigInt(start); from <= end; from += 2000n) {
  const to = from + 1999n < end ? from + 1999n : end;
  const logs = await scan(from, to);
  for (const log of logs) {
    pixels[log.args.pixelId] = log.args.color;
    authors[log.args.pixelId] = log.args.author;
    history.push({
      pixelId: log.args.pixelId,
      color: log.args.color,
      author: log.args.author,
      blockNumber: log.blockNumber.toString(),
      logIndex: log.logIndex,
      transactionHash: log.transactionHash,
    });
  }
  console.log(`Scanned through ${to}; ${history.length} placements`);
}
const words = await client.readContract({
  address,
  abi,
  functionName: 'getPackedCanvas',
  blockNumber: end,
});
for (let id = 0; id < 10000; id++)
  if (
    pixels[id] !==
    (Number((words[Math.floor(id / 10)] >> BigInt((id % 10) * 24)) & 0xffffffn) ^ 0xffffff)
  )
    throw new Error(`Mismatch at pixel ${id}; check address/deployment block/RPC.`);
if ((await client.getBlock({ blockNumber: end })).hash !== anchor.hash)
  throw new Error('Reorg during reconstruction; retry.');
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/reconstructed-canvas.json',
  JSON.stringify(
    {
      chainId: 84532,
      address,
      block: end.toString(),
      blockHash: anchor.hash,
      pixels: [...pixels],
      authors,
      history,
    },
    null,
    2,
  ),
);
console.log('All 10,000 pixels match on-chain state. Wrote artifacts/reconstructed-canvas.json');
