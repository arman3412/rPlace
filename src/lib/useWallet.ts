import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createWalletClient, custom, type Address, type EIP1193Provider } from 'viem';
import { chain, rpcUrl, readableError } from './config';
export type InjectedProvider = EIP1193Provider & {
  on?: (event: string, fn: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, fn: (...args: unknown[]) => void) => void;
};
declare global {
  interface Window {
    ethereum?: InjectedProvider;
  }
}
export function useWallet() {
  // Preserve the original wallet send failure if an optional namespace fallback fails.
  const sendError = useRef<unknown>(undefined);
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<InjectedProvider>();
  const [providers, setProviders] = useState<
    { name: string; uuid: string; provider: InjectedProvider }[]
  >([]);
  useEffect(() => {
    const announce = (event: Event) => {
      const detail = (
        event as CustomEvent<{ info: { name: string; uuid: string }; provider: InjectedProvider }>
      ).detail;
      setProviders((previous) =>
        previous.some((p) => p.uuid === detail.info.uuid)
          ? previous
          : [...previous, { ...detail.info, provider: detail.provider }],
      );
    };
    window.addEventListener('eip6963:announceProvider', announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    if (window.ethereum) setProvider(window.ethereum);
    return () => window.removeEventListener('eip6963:announceProvider', announce);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const accounts = (...args: unknown[]) => setAccount((args[0] as Address[])[0]);
    const network = (...args: unknown[]) => setChainId(Number(args[0]));
    const disconnected = () => {
      setAccount(undefined);
      setChainId(undefined);
    };
    provider.on?.('accountsChanged', accounts);
    provider.on?.('chainChanged', network);
    provider.on?.('disconnect', disconnected);
    void Promise.all([
      provider.request({ method: 'eth_accounts' }),
      provider.request({ method: 'eth_chainId' }),
    ])
      .then(([addresses, id]) => {
        setAccount(addresses[0]);
        setChainId(Number(id));
      })
      .catch(() => {});
    return () => {
      provider.removeListener?.('accountsChanged', accounts);
      provider.removeListener?.('chainChanged', network);
      provider.removeListener?.('disconnect', disconnected);
    };
  }, [provider]);
  const connect = useCallback(
    async (chosen = provider ?? providers[0]?.provider) => {
      if (!chosen) {
        setError(
          'Install MetaMask or another Ethereum wallet to place pixels. You can browse without a wallet.',
        );
        return false;
      }
      setBusy(true);
      setError('');
      try {
        setProvider(chosen);
        const addresses = await chosen.request({ method: 'eth_requestAccounts' });
        setAccount(addresses[0]);
        setChainId(Number(await chosen.request({ method: 'eth_chainId' })));
        return true;
      } catch (err) {
        setError(readableError(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [provider, providers],
  );
  async function switchNetwork() {
    if (!provider) return;
    setBusy(true);
    setError('');
    try {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chain.id.toString(16)}` }],
        });
      } catch (err) {
        if ((err as { code: number }).code !== 4902) throw err;
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: `0x${chain.id.toString(16)}`,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: [rpcUrl],
              ...(chain.blockExplorers
                ? { blockExplorerUrls: [chain.blockExplorers.default.url] }
                : {}),
            },
          ],
        });
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chain.id.toString(16)}` }],
        });
      }
      setChainId(Number(await provider.request({ method: 'eth_chainId' })));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }
  const wallet = useMemo(
    () =>
      provider
        ? createWalletClient({
            chain,
            transport: custom({
              async request(args: { method: string; params?: unknown }) {
                if (args.method === 'eth_sendTransaction') sendError.current = undefined;
                try {
                  const result = await provider.request(
                    args as Parameters<EIP1193Provider['request']>[0],
                  );
                  if (
                    args.method === 'eth_sendTransaction' ||
                    args.method === 'wallet_sendTransaction'
                  )
                    sendError.current = undefined;
                  return result;
                } catch (error) {
                  if (args.method === 'eth_sendTransaction') sendError.current = error;
                  throw error;
                }
              },
            }),
          })
        : undefined,
    [provider],
  );
  return {
    account,
    chainId,
    error,
    busy,
    providers,
    connect,
    switchNetwork,
    disconnect: () => {
      setAccount(undefined);
      setProvider(undefined);
    },
    wallet,
    takeSendError: () => {
      const error = sendError.current;
      sendError.current = undefined;
      return error;
    },
  };
}
