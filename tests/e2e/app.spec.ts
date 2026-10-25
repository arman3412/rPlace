import { test, expect, type BrowserContext, type Page } from '@playwright/test';
async function inject(context: BrowserContext, index = 0, wrongChain = false) {
  await context.addInitScript(
    ({ index, wrongChain }) => {
      let network = wrongChain ? '0x1' : '0x7a69';
      const listeners: Record<string, Function[]> = {};
      async function rpc(method: string, params: unknown[] = []) {
        const r = await fetch('http://127.0.0.1:18545', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
        });
        const result = await r.json();
        if (result.error) throw result.error;
        return result.result;
      }
      (window as any).ethereum = {
        request: async ({ method, params = [] }: { method: string; params: any[] }) => {
          if (method === 'eth_accounts')
            return (window as any).__connected ? [(await rpc('eth_accounts'))[index]] : [];
          if (method === 'eth_requestAccounts') {
            if ((window as any).__reject) throw { code: 4001, message: 'User rejected request' };
            (window as any).__connected = true;
            return [(await rpc('eth_accounts'))[index]];
          }
          if (method === 'eth_chainId') return network;
          if (method === 'wallet_switchEthereumChain') {
            network = params[0].chainId;
            listeners.chainChanged?.forEach((fn) => fn(network));
            return null;
          }
          if (method === 'eth_sendTransaction' && (window as any).__reject)
            throw { code: 4001, message: 'User rejected request' };
          if (method === 'eth_sendTransaction' && (window as any).__insufficient)
            throw { code: -32000, message: 'insufficient funds for gas' };
          return rpc(method, params);
        },
        on: (event: string, fn: Function) => (listeners[event] ??= []).push(fn),
        removeListener: (event: string, fn: Function) => {
          listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
        },
      };
    },
    { index, wrongChain },
  );
}
async function connect(page: Page) {
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function choose(page: Page, x: number, y: number, hex: string) {
  await page.getByLabel('X coordinate', { exact: true }).fill(String(x));
  await page.getByLabel('Y coordinate', { exact: true }).fill(String(y));
  await page.getByLabel('HEX', { exact: true }).fill(hex);
  await page.getByLabel('HEX', { exact: true }).blur();
}
test('two independent wallets place real local-chain RGB pixels, synchronize, persist and show history', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  await inject(a, 1);
  await inject(b, 2);
  const one = await a.newPage(),
    two = await b.newPage();
  await Promise.all([one.goto('/'), two.goto('/')]);
  await expect(one.getByText('Canvas is live', { exact: true })).toBeVisible();
  await connect(one);
  await connect(two);
  await choose(one, 47, 31, '#FF5733');
  await expect(one.getByLabel('Red', { exact: true })).toHaveValue('255');
  await expect(one.getByLabel('Green', { exact: true })).toHaveValue('87');
  await expect(one.getByLabel('Blue', { exact: true })).toHaveValue('51');
  await one.getByRole('button', { name: 'Place your pixel', exact: true }).click();
  await expect(one.getByRole('dialog')).toContainText('(47, 31)');
  await one.getByRole('button', { name: 'Confirm in wallet' }).click();
  await expect(one.getByText('Your mark is on the canvas.', { exact: true })).toBeVisible();
  await expect(two.locator('.activity-panel')).toContainText('#FF5733');
  await expect(one.getByRole('button', { name: /Next pixel in/ })).toBeDisabled();
  await choose(two, 47, 31, '#1277EF');
  await two.getByRole('button', { name: 'Place your pixel', exact: true }).click();
  await two.getByRole('button', { name: 'Confirm in wallet' }).click();
  await expect(two.getByText('Your mark is on the canvas.', { exact: true })).toBeVisible();
  await expect(one.locator('.placement-preview')).toContainText('#1277EF');
  await one.reload();
  await expect(one.getByText('Canvas is live', { exact: true })).toBeVisible();
  await choose(one, 47, 31, '#FF5733');
  await expect(one.locator('.placement-preview')).toContainText('#1277EF');
  await expect(one.locator('.pixel-history')).toContainText('#FF5733');
  await expect(one.locator('.pixel-history')).toContainText('#1277EF');
  await one.screenshot({ path: 'docs/desktop-preview.png', fullPage: true });
  await a.close();
  await b.close();
});
test('wallet rejection, network switch, invalid RGB, placement rejection and insufficient gas', async ({
  browser,
}) => {
  const c = await browser.newContext();
  await inject(c, 3, true);
  const page = await c.newPage();
  await page.goto('/');
  await expect(page.getByText('Canvas is live', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as any).__reject = true;
  });
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await expect(page.getByText(/Request declined/).first()).toBeVisible();
  await page.evaluate(() => {
    (window as any).__reject = false;
  });
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).last().click();
  await page.getByRole('button', { name: 'Switch network', exact: true }).click();
  await choose(page, 12, 13, '#AABBCC');
  await page.getByLabel('Red', { exact: true }).fill('256');
  await expect(page.getByLabel('Red', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await page.getByLabel('Red', { exact: true }).blur();
  await expect(page.getByLabel('Red', { exact: true })).toHaveValue('170');
  await page.evaluate(() => {
    (window as any).__reject = true;
  });
  await page.getByRole('button', { name: 'Place your pixel', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm in wallet' }).click();
  await expect(page.locator('.transaction-state')).toContainText('Request declined');
  await page.evaluate(() => {
    (window as any).__reject = false;
    (window as any).__insufficient = true;
  });
  await page.getByRole('button', { name: 'Place your pixel', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm in wallet' }).click();
  await expect(page.locator('.transaction-state')).toContainText('Not enough test ETH');
  await c.close();
});
test('mobile canvas selection, zoom, coordinate keyboard input and reconnection', async ({
  browser,
}) => {
  const c = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await c.newPage();
  await page.goto('/');
  await expect(page.getByText('Canvas is live', { exact: true })).toBeVisible();
  const canvas = page.locator('canvas');
  await canvas.tap();
  await expect(page.getByLabel('X coordinate', { exact: true })).not.toHaveValue('');
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.zoom-controls')).toContainText('130%');
  await choose(page, 99, 99, '#010203');
  await expect(page.getByLabel('Blue', { exact: true })).toHaveValue('3');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.route('http://127.0.0.1:18545', (route) => route.abort());
  await expect(page.getByText('Reconnecting to chain', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.unroute('http://127.0.0.1:18545');
  await expect(page.getByText('Canvas is live', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'docs/mobile-preview.png', fullPage: true });
  await c.close();
});

async function localRpc(method: string, params: unknown[] = []) {
  const response = await fetch('http://127.0.0.1:18545', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const result = await response.json();
  if (result.error) throw new Error(result.error.message);
  return result.result;
}
test('chain reorganization discards removed placement and rebuilds pixel history', async ({
  browser,
}) => {
  const c = await browser.newContext();
  await inject(c, 4);
  const page = await c.newPage();
  await page.goto('/');
  await expect(page.getByText('Canvas is live', { exact: true })).toBeVisible();
  await connect(page);
  await choose(page, 88, 77, '#BADA55');
  const checkpoint = await localRpc('evm_snapshot');
  await page.getByRole('button', { name: 'Place your pixel', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm in wallet' }).click();
  await expect(page.locator('.placement-preview')).toContainText('#FFFFFF');
  await expect(page.getByText('Your mark is on the canvas.', { exact: true })).toBeVisible();
  await expect(page.locator('.pixel-history')).toContainText('#BADA55');
  await localRpc('evm_revert', [checkpoint]);
  for (let i = 0; i < 12; i++) await localRpc('evm_mine');
  await expect(page.locator('.placement-preview')).toContainText('#FFFFFF');
  await expect(page.locator('.pixel-history')).not.toContainText('#BADA55');
  await expect(page.getByText('Canvas is live', { exact: true })).toBeVisible();
  await c.close();
});
