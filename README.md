# PixelChain

A collaborative 100 × 100 full RGB canvas, backed directly by a compact Ethereum contract. Designed for **Base Sepolia (84532)**. Every placement is a transaction; everyone using the same contract sees the same confirmed state. No backend database, tokens, payments, administrator, or upgrade keys.

**Status:** Implemented and locally testable. No public contract has been deployed and no live testnet transactions have been sent. Until configured, the UI explicitly displays a white local preview with a setup notice. It does not simulate activity. Completing the two-device Base Sepolia acceptance check requires an approved deployment and funded test wallets.

## Start

Use Node **22 LTS or 24 LTS**, npm, and an Ethereum wallet such as MetaMask. The repository includes a lockfile; `npm ci` installs the same dependencies.

```sh
npm ci
npm run compile
npm run dev
```

Open the printed local URL (usually http://127.0.0.1:5173). Without environment configuration you can explore canvas selection, pan/zoom, and full RGB controls. Connecting a deployed contract enables shared state and placement. `src/lib/abi.ts` is generated and committed; compile again after contract changes.

## Fully local integration with two wallets

Nothing in this section touches a public network.

1. Run `npm run compile` and `npm run node` in one terminal. Keep the local chain running. It mines a block every second at http://127.0.0.1:8545, chain ID **31337**.
2. In a second terminal run `npm run deploy:local`. This deploys the contract and writes the public configuration to `.env.local`.
3. Start/restart `npm run dev`.
4. Use a **separate test wallet profile** and the public local mnemonic printed by the local node. Importing the same mnemonic into two browser profiles and selecting different derived accounts gives you two independent authors. These local accounts are public and must never hold public-network funds. Add the local RPC/chain in the wallet, then connect.
5. Select a color and coordinate. Click **Place your pixel**, review the dialog, and confirm in the wallet. After three confirmations another browser updates automatically. Try the other wallet overwriting the same pixel. The first wallet's next placement is blocked until 60 seconds have elapsed.

The local node is in-memory. Restarting it resets its state; redeploy and restart Vite afterward. For a phone, `127.0.0.1` points to the phone itself: use Base Sepolia, or deliberately configure a reachable local RPC and frontend host on a trusted LAN. Never expose Ganache's unlocked test accounts to the internet.

## Base Sepolia deployment (manual approval required)

The assistant has **not** performed these steps. Run them yourself when ready, or explicitly authorize a deployment. Use a dedicated testnet wallet; no mainnet ETH is required.

Base's official [network details](https://docs.base.org/get-started/connect-to-base):

| Setting  | Value                          |
| -------- | ------------------------------ |
| Network  | Base Sepolia                   |
| Chain ID | 84532 (`0x14a34`)              |
| RPC      | `https://sepolia.base.org`     |
| Currency | ETH (testnet)                  |
| Explorer | `https://sepolia.basescan.org` |

Get test ETH through a provider listed in the official [Base faucet documentation](https://docs.base.org/base-chain/tools/network-faucets). Faucet availability and eligibility vary. Ethereum Sepolia ETH is on another chain; use Base Sepolia ETH or a supported testnet bridge. The UI supports adding/switching the correct chain.

Compile and fund a dedicated deployer account. Set `DEPLOYER_PRIVATE_KEY` **only in your deployment shell**, using your normal secret-management process. Do not paste it into chat, put it in source code, or use a `VITE_` variable for it. The script does not load keys from frontend `.env` files and never prints them. A private RPC credential, if used, goes in `BASE_SEPOLIA_RPC_URL` in that shell. Then explicitly opt into deployment:

```sh
npm run compile
npm run deploy:sepolia -- --confirm-testnet
```

The script checks the RPC chain ID, deploys only `PixelChain`, waits for three confirmations, and prints the address and deployment block. It does not deploy the benchmark comparison contracts. Deployment costs gas once. No additional funding or ownership setup is needed.

Copy `.env.example` to `.env.local`, fill in the actual deployment values, and restart Vite:

```dotenv
VITE_CONTRACT_ADDRESS=0xYOUR_ACTUAL_CONTRACT_ADDRESS
VITE_DEPLOYMENT_BLOCK=YOUR_ACTUAL_DEPLOYMENT_BLOCK_NUMBER
VITE_RPC_URL=https://sepolia.base.org
VITE_LOCAL_CHAIN=false
```

`VITE_` values are public and compiled into the browser bundle. Use a browser-safe RPC endpoint, with origin restrictions if supported. Public RPCs can throttle: for a busy canvas choose a provider supporting historical `eth_call`, `eth_getLogs`, CORS, and ~32 KB call results. Never configure an earlier or later guessed deployment block; an incorrect later block omits history.

Contract verification: use the explorer's Solidity standard JSON verification flow. `npm run verification-input` produces `artifacts/verification-input.json` with the exact source, compiler settings, and selected EVM target. Select **solc 0.8.30**, optimization **200**, no constructor arguments. Verification is a separate explorer action; deployment alone does not publish verified source.

## Public website

The frontend is static and needs no server secrets or database:

```sh
npm run build
npm run preview
```

Publish the contents of **`dist/`** to Cloudflare Pages, Netlify, Vercel, GitHub Pages at a root domain, or another HTTPS static host. For CI hosting, set the public `VITE_` variables **before** `npm run build`; changing variables after the build requires rebuilding. Use `npm ci && npm run build` as the build command and `dist` as the output directory. Serve over HTTPS for wallet compatibility. Both devices must open a build configured with the **same address, chain, and deployment block**. No hosting has been published from this session.

## Architecture and efficiency

- **Contract:** Solidity 0.8.30, optimizer 200, Shanghai bytecode (supported on Base); no libraries or external calls. `placePixel(uint16 pixelId, uint24 color)` requires `pixelId < 10_000`; the ABI enforces RGB range. `pixelId = y * 100 + x` with zero-based coordinates.
- **Canvas state:** ten 24-bit inverted RGB values per storage word, 1,000 words. Inversion makes untouched slots white without constructor writes. Black is exact zero RGB, white is exact `0xFFFFFF`, with no sentinel collision. Packing preserves neighboring pixels.
- **Cooldown:** `lastPlacement[address]` occupies one slot for each participating wallet. First placement is immediately allowed; subsequent calls require at least 60 on-chain seconds. There is no fee apart from network gas. Failed calls revert all state and emit no placement event.
- **Ownership/history:** indexed `PixelPlaced(pixelId, author, color)` logs. Authors describe the last placer, not exclusive ownership rights. History can grow without adding contract history slots.
- **Frontend:** React + TypeScript + Vite, viem, injected EIP-1193 / EIP-6963 wallet discovery. A single block-pinned 32 KB `getPackedCanvas()` read loads current state; 10,000 colors decode locally. A 100 × 100 image buffer renders with nearest-neighbor scaling on a high-DPI canvas.
- **Synchronization:** four-second polling of a head two blocks behind latest. Snapshot, logs, and cursor checks use explicit block numbers. Apply ordered logs only after every chunk succeeds; validate block hashes and rebuild on detected reorgs. Failed RPC calls retain the cursor and retry. Three receipt confirmations align with the displayed state. A selection is a transparent local preview; broadcast and failed transactions never update authoritative colors.
- **History:** recent activity scans a bounded recent block window. Selecting a pixel queries indexed logs in backward pages of 10,000 blocks; requests chunk at 2,000 blocks and subdivide provider-limit errors. “Search older blocks” continues toward deployment, and the UI reports incomplete author searches. The first 30 loaded pixel entries are displayed, with a button to reveal more; full history remains in receipts and the reconstruction tool.

See [storage tradeoffs and protocol](docs/ARCHITECTURE.md), [measured gas results](docs/GAS.md), and [raw benchmark output](docs/gas-benchmark.json).

## Independent reconstruction

Anyone can read packed state using the committed ABI. Events provide a separate reconstruction path:

```sh
RPC_URL=https://sepolia.base.org CONTRACT_ADDRESS=0xACTUAL_ADDRESS DEPLOYMENT_BLOCK=ACTUAL_BLOCK npm run reconstruct
```

The script verifies the RPC chain, replays all placement events through a pinned confirmed block, compares every pixel against packed state, and writes `artifacts/reconstructed-canvas.json`, including last authors. It uses no application database. Replaying long histories takes time and may require an archive/log-capable RPC. For normal app loading, the bounded state snapshot avoids this work.

## Tests and performance

```sh
npm run compile
npm test                  # RGB, packed decoding, ordering, reorg detection, RPC gaps/range limits
npm run test:contracts    # real EVM transactions, timestamp boundaries, bounds, history replay, same-block competition
npm run bench             # three storage designs, multiple SSTORE states, 1,000-placement workload
npm run test:e2e          # Chrome: two local wallet adapters, confirmation, reload/history, network/errors/mobile/reconnect
npm run build
```

Browser tests start their own in-memory chain on **18545** and frontend on **4173** and tear them down. They use installed Google Chrome (`channel: 'chrome'`); alternatively install Playwright Chromium and remove the channel option. Wallet adapters sign via unlocked accounts on the **local test chain only**. This verifies the complete browser-to-contract path but does not replace a manual MetaMask extension check or actual Base Sepolia validation. Desktop/mobile screenshots are written to `docs/` by the tests.

Manual release acceptance after approved deployment: two independent devices/wallets, wallet rejection, switch/add network, low balance, first RGB placement, overwrite by second wallet, both see confirmation, reload both, compare history/explorer receipt, verify 59-second rejection/60-second availability, and reconnect after temporarily disabling the network. Try both desktop wheel/drag and mobile pinch/pan, and keyboard coordinate inputs.

## Limits and operational notes

- The 60-second rule is per address; creating more wallets bypasses it. There is no identity system, censorship/moderation, content removal, rate cap for all users, or anti-front-running protection. Block/log order decides the last writer.
- Two-block confirmation depth is not finality. Deep reorgs can remove placements, and RPC disconnections can delay display. Cursor validation repairs observed reorgs. A successful placement may immediately be overwritten by someone else.
- JSON-RPC responses are trusted as in ordinary dapps. Independent reconstruction and alternate providers enable verification, but the browser does not run an Ethereum light client or verify Merkle proofs. Permanent data depends on blockchain and historical RPC availability.
- Cold history searches can scan many empty ranges for old pixels. Current canvas reads stay bounded as activity grows. Public RPC history retention, response limits, and availability are provider-specific. The history UI makes incomplete searches explicit.
- Pending transaction hashes persist locally. Receipt timeout preserves the hash and offers retry. Wallet replacement/cancellation is tracked while the receipt watcher runs; an original hash after a reload may need checking in your wallet/explorer if it was replaced while the app was closed. A local Disconnect ends this app's session, not the wallet extension's site permission.
- The optional historical animation/replay interface is not included. The reconstruction script provides full ordered historical data instead.
- Ganache is development-only and bundles older dependencies with known advisories. It is bound to loopback and is excluded from the static browser build. Do not use it as a public node or a production service. Audit your own dependency/runtime environment before hosting. Node 21 on this machine emits unsupported-engine and native µWS fallback messages; use Node 22/24 LTS for repeatable supported setup.
- Fonts load from Google Fonts with local sans-serif fallbacks; the app works without the font request. No analytics or centralized pixel backend.
