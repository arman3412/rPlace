import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEventLog, encodeFunctionData, encodeAbiParameters, concatHex } from 'viem';
import { harness } from '../scripts/chain.mjs';
let h, c;
before(async () => {
  h = await harness();
  c = await h.deploy();
});
after(async () => {
  await h?.close();
});
const read = (fn, args = []) =>
  h.publicClient.readContract({ address: c.address, abi: c.abi, functionName: fn, args });
test('initial entire canvas is white with zero storage; single bounded read', async () => {
  const words = await read('getPackedCanvas');
  assert.equal(words.length, 1000);
  assert(words.every((w) => w === 0n));
  assert.equal(await read('getPixel', [0]), 0xffffff);
  assert.equal(await read('getPixel', [9999]), 0xffffff);
  assert.match(await h.publicClient.getStorageAt({ address: c.address, slot: '0x0' }), /^0x0*$/);
});
test('first placement is immediately available and records exact 24-bit RGB and author', async () => {
  const r = await h.place(c, 1, 0, 0xff5733);
  assert.equal(r.status, 'success');
  assert.equal(await read('getPixel', [0]), 0xff5733);
  const event = decodeEventLog({ abi: c.abi, data: r.logs[0].data, topics: r.logs[0].topics });
  assert.equal(event.args.pixelId, 0);
  assert.equal(event.args.color, 0xff5733);
  assert.equal(event.args.author.toLowerCase(), h.accounts[1].address.toLowerCase());
});
test('cooldown rejects same-wallet placement without modifying state', async () => {
  const r = await h.place(c, 1, 1, 0);
  assert.equal(r.status, 'reverted');
  assert.equal(await read('getPixel', [1]), 0xffffff);
  await assert.rejects(
    h.publicClient.simulateContract({
      address: c.address,
      abi: c.abi,
      functionName: 'placePixel',
      args: [1, 0],
      account: h.accounts[1],
    }),
    /revert/,
  );
});
test('cooldown is per-wallet, overwrite follows receipt/log ordering', async () => {
  const a = await h.place(c, 2, 0, 0x000000);
  const b = await h.place(c, 3, 0, 0x123456);
  assert.equal(a.status, 'success');
  assert.equal(b.status, 'success');
  assert.equal(await read('getPixel', [0]), 0x123456);
});
test('cooldown boundary: 59 seconds rejected and 60 seconds accepted', async () => {
  const first = await h.place(c, 8, 222, 0x010203);
  const block = await h.publicClient.getBlock({ blockNumber: first.blockNumber });
  await h.provider.request({ method: 'evm_mine', params: [Number(block.timestamp + 59n)] });
  assert.equal((await h.publicClient.getBlock()).timestamp, block.timestamp + 59n);
  await assert.rejects(
    h.publicClient.simulateContract({
      address: c.address,
      abi: c.abi,
      functionName: 'placePixel',
      args: [223, 0],
      account: h.accounts[8],
    }),
    /revert/,
  );
  await h.provider.request({ method: 'evm_mine', params: [Number(block.timestamp + 60n)] });
  await h.publicClient.simulateContract({
    address: c.address,
    abi: c.abi,
    functionName: 'placePixel',
    args: [223, 0],
    account: h.accounts[8],
  });
});
test('all lanes and slot boundaries preserve neighbors, black and white roundtrip', async () => {
  for (let lane = 0; lane < 12; lane++) {
    await h.time();
    const color = lane === 0 ? 0 : lane === 11 ? 0xffffff : 0x010101 * lane;
    const r = await h.place(c, 0, 10 + lane, color);
    assert.equal(r.status, 'success');
  }
  for (let lane = 0; lane < 12; lane++)
    assert.equal(
      await read('getPixel', [10 + lane]),
      lane === 0 ? 0 : lane === 11 ? 0xffffff : 0x010101 * lane,
    );
  await h.time();
  await h.place(c, 0, 9999, 0xabcdef);
  assert.equal(await read('getPixel', [9999]), 0xabcdef);
});
test('bounds and ABI reject invalid pixel ids, RGB overflow and negative values', async () => {
  assert.equal((await h.place(c, 4, 10000, 0)).status, 'reverted');
  assert.equal((await h.place(c, 4, 65535, 0)).status, 'reverted');
  for (const args of [
    [-1, 0],
    [65536, 0],
    [1, 0x1000000],
    [1, -1],
  ])
    assert.throws(() => encodeFunctionData({ abi: c.abi, functionName: 'placePixel', args }));
  await assert.rejects(read('getPixel', [10000]), /revert/);
});
test('event reconstruction equals full state; indexed history identifies last author', async () => {
  const logs = await h.publicClient.getContractEvents({
    address: c.address,
    abi: c.abi,
    eventName: 'PixelPlaced',
    fromBlock: 0n,
    toBlock: 'latest',
  });
  const replay = new Uint32Array(10000).fill(0xffffff);
  for (const log of logs) replay[log.args.pixelId] = log.args.color;
  const words = await read('getPackedCanvas');
  for (let id = 0; id < 10000; id++) {
    const actual =
      Number((words[Math.floor(id / 10)] >> BigInt((id % 10) * 24)) & 0xffffffn) ^ 0xffffff;
    assert.equal(actual, replay[id]);
  }
  const history = await h.publicClient.getContractEvents({
    address: c.address,
    abi: c.abi,
    eventName: 'PixelPlaced',
    args: { pixelId: 0 },
    fromBlock: 0n,
    toBlock: 'latest',
  });
  assert.equal(history.length, 3);
  assert.equal(history.at(-1).args.author.toLowerCase(), h.accounts[3].address.toLowerCase());
});
test('reverted transactions emit no history and cannot consume another wallet cooldown', async () => {
  assert.equal(await read('lastPlacement', [h.accounts[4].address]), 0n);
  const logs = await h.publicClient.getContractEvents({
    address: c.address,
    abi: c.abi,
    eventName: 'PixelPlaced',
    args: { pixelId: 10000 },
    fromBlock: 0n,
    toBlock: 'latest',
  });
  assert.equal(logs.length, 0);
});
test('same-block competing users resolve by transaction index', async () => {
  await h.provider.request({ method: 'miner_stop', params: [] });
  const hashes = await Promise.all(
    [5, 6].map((who) =>
      h.wallets[who].writeContract({
        address: c.address,
        abi: c.abi,
        functionName: 'placePixel',
        args: [555, who],
        gas: 150000n,
      }),
    ),
  );
  await h.provider.request({ method: 'evm_mine', params: [] });
  await h.provider.request({ method: 'miner_start', params: [1] });
  const receipts = await Promise.all(
    hashes.map((hash) => h.publicClient.getTransactionReceipt({ hash })),
  );
  assert.equal(receipts[0].blockNumber, receipts[1].blockNumber);
  const sorted = receipts.sort((a, b) => a.transactionIndex - b.transactionIndex);
  const last = decodeEventLog({
    abi: c.abi,
    data: sorted.at(-1).logs[0].data,
    topics: sorted.at(-1).logs[0].topics,
  });
  assert.equal(await read('getPixel', [555]), last.args.color);
});

test('raw malformed calldata cannot bypass uint24 validation; payable transfers rejected', async () => {
  const selector = encodeFunctionData({
    abi: c.abi,
    functionName: 'placePixel',
    args: [1, 0],
  }).slice(0, 10);
  const malformed = concatHex([
    selector,
    encodeAbiParameters([{ type: 'uint256' }, { type: 'uint256' }], [1n, 0x1000000n]),
  ]);
  const hash = await h.wallets[4].sendTransaction({ to: c.address, data: malformed, gas: 150000n });
  assert.equal((await h.publicClient.getTransactionReceipt({ hash })).status, 'reverted');
  const payment = await h.wallets[4].sendTransaction({
    to: c.address,
    value: 1n,
    data: encodeFunctionData({ abi: c.abi, functionName: 'placePixel', args: [1, 0] }),
    gas: 150000n,
  });
  assert.equal((await h.publicClient.getTransactionReceipt({ hash: payment })).status, 'reverted');
  assert.equal(await read('lastPlacement', [h.accounts[4].address]), 0n);
});
