import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto('http://localhost:3000/present/post?theme=default.theme.json&slide=0', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  // find the main controls bar (the div containing the Export button)
  const exportBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export');
  if (!exportBtn) return 'no export';
  let bar = exportBtn.parentElement;
  const chain = [];
  for (let i = 0; i < 3 && bar; i++) {
    const r = bar.getBoundingClientRect();
    const cs = getComputedStyle(bar);
    chain.push({
      tag: bar.tagName.toLowerCase(),
      cls: bar.className,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      justify: cs.justifyContent,
      position: cs.position,
      display: cs.display,
      children: [...bar.children].map(c => {
        const cr = c.getBoundingClientRect();
        const ccs = getComputedStyle(c);
        return `${c.tagName.toLowerCase()}(${Math.round(cr.x)}-${Math.round(cr.x+cr.width)}) pos:${ccs.position} ${(c.textContent||'').trim().slice(0,15)}`;
      }),
    });
    bar = bar.parentElement;
  }
  return chain;
});
console.log(JSON.stringify(info, null, 2));
await browser.close();