import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Globe2,
  Layers3,
  LoaderCircle,
  MousePointer2,
  Radio,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { type Hash } from 'viem';
import { PixelCanvas } from './components/Canvas';
import { ColorPicker } from './components/ColorPicker';
import { abi } from './lib/abi';
import {
  address,
  chain,
  client,
  configured,
  deploymentBlock,
  explorer,
  readableError,
  txUrl,
} from './lib/config';
import { rgb, shortAddress, toHex } from './lib/color';
import { historyPage, orderPlacements, type Placement } from './lib/sync';
import { useCanvas } from './lib/useCanvas';
import { useWallet } from './lib/useWallet';

const pendingKey = `pixelchain-pending-${chain.id}-${address}`;
function savedHash(): Hash | undefined {
  try {
    const value = localStorage.getItem(pendingKey);
    return value && /^0x[\da-f]{64}$/i.test(value) ? (value as Hash) : undefined;
  } catch {
    return;
  }
}
function LinkOut({ hash, children }: { hash: Hash; children?: React.ReactNode }) {
  const url = txUrl(hash);
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {children || <ArrowUpRight size={14} />}
    </a>
  ) : (
    <span title={hash}>{children || shortAddress(hash)}</span>
  );
}
function ActivityRow({ item, onSelect }: { item: Placement; onSelect: (id: number) => void }) {
  return (
    <div className="activity-row">
      <span className="activity-color" style={{ background: toHex(item.color) }} />
      <div>
        <button className="text-button address" onClick={() => onSelect(item.pixelId)}>
          {shortAddress(item.author)}
        </button>
        <span className="activity-description">
          placed <b>{toHex(item.color)}</b> at{' '}
          <button className="text-button" onClick={() => onSelect(item.pixelId)}>
            ({item.pixelId % 100}, {Math.floor(item.pixelId / 100)})
          </button>
        </span>
      </div>
      <div className="activity-block">
        #{item.blockNumber.toString()}
        <LinkOut hash={item.transactionHash} />
      </div>
    </div>
  );
}
function PixelHistory({
  pixelId,
  block,
  recent,
  onSelect,
}: {
  pixelId: number;
  block?: bigint;
  recent: Placement[];
  onSelect: (id: number) => void;
}) {
  const [entries, setEntries] = useState<Placement[]>([]);
  const [next, setNext] = useState<bigint>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const generation = useRef(0);
  async function load(before: bigint, current = generation.current) {
    setBusy(true);
    setError('');
    try {
      const page = await historyPage(pixelId, before);
      if (current !== generation.current) return;
      setEntries((previous) => orderPlacements([...previous, ...page.entries]).reverse());
      setNext(page.next);
      setLoaded(true);
    } catch (err) {
      if (current === generation.current) setError(readableError(err));
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    const current = ++generation.current;
    setEntries([]);
    setLoaded(false);
    setNext(undefined);
    if (block !== undefined) void load(block, current);
    return () => {
      generation.current++;
    };
  }, [pixelId, block === undefined]);
  const all = orderPlacements([
    ...entries,
    ...recent.filter((p) => p.pixelId === pixelId),
  ]).reverse();
  return (
    <div className="pixel-history">
      <div className="section-label">
        <span>PIXEL HISTORY</span>
        <ShieldCheck size={14} />
      </div>
      <div className="last-author">
        Last placed by{' '}
        <strong>
          {all[0]
            ? shortAddress(all[0].author)
            : busy || !loaded
              ? 'Checking…'
              : next !== undefined
                ? 'Search older blocks'
                : 'No placements'}
        </strong>
      </div>
      {all.slice(0, visibleCount).map((p) => (
        <ActivityRow key={`${p.blockHash}-${p.logIndex}`} item={p} onSelect={onSelect} />
      ))}
      {all.length > visibleCount && (
        <button
          className="secondary-button full"
          onClick={() => setVisibleCount((count) => count + 30)}
        >
          Show more loaded placements ({all.length - visibleCount})
        </button>
      )}
      {error && <p className="inline-error">{error}</p>}
      {all.length === 0 && (
        <p className="muted history-empty">
          {!configured
            ? 'Connect a deployed contract to browse verifiable history.'
            : busy
              ? 'Searching indexed blockchain logs…'
              : next !== undefined
                ? 'No placements in this range. Search older blocks to find this pixel’s last author.'
                : 'This pixel is waiting for its first mark.'}
        </p>
      )}
      {configured && (next !== undefined || error) && (
        <button
          className="secondary-button full"
          disabled={busy}
          onClick={() => void load(next ?? block!)}
        >
          {busy ? <LoaderCircle size={14} className="spin" /> : <Clock3 size={14} />}{' '}
          {busy ? 'Searching…' : error ? 'Retry history' : 'Search older blocks'}
        </button>
      )}
      {next !== undefined && (
        <small className="muted">
          Searched through block {(next + 1n).toString()}. History is paginated; no indexer
          required.
        </small>
      )}
    </div>
  );
}
export default function App() {
  const canvas = useCanvas();
  const wallet = useWallet();
  const [color, setColor] = useState(0xb9f66b);
  const [selected, setSelected] = useState<number>();
  const [coords, setCoords] = useState(['', '']);
  const [modal, setModal] = useState<'help' | 'wallet' | 'confirm' | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [last, setLast] = useState(0);
  const [cooldownError, setCooldownError] = useState('');
  const [phase, setPhase] = useState<
    'idle' | 'approval' | 'pending' | 'included' | 'confirmed' | 'failed'
  >(() => (savedHash() ? 'pending' : 'idle'));
  const [hash, setHash] = useState<Hash | undefined>(savedHash);
  const [receiptBlock, setReceiptBlock] = useState<bigint>();
  const [txError, setTxError] = useState('');
  const [retry, setRetry] = useState(0);
  const placing = phase === 'approval' || phase === 'pending' || phase === 'included';
  useEffect(() => {
    if (selected !== undefined)
      setCoords([String(selected % 100), String(Math.floor(selected / 100))]);
  }, [selected]);
  useEffect(() => {
    if (!wallet.account || !configured) {
      setLast(0);
      return;
    }
    let canceled = false;
    client
      .readContract({
        address: address!,
        abi,
        functionName: 'lastPlacement',
        args: [wallet.account],
      })
      .then((n) => {
        if (!canceled) {
          setLast(Number(n));
          setCooldownError('');
        }
      })
      .catch((err) => {
        if (!canceled) setCooldownError(readableError(err));
      });
    return () => {
      canceled = true;
    };
  }, [wallet.account, canvas.block, phase]);
  useEffect(() => {
    const tick = () => setCooldown(Math.max(0, last + 60 - Math.floor(Date.now() / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [last]);
  useEffect(() => {
    if (!hash || phase !== 'pending') return;
    let canceled = false;
    void client
      .waitForTransactionReceipt({
        hash,
        confirmations: 3,
        timeout: 180_000,
        onReplaced: (replacement) => {
          if (canceled) return;
          if (replacement.reason === 'cancelled') {
            setPhase('failed');
            setTxError('Transaction cancelled in your wallet.');
            try {
              localStorage.removeItem(pendingKey);
            } catch {}
          } else {
            setHash(replacement.transaction.hash);
            try {
              localStorage.setItem(pendingKey, replacement.transaction.hash);
            } catch {}
          }
        },
      })
      .then((receipt) => {
        if (canceled) return;
        if (receipt.status === 'reverted') {
          setPhase('failed');
          setTxError('Transaction reverted on-chain. No pixel was changed.');
          try {
            localStorage.removeItem(pendingKey);
          } catch {}
          return;
        }
        setReceiptBlock(receipt.blockNumber);
        setPhase('included');
        canvas.refresh();
      })
      .catch((err) => {
        if (!canceled) {
          setTxError(`Still waiting for a confirmed receipt. ${readableError(err)}`);
        }
      });
    return () => {
      canceled = true;
    };
  }, [hash, phase, retry]);
  useEffect(() => {
    if (
      phase === 'included' &&
      receiptBlock !== undefined &&
      canvas.status === 'live' &&
      canvas.block !== undefined &&
      canvas.block >= receiptBlock
    ) {
      setPhase('confirmed');
      setTxError('');
      try {
        localStorage.removeItem(pendingKey);
      } catch {}
    }
  }, [phase, receiptBlock, canvas.block, canvas.status]);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null);
      if (e.key === 'Tab') {
        const items = [
          ...document.querySelectorAll<HTMLElement>(
            '[role="dialog"] button, [role="dialog"] a[href]',
          ),
        ].filter((el) => !el.hasAttribute('disabled'));
        const first = items[0],
          end = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          end?.focus();
        } else if (!e.shiftKey && document.activeElement === end) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    const timer = setTimeout(
      () => document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(),
      0,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [modal]);
  async function place() {
    if (selected === undefined || !wallet.account || !wallet.wallet || !configured) return;
    const id = selected,
      chosen = color,
      account = wallet.account;
    wallet.takeSendError();
    setModal(null);
    setPhase('approval');
    setTxError('');
    setHash(undefined);
    try {
      if ((await wallet.wallet.getChainId()) !== chain.id)
        throw new Error(`Switch your wallet to ${chain.name} before placing.`);
      const { request } = await client.simulateContract({
        address: address!,
        abi,
        functionName: 'placePixel',
        args: [id, chosen],
        account,
      });
      const tx = await wallet.wallet.writeContract(request);
      try {
        localStorage.setItem(pendingKey, tx);
      } catch {}
      setHash(tx);
      setPhase('pending');
    } catch (err) {
      setPhase('failed');
      setTxError(readableError(wallet.takeSendError() ?? err));
    }
  }
  function select(id: number) {
    setSelected(id);
  }
  function primary() {
    if (!wallet.account) {
      setModal('wallet');
      return;
    }
    if (wallet.chainId !== chain.id) {
      void wallet.switchNetwork();
      return;
    }
    setModal('confirm');
  }
  const current = selected === undefined ? undefined : canvas.pixels[selected];
  const changed = canvas.pixels.reduce((total, n) => total + (n !== 0xffffff ? 1 : 0), 0);
  return (
    <>
      <header className="site-header">
        <a className="brand" href="/" aria-label="PixelChain home">
          <span className="brand-icon">
            <span />
            <span />
            <span />
          </span>
          PixelChain<span className="beta">BETA</span>
        </a>
        <nav>
          <a className="nav-active" href="#canvas">
            Canvas
          </a>
          <button onClick={() => setModal('help')}>
            How it works <ArrowUpRight size={12} />
          </button>
        </nav>
        <div className="header-actions">
          <span className="network-badge">
            <span className="base-icon" />
            {chain.id === 31337 ? 'Local chain' : 'Base Sepolia'}
          </span>
          <button className="wallet-button" onClick={() => setModal('wallet')}>
            <Wallet size={16} />
            {wallet.account ? shortAddress(wallet.account) : 'Connect wallet'}
            <ChevronRight size={14} />
          </button>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">
              <span /> A LITTLE COLOR. A PERMANENT MARK.
            </div>
            <h1>
              Your pixel. <span>Our canvas.</span>
            </h1>
            <p>
              A shared canvas, built one pixel at a time. Pick a color. Find your spot.
              <br className="desktop-break" /> Leave something that lives on-chain.
            </p>
          </div>
          <div className="intro-note">
            <div className="mini-pixels">
              {Array.from({ length: 16 }, (_, i) => (
                <span key={i} />
              ))}
            </div>
            <span>
              10,000 pixels.
              <br />
              Endless possibilities.
            </span>
            <ArrowDownLeft size={22} />
          </div>
        </div>
        <div className="workspace-heading" id="canvas">
          <div>
            <span className={`status-dot ${canvas.status === 'live' ? 'live' : ''}`} />
            <strong>
              {canvas.status === 'live'
                ? 'Canvas is live'
                : canvas.status === 'setup'
                  ? 'Ready for deployment'
                  : canvas.status === 'loading'
                    ? 'Reading the blockchain'
                    : 'Reconnecting to chain'}
            </strong>
            <span className="heading-divider" />
            <span>
              {canvas.status === 'setup'
                ? 'No contract configured'
                : canvas.block !== undefined
                  ? `Confirmed block #${canvas.block}`
                  : 'Loading confirmed state'}
            </span>
          </div>
          <span className="permissionless">
            <Globe2 size={14} /> Open to everyone
          </span>
        </div>
        {canvas.status === 'setup' && (
          <div className="notice">
            <Layers3 size={18} />
            <div>
              <strong>Your canvas is ready. Connect it to the chain.</strong>
              <span>
                Deploy PixelChain, then set VITE_CONTRACT_ADDRESS and VITE_DEPLOYMENT_BLOCK in
                .env.local. This white canvas is a local preview until configured.
              </span>
            </div>
            <button className="text-button" onClick={() => setModal('help')}>
              Setup guide <ArrowUpRight size={15} />
            </button>
          </div>
        )}
        {canvas.error && (
          <div role="status" className="notice error-notice">
            <Radio size={18} />
            <div>
              <strong>Synchronization interrupted</strong>
              <span>{canvas.error} Confirmed data is retained while reconnecting.</span>
            </div>
            <button className="text-button" onClick={canvas.refresh}>
              Retry
            </button>
          </div>
        )}
        <div className="workspace">
          <div className="canvas-column">
            <PixelCanvas
              pixels={canvas.pixels}
              selected={selected}
              color={color}
              onSelect={select}
            />
            <div className="canvas-stats">
              <div>
                <span className="stat-icon">
                  <Layers3 size={17} />
                </span>
                <div>
                  <strong>100 × 100</strong>
                  <span>A canvas for all of us</span>
                </div>
              </div>
              <div>
                <span className="stat-icon">
                  <PipetteIcon />
                </span>
                <div>
                  <strong>16.7 million</strong>
                  <span>Colors. No compromises.</span>
                </div>
              </div>
              <div>
                <span className="stat-icon">
                  <Clock3 size={17} />
                </span>
                <div>
                  <strong>One every 60s</strong>
                  <span>Your moment to make a mark</span>
                </div>
              </div>
            </div>
            <section className="panel activity-panel">
              <div className="activity-heading">
                <div>
                  <Radio size={16} />
                  <h2>Fresh off the chain</h2>
                  <span className="pill">RECENT ACTIVITY</span>
                </div>
                <span className="muted">
                  {canvas.status === 'live'
                    ? `${changed.toLocaleString()} nonwhite pixels`
                    : 'Confirmed placements only'}
                </span>
              </div>
              {canvas.recent.length ? (
                canvas.recent
                  .slice(0, 8)
                  .map((p) => (
                    <ActivityRow key={`${p.blockHash}-${p.logIndex}`} item={p} onSelect={select} />
                  ))
              ) : (
                <div className="activity-empty">
                  <span className="empty-icon">
                    <MousePointer2 size={23} />
                  </span>
                  <div>
                    <strong>A blank canvas is an invitation.</strong>
                    <p>
                      {configured
                        ? 'No placements in the recent block window. Select a pixel to explore its history.'
                        : 'Confirmed placements will appear here once a contract is connected.'}
                    </p>
                  </div>
                </div>
              )}
              <div className="activity-foot">
                <ShieldCheck size={13} /> Every placement has a public receipt.{' '}
                {address && explorer && (
                  <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">
                    View contract <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </section>
          </div>
          <aside>
            <ColorPicker color={color} onChange={setColor} />
            <section className="panel placement-panel">
              <div className="section-label">
                <span>02 / MAKE YOUR MARK</span>
                <MousePointer2 size={15} />
              </div>
              <div className="selection-heading">
                <h2>
                  {selected === undefined ? 'Find your spot.' : 'A pixel with your name on it.'}
                </h2>
                <p>
                  {selected === undefined
                    ? 'Click the canvas or enter coordinates.'
                    : 'Preview your color, then confirm to place.'}
                </p>
              </div>
              <div className="coordinate-inputs">
                {['X', 'Y'].map((label, i) => (
                  <label key={label}>
                    <span>{label}</span>
                    <input
                      aria-label={`${label} coordinate`}
                      type="number"
                      min="0"
                      max="99"
                      step="1"
                      placeholder="—"
                      value={coords[i]}
                      onChange={(e) => {
                        const next = [...coords];
                        next[i] = e.target.value;
                        setCoords(next);
                        if (next.every((v) => /^\d+$/.test(v) && Number(v) < 100))
                          setSelected(Number(next[1]) * 100 + Number(next[0]));
                        else setSelected(undefined);
                      }}
                    />
                  </label>
                ))}
                <span className="coordinate-limit">0 — 99</span>
              </div>
              {current !== undefined && (
                <div className="placement-preview">
                  <div>
                    <span style={{ background: toHex(current) }} />
                    <small>Current</small>
                    <b>{toHex(current)}</b>
                  </div>
                  <ChevronRight size={15} />
                  <div>
                    <span style={{ background: toHex(color) }} />
                    <small>Your color</small>
                    <b>{toHex(color)}</b>
                  </div>
                </div>
              )}
              <div className="cooldown-row">
                <span>
                  <Clock3 size={14} />
                  {cooldown > 0 ? 'A moment to recharge' : 'Ready when you are'}
                </span>
                <strong>{cooldown > 0 ? `${cooldown}s` : '60s cooldown'}</strong>
              </div>
              <button
                className="place-button"
                disabled={
                  wallet.busy ||
                  placing ||
                  (!!wallet.account &&
                    wallet.chainId === chain.id &&
                    (!configured ||
                      canvas.status !== 'live' ||
                      selected === undefined ||
                      cooldown > 0 ||
                      !!cooldownError))
                }
                onClick={primary}
              >
                {placing ? (
                  <LoaderCircle className="spin" size={16} />
                ) : wallet.account ? (
                  <MousePointer2 size={16} />
                ) : (
                  <Wallet size={16} />
                )}{' '}
                {phase === 'approval'
                  ? 'Approve in wallet'
                  : phase === 'pending'
                    ? 'Transaction pending'
                    : phase === 'included'
                      ? 'Syncing confirmation'
                      : !wallet.account
                        ? 'Connect wallet to place'
                        : wallet.chainId !== chain.id
                          ? 'Switch network'
                          : cooldown > 0
                            ? `Next pixel in ${cooldown}s`
                            : 'Place your pixel'}
                {!placing && <ArrowUpRight size={17} />}
              </button>
              <p className="gas-note">
                <ShieldCheck size={12} /> No fees from us. Just testnet gas.
              </p>
              {(wallet.error || cooldownError) && (
                <p role="alert" className="inline-error">
                  {wallet.error || cooldownError}
                </p>
              )}
              {phase !== 'idle' && (
                <div className={`transaction-state ${phase}`} role="status">
                  <strong>
                    {phase === 'approval'
                      ? 'Waiting for wallet approval'
                      : phase === 'pending'
                        ? 'Broadcast · waiting for 3 confirmations'
                        : phase === 'included'
                          ? 'Included · syncing the confirmed canvas'
                          : phase === 'confirmed'
                            ? 'Your mark is on the canvas.'
                            : 'Placement did not complete'}
                  </strong>
                  {hash && (
                    <LinkOut hash={hash}>
                      View transaction <ExternalLink size={12} />
                    </LinkOut>
                  )}
                  {txError && <p>{txError}</p>}
                  {txError && phase === 'pending' && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setTxError('');
                        setRetry((n) => n + 1);
                      }}
                    >
                      Check receipt again
                    </button>
                  )}
                </div>
              )}
              {selected !== undefined && (
                <PixelHistory
                  key={`${selected}-${canvas.epoch}`}
                  pixelId={selected}
                  block={canvas.block}
                  recent={canvas.recent}
                  onSelect={select}
                />
              )}
            </section>
            <div className="onchain-note">
              <span>
                <ShieldCheck size={19} />
              </span>
              <div>
                <strong>Small pixels. Lasting proof.</strong>
                <p>Your art lives on Base. Every color, every change, publicly verifiable.</p>
              </div>
            </div>
          </aside>
        </div>
        <footer>
          <a className="brand footer-brand" href="#">
            PixelChain<span className="footer-dot">.</span>
          </a>
          <span>A shared space. A permanent story.</span>
          <div>
            <span className="base-icon" /> Built on Base <span className="footer-divider" />{' '}
            Testnet, real transactions{' '}
            <button aria-label="About PixelChain" onClick={() => setModal('help')}>
              <CircleHelp size={17} />
            </button>
          </div>
        </footer>
      </main>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === 'help' ? (
              <>
                <span className="eyebrow">A CANVAS WITHOUT A GATEKEEPER</span>
                <h2 id="dialog-title">One pixel. On-chain.</h2>
                <p>
                  PixelChain is a 100 × 100 canvas on Base Sepolia. Choose any RGB color, select a
                  spot, and confirm the placement in your Ethereum wallet. Each wallet gets one
                  pixel every 60 seconds.
                </p>
                <ol>
                  <li>Connect MetaMask or a compatible Ethereum wallet.</li>
                  <li>
                    Switch to Base Sepolia and get free test ETH from a faucet linked in the Base
                    documentation.
                  </li>
                  <li>
                    Choose a color and a pixel. Review the preview, then confirm your transaction.
                  </li>
                  <li>
                    After three block confirmations, everyone sees your mark. Later placements can
                    overwrite it; the history remains public.
                  </li>
                </ol>
                <h3>Running your own canvas</h3>
                <p>
                  Use the README in this project for local development, measured gas costs, contract
                  deployment, and publishing. Configure <code>VITE_CONTRACT_ADDRESS</code> and{' '}
                  <code>VITE_DEPLOYMENT_BLOCK</code>, then restart or rebuild the frontend. All
                  viewers must use the same contract.
                </p>
                <a
                  className="secondary-button"
                  href="https://docs.base.org/base-chain/tools/network-faucets"
                  target="_blank"
                  rel="noreferrer"
                >
                  Base testnet faucets <ArrowUpRight size={15} />
                </a>
                <p className="muted">
                  The cooldown applies per wallet; multiple wallets can bypass it. Confirmations can
                  be reorganized, and synchronization recovers from detected changes.
                </p>
              </>
            ) : modal === 'wallet' ? (
              <>
                <div className="dialog-icon">
                  <Wallet size={25} />
                </div>
                <h2 id="dialog-title">
                  {wallet.account ? 'Your wallet' : 'Your wallet. Your paintbrush.'}
                </h2>
                {wallet.account ? (
                  <>
                    <p className="wallet-full-address">{wallet.account}</p>
                    <p>
                      {wallet.chainId === chain.id
                        ? `Connected to ${chain.name}`
                        : 'Your wallet is connected to a different network.'}
                    </p>
                    {wallet.chainId !== chain.id && (
                      <button className="place-button" onClick={() => void wallet.switchNetwork()}>
                        Switch to {chain.name}
                      </button>
                    )}
                    <button
                      className="secondary-button full"
                      onClick={() => {
                        wallet.disconnect();
                        setModal(null);
                      }}
                    >
                      Disconnect from this app
                    </button>
                  </>
                ) : (
                  <>
                    <p>Connect an Ethereum wallet to leave your mark. Browsing is always open.</p>
                    {wallet.providers.length ? (
                      wallet.providers.map((p) => (
                        <button
                          className="wallet-option"
                          key={p.uuid}
                          disabled={wallet.busy}
                          onClick={() =>
                            void wallet.connect(p.provider).then((connected) => {
                              if (connected) setModal(null);
                            })
                          }
                        >
                          <Wallet size={20} />
                          {p.name}
                          <ChevronRight size={18} />
                        </button>
                      ))
                    ) : (
                      <button
                        className="place-button"
                        disabled={wallet.busy}
                        onClick={() =>
                          void wallet.connect().then((connected) => {
                            if (connected) setModal(null);
                          })
                        }
                      >
                        {wallet.busy ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : (
                          <Wallet size={17} />
                        )}
                        Connect wallet
                      </button>
                    )}
                    <p className="muted">
                      Your wallet stays in your control. PixelChain never asks for private keys or a
                      recovery phrase.
                    </p>
                  </>
                )}
                {wallet.error && (
                  <p className="inline-error" role="alert">
                    {wallet.error}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="dialog-icon">
                  <MousePointer2 size={25} />
                </div>
                <h2 id="dialog-title">Make it permanent.</h2>
                <p>
                  You’re placing one pixel at{' '}
                  <strong>
                    ({selected! % 100}, {Math.floor(selected! / 100)})
                  </strong>
                  . This starts your 60-second cooldown.
                </p>
                <div className="confirm-color" style={{ background: toHex(color) }} />
                <div className="confirm-values">
                  <strong>{toHex(color)}</strong>
                  <span>RGB {rgb(color).join(', ')}</span>
                </div>
                <p className="muted">
                  Your wallet will show the testnet gas fee. The canvas updates after three
                  confirmations.
                </p>
                <button className="place-button" onClick={() => void place()}>
                  Confirm in wallet <ArrowUpRight size={16} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function PipetteIcon() {
  return <span className="spectrum-icon" />;
}
