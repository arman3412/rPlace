import ganache from 'ganache';
const server = ganache.server({
  chain: { chainId: 31337, hardfork: 'shanghai' },
  wallet: {
    mnemonic: 'test test test test test test test test test test test junk',
    totalAccounts: 10,
  },
  logging: { quiet: true },
  miner: { blockTime: 1 },
});
await server.listen(8545, '127.0.0.1');
console.log('PixelChain LOCAL TEST CHAIN http://127.0.0.1:8545 (31337)');
console.log('Public test mnemonic (NEVER fund these accounts on a public network):');
console.log('test test test test test test test test test test test junk');
console.log('Use npm run deploy:local in another terminal.');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
