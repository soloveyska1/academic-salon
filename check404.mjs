import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const four04 = [];
page.on('response', (res) => {
  if (res.status() === 404) four04.push(res.url());
});
await page.goto('http://127.0.0.1:4321/doc/files/%D0%94%D0%BE%D0%BA%D0%BB%D0%B0%D0%B4%20%D0%BA%20%D0%92%D0%9A%D0%A0%20%D0%BE%20%D1%81%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B9%20%D0%B0%D0%B4%D0%B0%D0%BF%D1%82%D0%B0%D1%86%D0%B8%D0%B8%20%D0%B4%D0%B5%D1%82%D0%B5%D0%B9-%D1%81%D0%B8%D1%80%D0%BE%D1%82.docx', { waitUntil: 'networkidle' });
console.log('404 URLs:', four04);

/* Home — CLS img without dim */
await page.goto('http://127.0.0.1:4321/', { waitUntil: 'networkidle' });
const imgs = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img')).filter(img => {
    if (img.loading === 'lazy') return false;
    return !img.width || !img.height;
  }).map(img => ({ src: img.src.slice(0, 80), alt: img.alt, class: img.className.slice(0, 60), loading: img.loading }));
});
console.log('CLS imgs:', JSON.stringify(imgs, null, 2));

await browser.close();
