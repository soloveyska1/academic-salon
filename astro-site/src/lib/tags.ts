/**
 * Tag-page helpers.
 *
 * The catalog stores tags in a free-form way ("Возрастная психология",
 * "1 курс", "СамостоятельнаяРабота", …) so the same conceptual tag
 * appears in 3-5 spellings. We normalise (trim, `_` → ` `, collapse
 * whitespace, casefold the lookup key) and merge duplicates before
 * deciding which tags become landing pages.
 *
 * Editorial decisions:
 *   - Tags duplicating an existing subject or category are skipped
 *     (subject hubs already cover those — duplicate landings dilute SEO).
 *   - Tags appearing on fewer than MIN_DOCS works are skipped
 *     (thin pages would just be wasted crawl budget).
 *   - A blacklist filters internal/admin labels ("СПбГИПСР",
 *     "30 баллов", "СР", …) that aren't useful for visitors.
 *
 * Slugs are transliterated cyrillic → latin so the URL stays readable
 * (`/tag/vozrastnaya-psihologiya/` vs `%D0%92%D0%BE…`).
 */

import { D } from '../data/catalog.js';
import { getAllSubjects } from './subjects';

const MIN_DOCS = 3;

const BLACKLIST = new Set<string>([
  // Internal admin labels — useful for librarians, not for visitors.
  'спбгипср',
  'спб гипср',
  '30 баллов',
  '30баллов',
  '30_баллов',
  '25 баллов',
  '25баллов',
  'ср',
  // Misc noise.
  'другое',
  'общее',
  // Already a category (catalog tabs cover those — no need to also
  // landing on a tag page).
  'вкр',
  'реферат',
  'эссе',
  'конспект',
  'конспекты',
  'конспекты лекций',
  'курсовая',
  'курсовая работа',
  'контрольная',
  'контрольная работа',
  'отчет',
  'отчёт',
  'отчет по практике',
  'отчёт по практике',
  'отчет о научно-практической работе',
  'отчёт о научно-практической работе',
  'нпр',
  'самостоятельная работа',
  'самостоятельные работы',
  'выпускная квалификационная работа',
  'экзаменационные материалы',
  'экзаменационный материал',
  'методические материалы',
  'методический материал',
  'справочный материал',
  'справочник',
  'учебный документ',
]);

const BLACKLIST_PATTERNS: RegExp[] = [
  // Admin-only suffix from the librarian workflow: "1курсадминистрация",
  // "СамостоятельнаяРаботаадминистрация", …
  /администрац/i,
  /^административ/i,
];

/**
 * Slug-level blacklist for typos that survive `normalizeTag` because they
 * mix latin/cyrillic look-alikes (e.g. "Сamostoyatelnaya" with a latin
 * lead "C" in the source data — looks identical to the Cyrillic С).
 */
const BLACKLIST_SLUGS = new Set<string>([
  'camostoyatelnaya-rabota',
]);

// Tags that mirror category names (we already have category chips in
// catalog and a separate subject hub, so a tag landing would duplicate).
// Resolved at runtime against actual subject/category sets.

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function transliterate(s: string): string {
  return Array.from(s.toLowerCase())
    .map((ch) => (ch in CYRILLIC_MAP ? CYRILLIC_MAP[ch] : ch))
    .join('');
}

export function tagSlug(name: string): string {
  return transliterate(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function normalizeTag(raw: string): { display: string; key: string } | null {
  if (!raw) return null;
  let cleaned = String(raw)
    .replace(/_/g, ' ')
    // Split digits glued to cyrillic letters: "1курс" → "1 курс"
    .replace(/(\d)([а-яё])/giu, '$1 $2')
    .replace(/([а-яё])(\d)/giu, '$1 $2')
    // CamelCase cyrillic split: "СамостоятельнаяРабота" → "Самостоятельная Работа"
    .replace(/([а-яё])([А-ЯЁ])/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  // Title-case the display so re-merged variants ("1курс", "1 КУРС",
  // "1 курс") render identically.
  const display = cleaned
    .toLowerCase()
    .replace(/(^|\s)([а-яёa-z])/gu, (_, sep, ch) => sep + ch.toUpperCase());
  return {
    display,
    key: cleaned.toLowerCase(),
  };
}

export interface TagMeta {
  slug: string;
  /** Display name — first-seen capitalisation among the duplicates. */
  name: string;
  /** Lowercase canonical key used to merge spelling variants. */
  key: string;
  count: number;
}

let cachedTags: TagMeta[] | null = null;
let cachedDocsByTag: Map<string, any[]> | null = null;

function buildIndex() {
  if (cachedTags && cachedDocsByTag) return;

  const subjectKeys = new Set(getAllSubjects().map((s) => s.name.toLowerCase()));
  const categoryKeys = new Set<string>();
  for (const doc of D as any[]) {
    if (doc.category) categoryKeys.add(String(doc.category).toLowerCase());
  }

  const buckets = new Map<string, { display: string; docs: any[] }>();

  for (const doc of D as any[]) {
    if (!Array.isArray(doc.tags)) continue;
    const seenInDoc = new Set<string>();
    for (const raw of doc.tags) {
      const norm = normalizeTag(raw);
      if (!norm) continue;
      if (seenInDoc.has(norm.key)) continue;
      seenInDoc.add(norm.key);
      if (BLACKLIST.has(norm.key)) continue;
      if (BLACKLIST_PATTERNS.some((re) => re.test(norm.key))) continue;
      if (subjectKeys.has(norm.key)) continue;
      if (categoryKeys.has(norm.key)) continue;

      const bucket = buckets.get(norm.key);
      if (bucket) {
        bucket.docs.push(doc);
      } else {
        buckets.set(norm.key, { display: norm.display, docs: [doc] });
      }
    }
  }

  const slugSeen = new Map<string, string>();
  const tags: TagMeta[] = [];
  const docsByTag = new Map<string, any[]>();

  for (const [key, { display, docs }] of buckets) {
    if (docs.length < MIN_DOCS) continue;

    let slug = tagSlug(display);
    if (!slug) continue;
    if (BLACKLIST_SLUGS.has(slug)) continue;
    // Disambiguate slug collisions ("Психотерапия" / "психо-терапия" → same slug)
    if (slugSeen.has(slug) && slugSeen.get(slug) !== key) {
      slug = `${slug}-${key.length}`;
    }
    slugSeen.set(slug, key);

    tags.push({ slug, name: display, key, count: docs.length });
    docsByTag.set(slug, docs);
  }

  tags.sort((a, b) => b.count - a.count);
  cachedTags = tags;
  cachedDocsByTag = docsByTag;
}

export function getAllTags(): TagMeta[] {
  buildIndex();
  return cachedTags!;
}

export function getDocsForTagSlug(slug: string): any[] {
  buildIndex();
  return cachedDocsByTag!.get(slug) || [];
}

export function getTagBySlug(slug: string): TagMeta | undefined {
  buildIndex();
  return cachedTags!.find((t) => t.slug === slug);
}
