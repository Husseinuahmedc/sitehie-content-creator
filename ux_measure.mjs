import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const w of [1600, 1280, 1024, 800, 480]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto('http://localhost:3000/present/post?theme=default.theme.json&slide=0', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const pos = await page.evaluate(() => {
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width/2) };
    };
    const btns = [...document.querySelectorAll('button')].filter(b => /Esc|Export|عرض/.test(b.textContent.trim()) || ['←','→','⏸'].includes(b.textContent.trim()));
    const out = {};
    for (const b of btns) {
      const t = b.textContent.trim();
      if (!out[t]) out[t] = rect(b);
    }
    const counter = [...document.querySelectorAll('span')].find(s => /^\d+ \/ \d+$/.test(s.textContent.trim()));
    out['1/10 counter'] = counter ? rect(counter) : null;
    return out;
  });
  console.log('VIEWPORT', w, JSON.stringify(pos));
  await page.close();
}
await browser.close();