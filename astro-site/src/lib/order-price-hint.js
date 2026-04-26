// Map a catalog doc's `docType` to the matching pill on /order — and the
// minimum price for that tier. Used by the catalog card and /doc/[slug]
// to surface "от 14 000 ₽" affordances + deep-link "Заказать похожую"
// to /order with type/topic/subject pre-filled.
//
// Mirrors the price table in pages/order.astro line ~2803. If you change
// either, change the other.

const PRICE_BY_TYPE = {
  ref:      2500,
  kont:     2500,
  doklad:   2500,
  practice: 14000,
  kurs_t:   14000,
  kurs_e:   20000,
  diplom:   45000,
  magist:   60000,
};

// Catalog docType → /order pill value. Unlisted types return null
// (we don't render a price chip — would be misleading).
const DOC_TYPE_TO_ORDER = {
  'Реферат':                                 'ref',
  'Эссе':                                    'ref',
  'Самостоятельная работа':                  'ref',
  'Конспект':                                'ref',
  'Доклад':                                  'doklad',
  'Контрольная работа':                      'kont',
  'Практическое задание':                    'kont',
  'Курсовая работа':                         'kurs_t',
  'Отчет о научно-практической работе':      'kurs_t',
  'Отчет по практике':                       'practice',
  'Выпускная квалификационная работа':       'diplom',
};

function formatRub(amount) {
  // 14000 → "14 000 ₽" (NBSP between hundreds and currency for line-break safety)
  return amount.toLocaleString('ru-RU').replace(/ |,| /g, ' ') + ' ₽';
}

/**
 * @param {string|undefined|null} docType
 * @returns {{orderType: string, basePrice: number, label: string} | null}
 */
export function getOrderPriceHint(docType) {
  if (!docType) return null;
  const orderType = DOC_TYPE_TO_ORDER[docType];
  if (!orderType) return null;
  const basePrice = PRICE_BY_TYPE[orderType];
  if (!basePrice) return null;
  return {
    orderType,
    basePrice,
    label: 'от ' + formatRub(basePrice),
  };
}

/**
 * Build the deep-link URL to /order with type / topic / subject pre-filled.
 * The pre-fill logic in /order.astro line ~2929 already understands these
 * three params.
 */
export function buildOrderHintHref(doc) {
  const hint = getOrderPriceHint(doc?.docType);
  if (!hint) return null;
  const qs = new URLSearchParams();
  qs.set('type', hint.orderType);
  if (doc.subject) qs.set('subject', doc.subject);
  // Use the doc's title as a topic seed — easier for the user to keep
  // (vs the verbose catalogTitle).
  const topic = doc.title || doc.catalogTitle || '';
  if (topic) qs.set('topic', topic);
  return '/order?' + qs.toString();
}
