import { harness } from './chain.mjs';
import { writeFile } from 'node:fs/promises';
const h = await harness();
const results = {
  compiler: 'solc 0.8.30 / optimizer 200 / Shanghai',
  chain: 'Local EVM execution gas, not Base L1 data fee',
  operations: {},
};
try {
  for (const name of [
    'PixelChain',
    'EventsOnly',
    'PerPixelWithOwner',
    'PackedNoCooldown',
    'PerPixelColorOnly',
  ]) {
    const c = await h.deploy(name);
    const stats = { deployment: Number(c.receipt.gasUsed) };
    for (const [label, who, id, color] of [
      ['first_wallet_empty_word', 1, 0, 0xff5733],
      ['new_wallet_existing_word', 2, 1, 0x123456],
      ['new_wallet_overwrite', 3, 0, 0xabcdef],
      ['returning_wallet_overwrite', 1, 0, 0x654321],
      ['returning_wallet_new_word', 1, 30, 0x010203],
      ['same_color', 1, 30, 0x010203],
      ['restore_white_in_nonempty_word', 1, 1, 0xffffff],
      ['clear_last_nonwhite_lane', 1, 30, 0xffffff],
    ]) {
      await h.time(60);
      const r = await h.place(c, who, id, color);
      if (r.status !== 'success') throw new Error(`${name}/${label} reverted`);
      stats[label] = Number(r.gasUsed);
    }
    if (name === 'PixelChain') {
      const data = (await import('viem')).encodeFunctionData({
        abi: c.abi,
        functionName: 'getPackedCanvas',
      });
      stats.full_canvas_call_gas = Number(
        await h.publicClient.estimateGas({ to: c.address, data }),
      );
      stats.return_bytes = 32000;
      // Grow activity without allocating history in storage. Cycle across packed words.
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        await h.time(60);
        await h.place(c, 0, (i * 37) % 10000, (i * 7919) % 0xffffff);
      }
      stats.placements_in_stress_run = 1000;
      stats.stress_seconds = Number(((performance.now() - start) / 1000).toFixed(2));
      stats.full_canvas_call_gas_after_stress = Number(
        await h.publicClient.estimateGas({ to: c.address, data }),
      );
      const historyStart = performance.now();
      const logs = await h.publicClient.getContractEvents({
        address: c.address,
        abi: c.abi,
        eventName: 'PixelPlaced',
        fromBlock: 0n,
        toBlock: 'latest',
      });
      stats.history_events = logs.length;
      stats.local_history_read_ms = Math.round(performance.now() - historyStart);
      await h.time(60);
      stats.placement_after_stress = Number((await h.place(c, 0, 0, 0x123456)).gasUsed);
    }
    results.operations[name] = stats;
  }
  await writeFile('docs/gas-benchmark.json', JSON.stringify(results, null, 2) + '\n');
  console.table(results.operations);
  console.log('Wrote docs/gas-benchmark.json');
} finally {
  await h.close();
}
