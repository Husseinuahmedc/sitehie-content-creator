import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const w of [1600, 1280, 1024, 800, 480]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 } });
  await page.goto('http://localhost:3000/present/post?theme=default.theme.json&slide=0', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const pos = await page.evaluate(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), cx: Math.round(r.x+r.width/2) }; };
    const exp = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Export');
    const counter = [...document.querySelectorAll('span')].find(s => /^\d+ \/ \d+$/.test(s.textContent.trim()));
    return { exportBtn: exp ? rect(exp) : null, counter: counter ? rect(counter) : null };
  });
  const overlap = pos.exportBtn && pos.counter && pos.exportBtn.x + pos.exportBtn.w > pos.counter.x;
  console.log(`W=${w}`, JSON.stringify(pos), 'OVERLAP:', overlap);
  await page.close();
}
await browser.close();
