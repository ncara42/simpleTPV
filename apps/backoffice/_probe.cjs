const { chromium } = require('@playwright/test');

const dump = (label, info) => {
  console.log(`\n===== ${label} =====`);
  console.log('URL:', info.url);
  console.log('TOP-AT-CENTER (closest first):');
  for (const c of info.topAtCenter) console.log('  ', JSON.stringify(c));
  console.log('BIG OVERLAYS covering center (interactive first):');
  for (const o of info.bigOverlays) console.log('  ', JSON.stringify(o));
};

const probe = () =>
  ({
    url: location.href,
    topAtCenter: (() => {
      const cx = Math.floor(innerWidth / 2), cy = Math.floor(innerHeight / 2);
      const chain = []; let el = document.elementFromPoint(cx, cy);
      while (el && chain.length < 9) {
        const s = getComputedStyle(el); const r = el.getBoundingClientRect();
        chain.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 80), pos: s.position, z: s.zIndex, pe: s.pointerEvents, w: Math.round(r.width), h: Math.round(r.height) });
        el = el.parentElement;
      }
      return chain;
    })(),
    bigOverlays: (() => {
      const cx = Math.floor(innerWidth / 2), cy = Math.floor(innerHeight / 2);
      return [...document.querySelectorAll('body *')].filter((e) => {
        const s = getComputedStyle(e); const r = e.getBoundingClientRect();
        return (s.position === 'fixed' || s.position === 'absolute') && r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy && r.width >= innerWidth * 0.5 && r.height >= innerHeight * 0.5;
      }).map((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return { tag: e.tagName, cls: String(e.className || '').slice(0, 80), pos: s.position, z: s.zIndex, pe: s.pointerEvents, w: Math.round(r.width), h: Math.round(r.height), op: s.opacity }; })
        .sort((a, b) => (a.pe === 'none' ? 1 : 0) - (b.pe === 'none' ? 1 : 0));
    })(),
  });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message.slice(0, 200)));

  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => console.log('goto err:', e.message));
  await page.waitForTimeout(1000);
  // login
  await page.fill('[data-testid=login-email]', 'admin@org1.test').catch((e) => console.log('email fill err:', e.message));
  await page.fill('[data-testid=login-password]', 'password123').catch((e) => console.log('pw fill err:', e.message));
  await page.click('[data-testid=login-submit]').catch(async () => { await page.keyboard.press('Enter').catch(() => {}); });
  await page.waitForTimeout(5000);

  dump('AFTER LOGIN (landing)', await page.evaluate(probe));
  await page.screenshot({ path: '/tmp/bo-after-login.png' });

  // try dashboard explicitly
  await page.goto('http://localhost:5174/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(4000);
  dump('DASHBOARD', await page.evaluate(probe));
  await page.screenshot({ path: '/tmp/bo-dashboard.png' });

  console.log('\nCONSOLE ERRORS:', JSON.stringify(errors.slice(0, 15), null, 1));
  await browser.close();
})();
