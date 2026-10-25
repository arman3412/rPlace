import { createPublicClient, defineChain, http, isAddress, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
const local = import.meta.env.VITE_LOCAL_CHAIN === 'true';
export const chain = local
  ? defineChain({
      id: 31337,
      name: 'Local development',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
    })
  : baseSepolia;
export const rpcUrl = import.meta.env.VITE_RPC_URL || chain.rpcUrls.default.http[0];
const rawAddress = import.meta.env.VITE_CONTRACT_ADDRESS || '';
const rawBlock = import.meta.env.VITE_DEPLOYMENT_BLOCK || '';
export const address =
  isAddress(rawAddress) && rawAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
    ? (rawAddress as Address)
    : undefined;
export const deploymentBlock = /^\d+$/.test(rawBlock) ? BigInt(rawBlock) : undefined;
export const configured = Boolean(address && deploymentBlock !== undefined);
export const client = createPublicClient({
  chain,
  transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }),
});
export const explorer = local ? undefined : 'https://sepolia.basescan.org';
export function txUrl(hash: string) {
  return explorer ? `${explorer}/tx/${hash}` : undefined;
}
export function readableError(error: unknown): string {
  const parts: string[] = [];
  let cursor = error as
    | { shortMessage?: string; message?: string; details?: string; code?: number; cause?: unknown }
    | undefined;
  let rejected = false;
  for (let depth = 0; cursor && depth < 10; depth++) {
    if (cursor.code === 4001) rejected = true;
    parts.push(cursor.shortMessage || '', cursor.message || '', cursor.details || '');
    cursor = cursor.cause as typeof cursor;
  }
  const full = parts.join(' ');
  const root = error as { shortMessage?: string; message?: string };
  const message =
    root?.shortMessage || root?.message || 'An unexpected error occurred. Please try again.';
  if (rejected || /user rejected|denied|rejected the request/i.test(full))
    return 'Request declined in your wallet. Your pixel was not placed.';
  if (/insufficient funds/i.test(full))
    return 'Not enough test ETH for gas. Fund your wallet with Base Sepolia ETH.';
  if (/CooldownActive/i.test(full))
    return 'Your on-chain cooldown is still active. Wait a moment and try again.';
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}
