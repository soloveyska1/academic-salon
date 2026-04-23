import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch (_) {} });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:4321/', { waitUntil: 'load' });

/* Inspect via CDP which rules match and which one wins */
const cdp = await ctx.newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');
const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.prelude-actions .btn.btn-gold' });
if (nodeIds.length === 0) {
  console.log('No .btn-gold found');
} else {
  const { matchedCSSRules, inherited } = await cdp.send('CSS.getMatchedStylesForNode', { nodeId: nodeIds[0] });
  const relevant = matchedCSSRules.map(m => ({
    selector: m.rule.selectorList?.text,
    props: (m.rule.style?.cssProperties || [])
      .filter(p => /color|background|border/.test(p.name))
      .map(p => ({ name: p.name, value: p.value, important: p.important })),
  })).filter(r => r.props && r.props.length);
  console.log('--- .btn-gold matched rules (in order) ---');
  console.log(JSON.stringify(relevant, null, 2));
}
await browser.close();
