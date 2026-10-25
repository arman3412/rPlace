import ganache from 'ganache';
import { createPublicClient, createWalletClient, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { artifact, localChain } from './chain.mjs';
import { createServer } from 'vite';
const server = ganache.server({
  logging: { quiet: true },
  chain: { chainId: 31337, hardfork: 'shanghai' },
  wallet: { mnemonic: 'test test test test test test test test test test test junk' },
  miner: { blockTime: 1 },
});
await server.listen(18545, '127.0.0.1');
const account = mnemonicToAccount('test test test test test test test test test test test junk');
const transport = http('http://127.0.0.1:18545');
const client = createPublicClient({ chain: localChain, transport, pollingInterval: 100 });
const wallet = createWalletClient({ chain: localChain, transport, account });
const data = await artifact();
const hash = await wallet.deployContract({
  abi: data.abi,
  bytecode: `0x${data.evm.bytecode.object}`,
});
const receipt = await client.waitForTransactionReceipt({ hash });
process.env.VITE_CONTRACT_ADDRESS = receipt.contractAddress;
process.env.VITE_DEPLOYMENT_BLOCK = String(receipt.blockNumber);
process.env.VITE_LOCAL_CHAIN = 'true';
process.env.VITE_RPC_URL = 'http://127.0.0.1:18545';
const vite = await createServer({ server: { host: '127.0.0.1', port: 4173, strictPort: true } });
await vite.listen();
console.log('E2E frontend ready at http://127.0.0.1:4173');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    await vite.close();
    await server.close();
    process.exit(0);
  });
