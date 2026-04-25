/**
 * Reports Core Web Vitals (LCP / CLS / INP / FCP / TTFB) to Yandex.Metrika
 * as parametrised events. Numbers stream into the Метрика "events" tab
 * and can be filtered by page / user-agent / region just like any other
 * goal — no separate dashboard required.
 *
 * Each metric is rounded so the goal value stays an integer:
 *   - CLS multiplied by 1000 (0.103 → 103)
 *   - LCP / INP / FCP / TTFB rounded to whole milliseconds
 *
 * The web-vitals callback fires once per metric per page-load (via
 * onCLS/onLCP/onINP/onFCP/onTTFB), so we won't double-report.
 *
 * Bundle cost: ~3 KB gzip; loaded behind requestIdleCallback so it never
 * competes with the actual paint.
 */
import type { Metric } from 'web-vitals';

const METRIKA_ID = 108363627;

type YmFn = (id: number, action: string, goal: string, params?: Record<string, unknown>) => void;
declare global {
  interface Window {
    ym?: YmFn;
  }
}

function reportToMetrika({ name, value, rating, navigationType, id }: Metric) {
  if (typeof window.ym !== 'function') return;

  const goal = `web_vitals_${name.toLowerCase()}`;
  const intValue = name === 'CLS' ? Math.round(value * 1000) : Math.round(value);

  window.ym(METRIKA_ID, 'reachGoal', goal, {
    value: intValue,
    rating,             // 'good' | 'needs-improvement' | 'poor'
    navigation: navigationType,
    metric_id: id,      // unique per page-load — useful for joining
    path: location.pathname,
  });
}

let booted = false;

export async function bootWebVitals() {
  if (booted) return;
  booted = true;

  const { onCLS, onLCP, onINP, onFCP, onTTFB } = await import('web-vitals');
  onCLS(reportToMetrika);
  onLCP(reportToMetrika);
  onINP(reportToMetrika);
  onFCP(reportToMetrika);
  onTTFB(reportToMetrika);
}
