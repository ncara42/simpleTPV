/* eslint-disable no-undef */
import { chromium } from '@playwright/test';

const DIR = process.env.SHOT_DIR;
const URL = 'http://localhost:5174/geist-preview.html';
const periods = ['today', 'week', 'month', 'year'];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 1300 },
  deviceScaleFactor: 2,
});
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
try {
  await page.waitForSelector('[data-testid="gp-ready"]', { timeout: 30000 });
  console.log('READY ok');
} catch {
  console.log('NO READY — capturando estado actual');
  await page.screenshot({ path: `${DIR}/geist-FAIL.png`, fullPage: true });
  console.log('errors:\n' + errors.slice(0, 12).join('\n'));
  await browser.close();
  process.exit(0);
}

for (const p of periods) {
  await page.click(`[data-testid="period-${p}"]`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/geist-${p}.png`, fullPage: true });
  console.log('shot', p);
}
if (errors.length) console.log('console errors:\n' + errors.slice(0, 15).join('\n'));
await browser.close();
