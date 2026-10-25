import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { artifact, localChain } from './chain.mjs';
import { writeFile } from 'node:fs/promises';
const local = process.argv.includes('--local');
if (
  !local &&
  (!process.argv.includes('--base-sepolia') || !process.argv.includes('--confirm-testnet'))
)
  throw new Error(
    'Live deployment is opt-in. After approval, pass --base-sepolia --confirm-testnet.',
  );
const chain = local ? localChain : baseSepolia;
const rpc = local
  ? 'http://127.0.0.1:8545'
  : process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
if (!local && !process.env.DEPLOYER_PRIVATE_KEY)
  throw new Error(
    'Set DEPLOYER_PRIVATE_KEY in your shell for a dedicated testnet account. Never add it to VITE_ variables or source control.',
  );
const account = local
  ? mnemonicToAccount('test test test test test test test test test test test junk')
  : privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
const publicClient = createPublicClient({ chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== chain.id)
  throw new Error('RPC chain mismatch; refusing deployment.');
const wallet = createWalletClient({ chain, transport: http(rpc), account });
const data = await artifact();
const hash = await wallet.deployContract({
  abi: data.abi,
  bytecode: `0x${data.evm.bytecode.object}`,
});
console.log(`Deployment submitted: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({
  hash,
  confirmations: local ? 1 : 3,
});
if (receipt.status !== 'success') throw new Error('Deployment reverted.');
console.log(
  `Contract: ${receipt.contractAddress}\nDeployment block: ${receipt.blockNumber}\nGas: ${receipt.gasUsed}`,
);
const config = `VITE_CONTRACT_ADDRESS=${receipt.contractAddress}\nVITE_DEPLOYMENT_BLOCK=${receipt.blockNumber}\nVITE_RPC_URL=${local ? rpc : 'https://sepolia.base.org'}\nVITE_LOCAL_CHAIN=${local}\n`;
if (local) {
  await writeFile('.env.local', config);
  console.log('Wrote .env.local. Start/restart npm run dev.');
} else
  console.log(`Set these public frontend variables (only use a browser-safe RPC URL):\n${config}`);
