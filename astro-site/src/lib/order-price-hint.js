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

// ──────────────────────────────────────────────────────────────────
// ANTI-AI — Антиплагиат 2.0 cleanup
// ──────────────────────────────────────────────────────────────────
// Отдельная услуга, не каталоговая работа. Чистим текст клиента под
// детектор «привычек ИИ» (длинное тире, академические штампы,
// ритм фраз — Антиплагиат 2.0, апрель 2026). У сервиса собственная
// прайс-шкала: tier (объём) × urgency (срочность как множитель).
//
// Множитель — намеренно: ×1.5 платится психологически легче, чем
// «+3 000 ₽», и линейно масштабирует профит на больших работах.
//
// Профит-якорь: ВКР standard 6 500 ₽ ≈ 1 800 ₽/час квалифицированной
// правки (3–4 часа на 60 стр.). Срочно ×1.5 = ≈3 000 ₽/час.
//
// Эта матрица — единственный источник истины; UI калькулятора
// (Phase 2) и /anti-ai landing (Phase 3) её и читают.
// ──────────────────────────────────────────────────────────────────

export const ANTI_AI_TIERS = {
  small:  { label: 'Эссе · реферат · контрольная', pages: 'до 15 стр.', basePrice: 2500 },
  medium: { label: 'Курсовая · отчёт по практике', pages: '15–40 стр.', basePrice: 4500 },
  large:  { label: 'ВКР · диплом',                 pages: '40–80 стр.', basePrice: 6500 },
  xl:     { label: 'Магистерская · большая ВКР',   pages: '80+ стр.',   basePrice: 8500 },
};

export const ANTI_AI_URGENCIES = {
  // Все уровни срочности доступны для всех объёмов: за деньги — можем всё.
  // Магистерская за три часа — это ×3 от базы и команда из нескольких
  // редакторов, но физически выполнимо. Клиент берёт на себя стоимость,
  // мы — гарантию срока.
  standard:  { label: 'Стандарт',  desc: '3–5 дней',   multiplier: 1.0,
               allowedTiers: ['small', 'medium', 'large', 'xl'] },
  urgent:    { label: 'Срочно',    desc: 'за 24 часа', multiplier: 1.5,
               allowedTiers: ['small', 'medium', 'large', 'xl'] },
  express:   { label: 'Экспресс',  desc: '12 часов',   multiplier: 2.0,
               allowedTiers: ['small', 'medium', 'large', 'xl'] },
  lightning: { label: 'Молния',    desc: '3 часа',     multiplier: 3.0,
               allowedTiers: ['small', 'medium', 'large', 'xl'] },
};

/**
 * Финальная цена anti-ai в рублях, либо null если комбо tier/urgency
 * не разрешено (например, xl + lightning).
 * @param {keyof typeof ANTI_AI_TIERS} tier
 * @param {keyof typeof ANTI_AI_URGENCIES} urgency
 * @returns {number | null}
 */
export function getAntiAiPrice(tier, urgency) {
  const tierMeta = ANTI_AI_TIERS[tier];
  const urgencyMeta = ANTI_AI_URGENCIES[urgency];
  if (!tierMeta || !urgencyMeta) return null;
  if (!urgencyMeta.allowedTiers.includes(tier)) return null;
  return Math.round(tierMeta.basePrice * urgencyMeta.multiplier);
}

/**
 * Готовая строка цены для UI: "6 500 ₽". null — если комбо невалидно.
 * @param {keyof typeof ANTI_AI_TIERS} tier
 * @param {keyof typeof ANTI_AI_URGENCIES} urgency
 * @returns {string | null}
 */
export function formatAntiAiPrice(tier, urgency) {
  const price = getAntiAiPrice(tier, urgency);
  if (price == null) return null;
  return formatRub(price);
}

/**
 * «От 2 500 ₽» — для CTA на главной / на /doc/[slug] / в навигации.
 * Берёт минимальную цену из всей матрицы (small + standard).
 * @returns {string}
 */
export function getAntiAiEntryHint() {
  return 'от ' + formatRub(ANTI_AI_TIERS.small.basePrice);
}
