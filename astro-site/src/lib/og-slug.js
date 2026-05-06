/**
 * Stable, filesystem-safe slug for per-doc OG images.
 *
 * Cyrillic doc paths URL-encode into 200+ byte strings that blow past
 * the 255-byte ext4 filename limit. We hash to a 16-hex prefix instead:
 * collision space ~1.8 × 10^19, so for our 235 docs the chance of a
 * collision is effectively zero.
 *
 * Same helper used by:
 *   - astro-site/scripts/build-og.mjs (writes dist/og/<slug>.png)
 *   - astro-site/src/pages/doc/[...slug].astro (refs /og/<slug>.png)
 */
import { createHash } from 'node:crypto';

export function getOgSlug(file) {
  return createHash('sha1').update(String(file || '')).digest('hex').slice(0, 16);
}
