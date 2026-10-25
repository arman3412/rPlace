import { expect, it } from 'vitest';
import { readableError } from '../src/lib/config';
it('finds insufficient funds inside nested wallet errors', () => {
  expect(
    readableError({
      shortMessage: 'Transaction execution failed',
      cause: {
        message: 'RPC error',
        cause: { code: -32000, message: 'insufficient funds for gas' },
      },
    }),
  ).toContain('Not enough test ETH');
});
it('recognizes nested wallet rejection and on-chain cooldown errors', () => {
  expect(readableError({ message: 'Unknown wallet error', cause: { code: 4001 } })).toContain(
    'Request declined',
  );
  expect(
    readableError({ shortMessage: 'Reverted', cause: { message: 'CooldownActive(100)' } }),
  ).toContain('cooldown');
});
it('bounds unclassified error messages for the UI', () => {
  expect(readableError(new Error('x'.repeat(1000))).length).toBeLessThanOrEqual(221);
});
