/**
 * JSON-LD helpers for Astro pages.
 * Schemas added to the page via <Base extraSchema={...}> are emitted as
 * <script type="application/ld+json"> inside <head> (see Base.astro).
 */

const SITE = 'https://bibliosaloon.ru';

export interface BreadcrumbStep {
  name: string;
  /** Path beginning with /, or full URL. Last step is usually the current page. */
  url: string;
}

/** Build a Schema.org BreadcrumbList. Always prepends "Главная". */
export function breadcrumb(steps: BreadcrumbStep[]) {
  const trail: BreadcrumbStep[] = [{ name: 'Главная', url: '/' }, ...steps];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: step.url.startsWith('http') ? step.url : `${SITE}${step.url}`,
    })),
  };
}
