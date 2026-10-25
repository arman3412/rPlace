import ganache from 'ganache';
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  encodeFunctionData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFile } from 'node:fs/promises';
export const localChain = defineChain({
  id: 31337,
  name: 'Local development',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});
export async function artifact(name = 'PixelChain') {
  return JSON.parse(await readFile(`artifacts/${name}.json`, 'utf8'));
}
export async function harness() {
  const provider = ganache.provider({
    logging: { quiet: true },
    chain: { chainId: 31337, hardfork: 'shanghai' },
    wallet: { totalAccounts: 12, deterministic: true },
    miner: { timestampIncrement: 1 },
  });
  const transport = custom(provider);
  const publicClient = createPublicClient({
    chain: localChain,
    transport,
    pollingInterval: 10,
    cacheTime: 0,
  });
  const accounts = Object.values(provider.getInitialAccounts()).map((a) =>
    privateKeyToAccount(a.secretKey),
  );
  const wallets = accounts.map((account) =>
    createWalletClient({ chain: localChain, transport, account }),
  );
  async function deploy(name = 'PixelChain') {
    const data = await artifact(name);
    const hash = await wallets[0].deployContract({
      abi: data.abi,
      bytecode: `0x${data.evm.bytecode.object}`,
    });
    const receipt = await publicClient.getTransactionReceipt({ hash });
    return { address: receipt.contractAddress, abi: data.abi, receipt };
  }
  async function time(seconds = 60) {
    await provider.request({ method: 'evm_increaseTime', params: [seconds] });
    await provider.request({ method: 'evm_mine', params: [] });
  }
  async function place(contract, who, id, color) {
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: accounts[who].address,
          to: contract.address,
          data: encodeFunctionData({
            abi: contract.abi,
            functionName: 'placePixel',
            args: [id, color],
          }),
          gas: '0x249f0',
        },
      ],
    });
    return publicClient.getTransactionReceipt({ hash });
  }
  return {
    provider,
    publicClient,
    accounts,
    wallets,
    deploy,
    time,
    place,
    close: () => provider.disconnect(),
  };
}
