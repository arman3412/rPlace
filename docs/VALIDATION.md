# Validation performed

No contract deployment or transaction was performed on a public chain. No website was published.

- `npm run check` passed: Solidity compilation, TypeScript and optimized production bundle, 13 unit/synchronization/wallet-error tests, 11 contract integration tests.
- `npm run bench` measured five contract designs and 1,000 additional successful local EVM placements. See GAS.md and gas-benchmark.json.
- `npm run test:e2e` passed four Chrome scenarios using two independent browser contexts and real transactions against the local Ganache chain:
  1. Two authors, exact RGB values, confirmed synchronization, overwrite, cooldown, reload persistence, and indexed history.
  2. Wallet connection rejection/retry, incorrect network switch, invalid RGB validation, rejected placement, and insufficient gas error.
  3. Mobile canvas selection, zoom, coordinate inputs, layout overflow, RPC interruption, and automatic reconnection.
  4. A placement removed by an actual local chain revert, followed by block replacement: canvas and pixel history rebuilt without the removed event. The test also checks that the local preview does not change the confirmed color while a transaction is pending.
- Desktop and mobile screenshots are included. They show actual local-test chain state, not Base Sepolia activity.

Browser wallet adapters exercise the EIP-1193 interface with unlocked local accounts; they are not MetaMask extension automation. Manual extension testing, actual Base Sepolia placement and total fee measurement, and the final two-device public-network acceptance check remain dependent on an approved deployment. The optional animated historical replay UI is omitted; the independent event reconstruction script is included.

The environment used Node 21.7.2. Checks succeeded, but current Vite/Vitest officially support LTS Node versions instead; `.nvmrc` selects Node 22. Ganache fell back from its native µWS binding to its JavaScript implementation. Development dependencies include known Ganache advisory findings; Ganache is restricted to loopback and does not ship in the static browser bundle. See the README for operational limitations.
