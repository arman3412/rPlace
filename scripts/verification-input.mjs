import { readFile, mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/verification-input.json',
  JSON.stringify(
    {
      language: 'Solidity',
      sources: {
        'PixelChain.sol': { content: await readFile('contracts/PixelChain.sol', 'utf8') },
      },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: 'shanghai',
        outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
      },
    },
    null,
    2,
  ),
);
console.log('Wrote artifacts/verification-input.json for solc 0.8.30.');
