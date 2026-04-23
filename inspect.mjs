import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto('http://127.0.0.1:4321/doc/files/%D0%94%D0%BE%D0%BA%D0%BB%D0%B0%D0%B4%20%D0%BA%20%D0%92%D0%9A%D0%A0%20%D0%BE%20%D1%81%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B9%20%D0%B0%D0%B4%D0%B0%D0%BF%D1%82%D0%B0%D1%86%D0%B8%D0%B8%20%D0%B4%D0%B5%D1%82%D0%B5%D0%B9-%D1%81%D0%B8%D1%80%D0%BE%D1%82.docx', { waitUntil: 'networkidle' });

const info = await page.evaluate(() => {
  const btn = document.querySelector('.doc-folio a.btn-gold[download]');
  if (!btn) return { found: false };
  const s = getComputedStyle(btn);
  const rect = btn.getBoundingClientRect();
  return {
    found: true,
    text: btn.textContent.trim().slice(0, 60),
    display: s.display,
    visibility: s.visibility,
    opacity: s.opacity,
    width: rect.width,
    height: rect.height,
    background: s.backgroundColor,
    color: s.color,
    borderColor: s.borderColor,
    childrenCount: btn.children.length,
    parentFlexDir: getComputedStyle(btn.parentElement).flexDirection,
    parentFlexWrap: getComputedStyle(btn.parentElement).flexWrap,
    parentWidth: btn.parentElement.getBoundingClientRect().width,
    innerHTML: btn.innerHTML.slice(0, 200),
  };
});
console.log(JSON.stringify(info, null, 2));

/* Also check title color */
const title = await page.evaluate(() => {
  const h = document.querySelector('.doc-title');
  if (!h) return null;
  const s = getComputedStyle(h);
  return { color: s.color, fontFamily: s.fontFamily, fontSize: s.fontSize };
});
console.log('TITLE:', JSON.stringify(title));

await browser.close();
